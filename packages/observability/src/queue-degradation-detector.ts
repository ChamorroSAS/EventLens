import type { TransactionRunner } from '@eventlens/database';
import {
  AlertSeverity,
  OperationalAlert,
  QueueSnapshot,
  QueueThresholdConfig
} from './contracts.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';
import { TelemetryService } from './telemetry-service.js';

const DEFAULT_CONFIG: Required<QueueThresholdConfig> = {
  maxDepthWarning: 50,
  maxDepthCritical: 200,
  maxAgeSecondsWarning: 300,
  maxAgeSecondsCritical: 900,
  maxRetriesThreshold: 3,
  abandonedLeaseGraceSeconds: 60
};

interface RawQueueMetricsRow {
  pending_depth: string | number;
  oldest_pending_age_seconds: string | number;
  processing_count: string | number;
  abandoned_count: string | number;
  dead_count: string | number;
  high_retry_count: string | number;
}

export class QueueDegradationDetector {
  private readonly config: Required<QueueThresholdConfig>;
  private readonly sanitizer: TelemetrySanitizer;
  private readonly alerts = new Map<string, OperationalAlert>();

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly telemetryService?: TelemetryService,
    config?: QueueThresholdConfig,
    sanitizer?: TelemetrySanitizer
  ) {
    this.config = {
      maxDepthWarning: config?.maxDepthWarning ?? DEFAULT_CONFIG.maxDepthWarning,
      maxDepthCritical: config?.maxDepthCritical ?? DEFAULT_CONFIG.maxDepthCritical,
      maxAgeSecondsWarning: config?.maxAgeSecondsWarning ?? DEFAULT_CONFIG.maxAgeSecondsWarning,
      maxAgeSecondsCritical: config?.maxAgeSecondsCritical ?? DEFAULT_CONFIG.maxAgeSecondsCritical,
      maxRetriesThreshold: config?.maxRetriesThreshold ?? DEFAULT_CONFIG.maxRetriesThreshold,
      abandonedLeaseGraceSeconds:
        config?.abandonedLeaseGraceSeconds ?? DEFAULT_CONFIG.abandonedLeaseGraceSeconds
    };
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  public async inspectQueue(queueName: string): Promise<QueueSnapshot> {
    const rows = await this.transactions.run(async (tx) => {
      return tx.query<RawQueueMetricsRow>(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'PENDING' AND cancelled = false) as pending_depth,
          COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(available_at) FILTER (WHERE status = 'PENDING' AND available_at <= NOW() AND cancelled = false))), 0) as oldest_pending_age_seconds,
          COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing_count,
          COUNT(*) FILTER (WHERE status = 'PROCESSING' AND lease_until < (NOW() - ($2 || ' seconds')::interval)) as abandoned_count,
          COUNT(*) FILTER (WHERE status = 'DEAD') as dead_count,
          COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING') AND attempt >= $3 AND cancelled = false) as high_retry_count
        FROM job_queue
        WHERE queue = $1`,
        queueName,
        this.config.abandonedLeaseGraceSeconds,
        this.config.maxRetriesThreshold
      );
    });

    const row = rows[0] ?? {
      pending_depth: 0,
      oldest_pending_age_seconds: 0,
      processing_count: 0,
      abandoned_count: 0,
      dead_count: 0,
      high_retry_count: 0
    };

    const snapshot: QueueSnapshot = {
      queue: queueName,
      pendingDepth: Number(row.pending_depth) || 0,
      oldestPendingAgeSeconds: Math.max(0, Math.round(Number(row.oldest_pending_age_seconds) || 0)),
      processingCount: Number(row.processing_count) || 0,
      abandonedCount: Number(row.abandoned_count) || 0,
      deadCount: Number(row.dead_count) || 0,
      highRetryCount: Number(row.high_retry_count) || 0,
      timestamp: new Date()
    };

    // Emit operational metrics
    if (this.telemetryService) {
      this.telemetryService.emitMetric('job_queue.depth', 'GAUGE', snapshot.pendingDepth, 'count', {
        queue: queueName
      });
      this.telemetryService.emitMetric(
        'job_queue.oldest_age_seconds',
        'GAUGE',
        snapshot.oldestPendingAgeSeconds,
        'seconds',
        { queue: queueName }
      );
      this.telemetryService.emitMetric('job_queue.dead_count', 'GAUGE', snapshot.deadCount, 'count', {
        queue: queueName
      });
      this.telemetryService.emitMetric(
        'job_queue.abandoned_count',
        'GAUGE',
        snapshot.abandonedCount,
        'count',
        { queue: queueName }
      );
    }

    return snapshot;
  }

  public async evaluateDegradation(queueName: string): Promise<OperationalAlert[]> {
    const snapshot = await this.inspectQueue(queueName);
    const generatedAlerts: OperationalAlert[] = [];

    // 1. Queue depth check
    if (snapshot.pendingDepth >= this.config.maxDepthCritical) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.depth_critical',
          'CRITICAL',
          `Queue '${queueName}' pending depth is critical: ${snapshot.pendingDepth} jobs (threshold: ${this.config.maxDepthCritical})`,
          snapshot.pendingDepth,
          this.config.maxDepthCritical
        )
      );
    } else if (snapshot.pendingDepth >= this.config.maxDepthWarning) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.depth_warning',
          'WARNING',
          `Queue '${queueName}' pending depth is high: ${snapshot.pendingDepth} jobs (threshold: ${this.config.maxDepthWarning})`,
          snapshot.pendingDepth,
          this.config.maxDepthWarning
        )
      );
      this.resolveAlertIfActive(queueName, 'queue.depth_critical');
    } else {
      this.resolveAlertIfActive(queueName, 'queue.depth_critical');
      this.resolveAlertIfActive(queueName, 'queue.depth_warning');
    }

    // 2. Queue age check
    if (snapshot.oldestPendingAgeSeconds >= this.config.maxAgeSecondsCritical) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.age_critical',
          'CRITICAL',
          `Queue '${queueName}' oldest job age is critical: ${snapshot.oldestPendingAgeSeconds}s (threshold: ${this.config.maxAgeSecondsCritical}s)`,
          snapshot.oldestPendingAgeSeconds,
          this.config.maxAgeSecondsCritical
        )
      );
    } else if (snapshot.oldestPendingAgeSeconds >= this.config.maxAgeSecondsWarning) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.age_warning',
          'WARNING',
          `Queue '${queueName}' oldest job age is high: ${snapshot.oldestPendingAgeSeconds}s (threshold: ${this.config.maxAgeSecondsWarning}s)`,
          snapshot.oldestPendingAgeSeconds,
          this.config.maxAgeSecondsWarning
        )
      );
      this.resolveAlertIfActive(queueName, 'queue.age_critical');
    } else {
      this.resolveAlertIfActive(queueName, 'queue.age_critical');
      this.resolveAlertIfActive(queueName, 'queue.age_warning');
    }

    // 3. DEAD jobs check
    if (snapshot.deadCount > 0) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.dead_jobs',
          'CRITICAL',
          `Queue '${queueName}' has ${snapshot.deadCount} DEAD job(s) requiring operational intervention`,
          snapshot.deadCount,
          1
        )
      );
    } else {
      this.resolveAlertIfActive(queueName, 'queue.dead_jobs');
    }

    // 4. Abandoned jobs check
    if (snapshot.abandonedCount > 0) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.abandoned_jobs',
          'CRITICAL',
          `Queue '${queueName}' has ${snapshot.abandonedCount} abandoned PROCESSING job(s) with expired leases`,
          snapshot.abandonedCount,
          1
        )
      );
    } else {
      this.resolveAlertIfActive(queueName, 'queue.abandoned_jobs');
    }

    // 5. High retries check
    if (snapshot.highRetryCount > 0) {
      generatedAlerts.push(
        this.triggerOrUpdateAlert(
          queueName,
          'queue.high_retries',
          'WARNING',
          `Queue '${queueName}' has ${snapshot.highRetryCount} job(s) exceeding retry threshold (${this.config.maxRetriesThreshold})`,
          snapshot.highRetryCount,
          this.config.maxRetriesThreshold
        )
      );
    } else {
      this.resolveAlertIfActive(queueName, 'queue.high_retries');
    }

    // Emit aggregated health signal for the JOB_QUEUE component
    this.emitQueueHealthSignal(queueName, generatedAlerts);

    return generatedAlerts;
  }

  public getActiveAlerts(queue?: string): OperationalAlert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.status === 'ACTIVE' && (!queue || a.queue === queue)
    );
  }

  public getAllAlerts(): OperationalAlert[] {
    return Array.from(this.alerts.values());
  }

  private triggerOrUpdateAlert(
    queue: string,
    name: string,
    severity: AlertSeverity,
    message: string,
    currentValue: number,
    thresholdValue: number
  ): OperationalAlert {
    const alertId = `${queue}:${name}`;
    const existing = this.alerts.get(alertId);

    const now = new Date();
    if (existing && existing.status === 'ACTIVE') {
      // Deduplicate: do NOT create duplicate alert, update lastTriggeredAt
      existing.lastTriggeredAt = now;
      existing.currentValue = currentValue;
      existing.severity = severity;
      existing.message = this.sanitizer.sanitizeMessage(message) ?? message;
      return existing;
    }

    // Create fresh or rearmed active alert
    const newAlert: OperationalAlert = {
      id: alertId,
      name,
      severity,
      status: 'ACTIVE',
      queue,
      message: this.sanitizer.sanitizeMessage(message) ?? message,
      currentValue,
      thresholdValue,
      dimensions: this.sanitizer.sanitizeDimensions({
        queue,
        name,
        severity
      }),
      firstTriggeredAt: now,
      lastTriggeredAt: now
    };

    this.alerts.set(alertId, newAlert);
    return newAlert;
  }

  private resolveAlertIfActive(queue: string, name: string): void {
    const alertId = `${queue}:${name}`;
    const existing = this.alerts.get(alertId);

    if (existing && existing.status === 'ACTIVE') {
      existing.status = 'RESOLVED';
      existing.resolvedAt = new Date();
    }
  }

  private emitQueueHealthSignal(queue: string, activeAlerts: OperationalAlert[]): void {
    if (!this.telemetryService) {
      return;
    }

    const hasCritical = activeAlerts.some((a) => a.severity === 'CRITICAL');
    const hasWarning = activeAlerts.some((a) => a.severity === 'WARNING');

    const status = hasCritical ? 'UNHEALTHY' : hasWarning ? 'DEGRADED' : 'HEALTHY';
    const message = hasCritical
      ? `Queue '${queue}' in critical state: ${activeAlerts.map((a) => a.name).join(', ')}`
      : hasWarning
      ? `Queue '${queue}' degraded: ${activeAlerts.map((a) => a.name).join(', ')}`
      : `Queue '${queue}' processing normally`;

    this.telemetryService.emitHealthSignal({
      component: 'JOB_QUEUE',
      status,
      message,
      dimensions: {
        queue,
        activeAlertCount: activeAlerts.length
      },
      timestamp: new Date()
    });
  }
}
