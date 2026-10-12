import { randomUUID } from 'node:crypto';
import type { TransactionRunner, SqlTransaction } from '@eventlens/database';
import {
  CapacityError,
  CapacitySignalSink,
  CapacityThresholdType,
  EvaluateUsageThresholdsCommand,
  EvaluateUsageThresholdsResult,
  UsageThresholdSignal,
} from './contracts.js';
import { CapacityQueryService } from './capacity-query.js';

interface RawThresholdRow {
  id: string;
  event_id: string;
  threshold_type: string;
  status: string;
  last_value_pct: number;
  last_triggered_at: Date | null;
  last_rearmed_at: Date | null;
  dedup_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export class CapacityThresholdService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly queryService: CapacityQueryService,
    private readonly signalSink?: CapacitySignalSink
  ) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!queryService) {
      throw new CapacityError('INVALID_ARGUMENT', 'CapacityQueryService is required');
    }
  }

  /**
   * Evalúa los cruces de umbrales del 80% y 100% para un evento con deduplicación estricta y rearmado (EL-TK-138).
   */
  public async evaluateUsageThresholds(
    command: EvaluateUsageThresholdsCommand
  ): Promise<EvaluateUsageThresholdsResult> {
    if (!command.eventId || typeof command.eventId !== 'string' || !command.eventId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    const now = command.now ?? new Date();

    // 1. Obtener snapshot de capacidad comercial
    const summary = await this.queryService.queryCommercialCapacity({
      eventId: command.eventId,
    });

    const storagePercent = summary.usagePercentage.storagePercent;
    const filesPercent = summary.usagePercentage.filesPercent;
    const currentMaxPercent = Math.max(storagePercent, filesPercent);

    return this.transactions.run(async (tx) => {
      // 2. Bloquear y leer estados previos de umbrales para el evento
      const rows = await tx.query<RawThresholdRow>(
        `SELECT id, event_id, threshold_type, status, last_value_pct, last_triggered_at, last_rearmed_at, dedup_key, created_at, updated_at
         FROM capacity_threshold_state
         WHERE event_id = $1
         FOR UPDATE`,
        command.eventId
      );

      const stateMap = new Map<CapacityThresholdType, RawThresholdRow>();
      for (const row of rows) {
        stateMap.set(row.threshold_type as CapacityThresholdType, row);
      }

      const signalsToEmit: UsageThresholdSignal[] = [];

      // 3. Evaluar umbral 80% (Alerta de acercamiento al límite)
      const state80 = await this.evaluateSingleThreshold({
        tx,
        eventId: command.eventId,
        thresholdType: 'USAGE_80',
        thresholdPercent: 80,
        currentValuePct: currentMaxPercent,
        storagePercent,
        filesPercent,
        consumedBytes: summary.consumedStorage.bytes + summary.activeReservations.bytes,
        limitBytes: summary.effectiveLimits.storageBytes,
        consumedFiles: summary.consumedStorage.files + summary.activeReservations.files,
        limitFiles: summary.effectiveLimits.maxFiles,
        existingRow: stateMap.get('USAGE_80'),
        now,
      });

      if (state80.signal) {
        signalsToEmit.push(state80.signal);
      }

      // 4. Evaluar umbral 100% (Capacidad agotada, independiente del de 80%)
      const state100 = await this.evaluateSingleThreshold({
        tx,
        eventId: command.eventId,
        thresholdType: 'USAGE_100',
        thresholdPercent: 100,
        currentValuePct: currentMaxPercent,
        storagePercent,
        filesPercent,
        consumedBytes: summary.consumedStorage.bytes + summary.activeReservations.bytes,
        limitBytes: summary.effectiveLimits.storageBytes,
        consumedFiles: summary.consumedStorage.files + summary.activeReservations.files,
        limitFiles: summary.effectiveLimits.maxFiles,
        existingRow: stateMap.get('USAGE_100'),
        now,
      });

      if (state100.signal) {
        signalsToEmit.push(state100.signal);
      }

      // 5. Emitir señales al sink si está configurado
      if (this.signalSink && signalsToEmit.length > 0) {
        for (const sig of signalsToEmit) {
          await this.signalSink.emitSignal(sig);
        }
      }

      return {
        eventId: command.eventId,
        signalsEmitted: signalsToEmit,
        thresholdStates: {
          usage80: state80.status,
          usage100: state100.status,
        },
      };
    });
  }

  private async evaluateSingleThreshold(params: {
    tx: SqlTransaction;
    eventId: string;
    thresholdType: CapacityThresholdType;
    thresholdPercent: number;
    currentValuePct: number;
    storagePercent: number;
    filesPercent: number;
    consumedBytes: bigint;
    limitBytes: bigint;
    consumedFiles: number;
    limitFiles: number;
    existingRow?: RawThresholdRow;
    now: Date;
  }): Promise<{ status: 'ARMED' | 'TRIGGERED'; signal: UsageThresholdSignal | null }> {
    const {
      tx,
      eventId,
      thresholdType,
      thresholdPercent,
      currentValuePct,
      storagePercent,
      filesPercent,
      consumedBytes,
      limitBytes,
      consumedFiles,
      limitFiles,
      existingRow,
      now,
    } = params;

    const currentStatus = (existingRow?.status as 'ARMED' | 'TRIGGERED') ?? 'ARMED';

    if (currentValuePct >= thresholdPercent) {
      if (currentStatus === 'ARMED') {
        // Cruce de umbral detectado: Emitir señal deduplicada
        const dedupKey = `cap-thresh:${eventId}:${thresholdType}:${now.toISOString().slice(0, 10)}`;
        const signal: UsageThresholdSignal = {
          eventId,
          thresholdType,
          thresholdPercent,
          currentStoragePercent: storagePercent,
          currentFilesPercent: filesPercent,
          consumedBytes,
          limitBytes,
          consumedFiles,
          limitFiles,
          dedupKey,
          emittedAt: now,
        };

        if (existingRow) {
          await tx.query(
            `UPDATE capacity_threshold_state
             SET status = 'TRIGGERED',
                 last_value_pct = $2,
                 last_triggered_at = $3,
                 dedup_key = $4,
                 updated_at = $3
             WHERE id = $1`,
            existingRow.id,
            currentValuePct,
            now,
            dedupKey
          );
        } else {
          await tx.query(
            `INSERT INTO capacity_threshold_state (
               id, event_id, threshold_type, status, last_value_pct, last_triggered_at, dedup_key, created_at, updated_at
             ) VALUES ($1, $2, $3, 'TRIGGERED', $4, $5, $6, $5, $5)`,
            randomUUID(),
            eventId,
            thresholdType,
            currentValuePct,
            now,
            dedupKey
          );
        }

        return { status: 'TRIGGERED', signal };
      }

      // Ya estaba TRIGGERED: No emitir duplicados equivalentes (Escenario 2)
      return { status: 'TRIGGERED', signal: null };
    }

    // currentValuePct < thresholdPercent: Rearmado / Histeresis
    if (currentStatus === 'TRIGGERED' && existingRow) {
      await tx.query(
        `UPDATE capacity_threshold_state
         SET status = 'ARMED',
             last_value_pct = $2,
             last_rearmed_at = $3,
             updated_at = $3
         WHERE id = $1`,
        existingRow.id,
        currentValuePct,
        now
      );
    }

    return { status: 'ARMED', signal: null };
  }
}
