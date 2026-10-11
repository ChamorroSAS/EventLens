import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { TransactionRunner } from '@eventlens/database';
import {
  AuditPurgeResult,
  AuditRetentionPolicy,
  LogRotationConfig,
  LogRotationResult,
  PurgeExecutionSignal
} from './contracts.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';
import { TelemetryService } from './telemetry-service.js';

const DEFAULT_AUDIT_RETENTION_DAYS = 365; // 12 months configurable
const DEFAULT_AUDIT_BATCH_SIZE = 500;

const DEFAULT_LOG_RETENTION_DAYS = 30; // 30 days configurable
const DEFAULT_LOG_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export class AuditRetentionService {
  private readonly sanitizer: TelemetrySanitizer;

  constructor(
    private readonly transactions: TransactionRunner,
    private readonly telemetryService?: TelemetryService,
    sanitizer?: TelemetrySanitizer
  ) {
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  public async purgeExpiredAuditEvents(policy?: AuditRetentionPolicy): Promise<AuditPurgeResult> {
    const retentionDays = policy?.retentionDays ?? DEFAULT_AUDIT_RETENTION_DAYS;
    const batchSize = policy?.batchSize ?? DEFAULT_AUDIT_BATCH_SIZE;
    const dryRun = policy?.dryRun ?? false;

    const start = Date.now();
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    let totalDeleted = 0;
    let batchCount = 0;

    try {
      if (dryRun) {
        const rows = await this.transactions.run(async (tx) => {
          return tx.query<{ count: string }>(
            `SELECT COUNT(*)::text as count FROM audit_event WHERE occurred_at < $1`,
            cutoffDate
          );
        });
        totalDeleted = parseInt(rows[0]?.count ?? '0', 10);
      } else {
        let hasMore = true;
        while (hasMore) {
          const deletedBatch = await this.transactions.run(async (tx) => {
            return tx.query<{ id: string }>(
              `WITH candidate_batch AS (
                SELECT id FROM audit_event
                WHERE occurred_at < $1
                ORDER BY occurred_at ASC
                LIMIT $2
              )
              DELETE FROM audit_event
              WHERE id IN (SELECT id FROM candidate_batch)
              RETURNING id`,
              cutoffDate,
              batchSize
            );
          });

          if (deletedBatch.length === 0) {
            break;
          }

          batchCount++;
          totalDeleted += deletedBatch.length;

          if (deletedBatch.length < batchSize) {
            hasMore = false;
          }
        }
      }

      const durationMs = Date.now() - start;

      // Telemetry emission
      if (this.telemetryService) {
        this.telemetryService.emitMetric(
          'audit.retention.purged_count',
          'COUNTER',
          totalDeleted,
          'count',
          { retentionDays, dryRun }
        );
        this.telemetryService.emitMetric(
          'audit.retention.duration_ms',
          'HISTOGRAM',
          durationMs,
          'ms',
          { dryRun }
        );
        this.telemetryService.emitHealthSignal({
          component: 'BACKEND',
          status: 'HEALTHY',
          message: `Audit retention completed: purged ${totalDeleted} expired record(s) in ${durationMs}ms`,
          dimensions: { totalDeleted, durationMs },
          timestamp: new Date()
        });
      }

      const signal: PurgeExecutionSignal = {
        task: 'AUDIT_RETENTION',
        status: 'SUCCESS',
        itemsPurged: totalDeleted,
        timestamp: new Date()
      };
      if (policy?.onSignal) {
        policy.onSignal(signal);
      }

      return {
        deletedCount: totalDeleted,
        cutoffDate,
        durationMs,
        batchCount,
        dryRun
      };
    } catch (err) {
      const errorMsg = this.sanitizer.sanitizeMessage(
        err instanceof Error ? err.message : String(err)
      );

      const failureSignal: PurgeExecutionSignal = {
        task: 'AUDIT_RETENTION',
        status: 'FAILURE',
        itemsPurged: totalDeleted,
        errorMessage: errorMsg,
        timestamp: new Date()
      };
      if (policy?.onSignal) {
        policy.onSignal(failureSignal);
      }

      if (this.telemetryService) {
        this.telemetryService.emitMetric(
          'audit.retention.failure_count',
          'COUNTER',
          1,
          'count',
          { task: 'AUDIT_RETENTION' }
        );
        this.telemetryService.emitHealthSignal({
          component: 'BACKEND',
          status: 'DEGRADED',
          message: `Audit retention purge failed: ${errorMsg}`,
          timestamp: new Date()
        });
      }

      throw new Error(`Audit retention purge failed: ${errorMsg}`);
    }
  }
}

export class TechnicalLogRotationService {
  private readonly sanitizer: TelemetrySanitizer;

  constructor(
    private readonly telemetryService?: TelemetryService,
    sanitizer?: TelemetrySanitizer
  ) {
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  public async rotateAndPurgeLogs(config: LogRotationConfig): Promise<LogRotationResult> {
    const maxRetentionDays = config.maxRetentionDays ?? DEFAULT_LOG_RETENTION_DAYS;
    const maxFileSizeBytes = config.maxFileSizeBytes ?? DEFAULT_LOG_MAX_FILE_BYTES;
    const logDir = config.logDirectory;

    const start = Date.now();
    const cutoffDate = new Date(Date.now() - maxRetentionDays * 24 * 60 * 60 * 1000);

    const rotatedFiles: string[] = [];
    const purgedFiles: string[] = [];
    let bytesReclaimed = 0;

    try {
      const entries = await readdir(logDir);

      // 1. Rotation phase: check active .log files exceeding size limit
      for (const entry of entries) {
        if (entry.endsWith('.log')) {
          const filePath = join(logDir, entry);
          const fileStat = await stat(filePath);

          if (fileStat.size >= maxFileSizeBytes) {
            const dateSuffix = new Date().toISOString().slice(0, 10);
            const rotatedPath = join(logDir, `${entry}.${dateSuffix}.${Date.now()}`);
            await rename(filePath, rotatedPath);
            rotatedFiles.push(entry);
          }
        }
      }

      // 2. Purge phase: check rotated files older than cutoff
      const refreshedEntries = await readdir(logDir);
      for (const entry of refreshedEntries) {
        // Rotated files match e.g. "service.log.2026-05-01.12345" or "app.log.old"
        const isRotated = entry.includes('.log.') && !entry.endsWith('.log');
        if (isRotated) {
          const filePath = join(logDir, entry);
          const fileStat = await stat(filePath);

          if (fileStat.mtime < cutoffDate) {
            bytesReclaimed += fileStat.size;
            await unlink(filePath);
            purgedFiles.push(entry);
          }
        }
      }

      const durationMs = Date.now() - start;

      // Telemetry emission
      if (this.telemetryService) {
        this.telemetryService.emitMetric(
          'logs.rotation.purged_files',
          'COUNTER',
          purgedFiles.length,
          'count'
        );
        this.telemetryService.emitMetric(
          'logs.rotation.bytes_reclaimed',
          'COUNTER',
          bytesReclaimed,
          'bytes'
        );
        this.telemetryService.emitHealthSignal({
          component: 'BACKEND',
          status: 'HEALTHY',
          message: `Log rotation completed: rotated ${rotatedFiles.length}, purged ${purgedFiles.length} file(s), reclaimed ${bytesReclaimed} bytes`,
          timestamp: new Date()
        });
      }

      const signal: PurgeExecutionSignal = {
        task: 'LOG_ROTATION',
        status: 'SUCCESS',
        itemsPurged: purgedFiles.length,
        bytesReclaimed,
        timestamp: new Date()
      };
      if (config?.onSignal) {
        config.onSignal(signal);
      }

      return {
        rotatedFiles,
        purgedFiles,
        bytesReclaimed,
        durationMs
      };
    } catch (err) {
      const errorMsg = this.sanitizer.sanitizeMessage(
        err instanceof Error ? err.message : String(err)
      );

      const failureSignal: PurgeExecutionSignal = {
        task: 'LOG_ROTATION',
        status: 'FAILURE',
        itemsPurged: purgedFiles.length,
        bytesReclaimed,
        errorMessage: errorMsg,
        timestamp: new Date()
      };
      if (config?.onSignal) {
        config.onSignal(failureSignal);
      }

      if (this.telemetryService) {
        this.telemetryService.emitMetric(
          'logs.rotation.failure_count',
          'COUNTER',
          1,
          'count',
          { task: 'LOG_ROTATION' }
        );
        this.telemetryService.emitHealthSignal({
          component: 'BACKEND',
          status: 'DEGRADED',
          message: `Log rotation failed: ${errorMsg}`,
          timestamp: new Date()
        });
      }

      throw new Error(`Log rotation and purge failed: ${errorMsg}`);
    }
  }
}
