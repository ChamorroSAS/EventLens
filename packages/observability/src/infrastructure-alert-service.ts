import {
  AlertSeverity,
  AvailabilityMeasurement,
  AvailabilityProbe,
  BackupExecutionSignal,
  HealthSignal,
  InfrastructureAlert,
  InfrastructureComponent,
  InfrastructureThresholdConfig,
  PurgeExecutionSignal,
  SchedulerHeartbeat
} from './contracts.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';
import { TelemetryService } from './telemetry-service.js';

const DEFAULT_CONFIG: Required<InfrastructureThresholdConfig> = {
  maxSchedulerStallSeconds: 300, // 5 minutes
  minAvailabilityRatio: 0.995 // 99.5% operational objective (DEC-034, DEC-106)
};

export class InfrastructureAlertService {
  private readonly config: Required<InfrastructureThresholdConfig>;
  private readonly sanitizer: TelemetrySanitizer;
  private readonly alerts = new Map<string, InfrastructureAlert>();
  private readonly heartbeats = new Map<string, SchedulerHeartbeat>();
  private readonly availabilityProbes: AvailabilityProbe[] = [];

  constructor(
    private readonly telemetryService?: TelemetryService,
    config?: InfrastructureThresholdConfig,
    sanitizer?: TelemetrySanitizer
  ) {
    this.config = {
      maxSchedulerStallSeconds:
        config?.maxSchedulerStallSeconds ?? DEFAULT_CONFIG.maxSchedulerStallSeconds,
      minAvailabilityRatio:
        config?.minAvailabilityRatio ?? DEFAULT_CONFIG.minAvailabilityRatio
    };
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  /**
   * Evaluates component health signals (e.g. DATABASE, OBJECT_STORAGE, API)
   * Triggers or updates operational alerts on DEGRADED or UNHEALTHY signals,
   * and resolves active alerts when healthy.
   */
  public evaluateComponentHealth(signal: HealthSignal): InfrastructureAlert | undefined {
    const comp = signal.component as InfrastructureComponent;
    const alertId = `infrastructure:${signal.component.toLowerCase()}`;

    if (signal.status === 'UNHEALTHY' || signal.status === 'DEGRADED') {
      const severity: AlertSeverity = signal.status === 'UNHEALTHY' ? 'CRITICAL' : 'WARNING';
      const name = `infrastructure.${signal.component.toLowerCase()}_${signal.status.toLowerCase()}`;
      const defaultMsg = `${signal.component} is currently ${signal.status}`;
      const rawMsg = signal.message ?? defaultMsg;

      const alert = this.triggerOrUpdateAlert(
        alertId,
        name,
        comp,
        severity,
        rawMsg,
        signal.latencyMs,
        undefined,
        signal.dimensions
      );

      if (this.telemetryService) {
        this.telemetryService.emitMetric('infrastructure.alert.triggered', 'COUNTER', 1, 'count', {
          component: signal.component,
          severity
        });
      }

      return alert;
    }

    if (signal.status === 'HEALTHY') {
      this.resolveAlertIfActive(alertId);
    }

    return undefined;
  }

  /**
   * Records a scheduler task heartbeat checkpoint.
   */
  public recordSchedulerHeartbeat(heartbeat: SchedulerHeartbeat): void {
    this.heartbeats.set(heartbeat.taskName, heartbeat);
  }

  /**
   * Evaluates registered scheduler heartbeats for stalled tasks.
   * If checkpoint age exceeds threshold, generates CRITICAL alert.
   */
  public evaluateSchedulerStall(now: Date = new Date()): InfrastructureAlert[] {
    const triggered: InfrastructureAlert[] = [];

    for (const [taskName, heartbeat] of this.heartbeats.entries()) {
      const alertId = `infrastructure:scheduler:${taskName}`;
      const stalledSeconds = (now.getTime() - heartbeat.lastCheckpointAt.getTime()) / 1000;
      const thresholdSeconds = Math.max(
        heartbeat.intervalSeconds * 2.5,
        this.config.maxSchedulerStallSeconds
      );

      if (stalledSeconds > thresholdSeconds) {
        const alert = this.triggerOrUpdateAlert(
          alertId,
          'infrastructure.scheduler_stalled',
          'SCHEDULER',
          'CRITICAL',
          `Scheduler task '${taskName}' stalled: last checkpoint was ${Math.round(stalledSeconds)}s ago (threshold: ${thresholdSeconds}s)`,
          Math.round(stalledSeconds),
          thresholdSeconds,
          { taskName }
        );
        triggered.push(alert);

        if (this.telemetryService) {
          this.telemetryService.emitMetric('infrastructure.alert.triggered', 'COUNTER', 1, 'count', {
            component: 'SCHEDULER',
            severity: 'CRITICAL',
            taskName
          });
        }
      } else {
        this.resolveAlertIfActive(alertId);
      }
    }

    return triggered;
  }

  /**
   * Records an availability probe for health / request outcomes.
   */
  public recordAvailabilityProbe(probe: AvailabilityProbe): void {
    this.availabilityProbes.push(probe);
    if (this.availabilityProbes.length > 10000) {
      this.availabilityProbes.shift();
    }
  }

  /**
   * Computes availability over an observation window and alerts if degraded below
   * the operational objective (99.5% per DEC-034 / DEC-106; non-SLA).
   */
  public evaluateAvailability(windowMs: number = 3600000, now: Date = new Date()): AvailabilityMeasurement {
    const windowStart = new Date(now.getTime() - windowMs);
    const windowEnd = now;

    const probesInWindow = this.availabilityProbes.filter(
      (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd
    );

    const totalProbes = probesInWindow.length;
    const successfulProbes = probesInWindow.filter((p) => p.success).length;
    const failedProbes = totalProbes - successfulProbes;
    const observedRatio = totalProbes === 0 ? 1 : successfulProbes / totalProbes;
    const targetObjectiveRatio = this.config.minAvailabilityRatio;
    const isObjectiveMet = observedRatio >= targetObjectiveRatio;

    const componentsEvaluated = Array.from(new Set(probesInWindow.map((p) => p.component)));

    const measurement: AvailabilityMeasurement = {
      totalProbes,
      successfulProbes,
      failedProbes,
      observedAvailabilityRatio: Math.round(observedRatio * 10000) / 10000,
      targetObjectiveRatio,
      isObjectiveMet,
      isSlaContractual: false, // Explicitly non-SLA per DEC-034
      windowStart,
      windowEnd,
      componentsEvaluated
    };

    const alertId = 'infrastructure:availability_degraded';

    if (totalProbes >= 5 && !isObjectiveMet) {
      this.triggerOrUpdateAlert(
        alertId,
        'infrastructure.availability_degraded',
        'AVAILABILITY',
        'CRITICAL',
        `Observed availability ${(observedRatio * 100).toFixed(2)}% degraded below operational objective ${(targetObjectiveRatio * 100).toFixed(2)}% (non-SLA)`,
        Math.round(observedRatio * 10000) / 10000,
        targetObjectiveRatio,
        { totalProbes, failedProbes }
      );

      if (this.telemetryService) {
        this.telemetryService.emitMetric('infrastructure.alert.triggered', 'COUNTER', 1, 'count', {
          component: 'AVAILABILITY',
          severity: 'CRITICAL'
        });
      }
    } else if (isObjectiveMet) {
      this.resolveAlertIfActive(alertId);
    }

    if (this.telemetryService) {
      this.telemetryService.emitMetric(
        'infrastructure.availability.ratio',
        'GAUGE',
        measurement.observedAvailabilityRatio,
        'ratio'
      );
    }

    return measurement;
  }

  /**
   * Consumes retention purge and log rotation failure signals (EL-TK-184).
   */
  public handlePurgeSignal(signal: PurgeExecutionSignal): InfrastructureAlert | undefined {
    const alertId = `infrastructure:purge:${signal.task.toLowerCase()}`;

    if (signal.status === 'FAILURE') {
      const comp: InfrastructureComponent = signal.task === 'AUDIT_RETENTION' ? 'DATABASE' : 'BACKEND';
      const rawMsg = signal.errorMessage ?? `Purge execution failed for ${signal.task}`;

      const alert = this.triggerOrUpdateAlert(
        alertId,
        'infrastructure.purge_failed',
        comp,
        'WARNING',
        rawMsg,
        signal.itemsPurged,
        undefined,
        { task: signal.task }
      );

      if (this.telemetryService) {
        this.telemetryService.emitMetric('infrastructure.alert.triggered', 'COUNTER', 1, 'count', {
          component: comp,
          severity: 'WARNING',
          task: signal.task
        });
      }

      return alert;
    }

    if (signal.status === 'SUCCESS') {
      this.resolveAlertIfActive(alertId);
    }

    return undefined;
  }

  /**
   * Consumes PostgreSQL backup execution failure signals (EL-TK-171).
   */
  public handleBackupSignal(signal: BackupExecutionSignal): InfrastructureAlert | undefined {
    const alertId = 'infrastructure:backup:postgres';

    if (signal.status === 'FAILURE') {
      const rawMsg = signal.errorMessage ?? `PostgreSQL backup execution failed for run ${signal.runId}`;

      const alert = this.triggerOrUpdateAlert(
        alertId,
        'infrastructure.postgres_backup_failed',
        'DATABASE',
        'CRITICAL',
        rawMsg,
        signal.durationMs,
        undefined,
        { runId: signal.runId, backupType: signal.backupType }
      );

      if (this.telemetryService) {
        this.telemetryService.emitMetric('infrastructure.alert.triggered', 'COUNTER', 1, 'count', {
          component: 'DATABASE',
          severity: 'CRITICAL',
          task: 'POSTGRES_BACKUP'
        });
      }

      return alert;
    }

    if (signal.status === 'SUCCESS') {
      this.resolveAlertIfActive(alertId);
    }

    return undefined;
  }

  public getActiveAlerts(component?: InfrastructureComponent): InfrastructureAlert[] {
    return Array.from(this.alerts.values()).filter(
      (a) => a.status === 'ACTIVE' && (!component || a.component === component)
    );
  }

  public getAllAlerts(): InfrastructureAlert[] {
    return Array.from(this.alerts.values());
  }

  public clear(): void {
    this.alerts.clear();
    this.heartbeats.clear();
    this.availabilityProbes.length = 0;
  }

  private triggerOrUpdateAlert(
    id: string,
    name: string,
    component: InfrastructureComponent,
    severity: AlertSeverity,
    message: string,
    currentValue?: number,
    thresholdValue?: number,
    dimensions?: Record<string, string | number | boolean>
  ): InfrastructureAlert {
    const existing = this.alerts.get(id);
    const now = new Date();
    const sanitizedMsg = this.sanitizer.sanitizeMessage(message) ?? message;
    const sanitizedDims = dimensions ? this.sanitizer.sanitizeDimensions(dimensions) : undefined;

    if (existing && existing.status === 'ACTIVE') {
      existing.lastTriggeredAt = now;
      existing.severity = severity;
      existing.message = sanitizedMsg;
      existing.currentValue = currentValue;
      existing.thresholdValue = thresholdValue;
      if (sanitizedDims) {
        existing.dimensions = { ...existing.dimensions, ...sanitizedDims };
      }
      return existing;
    }

    const newAlert: InfrastructureAlert = {
      id,
      name,
      component,
      severity,
      status: 'ACTIVE',
      message: sanitizedMsg,
      currentValue,
      thresholdValue,
      dimensions: sanitizedDims,
      firstTriggeredAt: now,
      lastTriggeredAt: now
    };

    this.alerts.set(id, newAlert);
    return newAlert;
  }

  private resolveAlertIfActive(id: string): void {
    const existing = this.alerts.get(id);
    if (existing && existing.status === 'ACTIVE') {
      existing.status = 'RESOLVED';
      existing.resolvedAt = new Date();
    }
  }
}
