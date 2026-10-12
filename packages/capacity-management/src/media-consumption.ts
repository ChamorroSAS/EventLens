import { randomUUID } from 'node:crypto';
import type { TransactionRunner, SqlTransaction } from '@eventlens/database';
import {
  CapacityError,
  ConfirmPhysicalPurgeCommand,
  ConfirmPhysicalPurgeResult,
  MediaConsumptionRecord,
  MediaLifecycleLogicalStatus,
  SettleOriginalAcceptanceCommand,
  SettleOriginalAcceptanceResult,
  doesMediaRetainCommercialQuota,
  isArtifactBillableAgainstQuota,
} from './contracts.js';
import { CapacityReservationService } from './capacity-reservation.js';

interface RawLedgerRow {
  id: string;
  event_id: string;
  media_id: string;
  bytes: string | bigint;
  file_slots: number;
  reservation_id: string | null;
  status: string;
  committed_at: Date;
  purged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RawPurgeReceiptRow {
  id: string;
  event_id: string;
  media_id: string;
  purge_receipt_id: string;
  bytes: string | bigint;
  file_slots: number;
  released_at: Date;
  created_at: Date;
}

export class MediaConsumptionService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly reservationService: CapacityReservationService
  ) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!reservationService) {
      throw new CapacityError('INVALID_ARGUMENT', 'CapacityReservationService is required');
    }
  }

  /**
   * Consolida el consumo de cuota cuando un original es formalmente aceptado (EL-TK-137 / Escenario 1).
   * Si venía con reserva activa, la comitea. Si no era facturable (ej. derivado, ZIP, portada), no consume cuota.
   * Es estrictamente idempotente para el mismo mediaId.
   */
  public async settleOriginalAcceptance(
    command: SettleOriginalAcceptanceCommand
  ): Promise<SettleOriginalAcceptanceResult> {
    this.validateSettleCommand(command);

    const artifactRole = command.artifactRole ?? 'ORIGINAL';
    const isBillable = isArtifactBillableAgainstQuota(artifactRole);

    // Si no es un original (es preview, thumbnail, export archive, portada separada),
    // no se computa contra la cuota comercial (DEC-096).
    if (!isBillable) {
      return {
        eventId: command.eventId,
        mediaId: command.mediaId,
        bytes: 0n,
        fileSlots: 0,
        isExisting: false,
        settledAt: new Date(),
        reservationCommitted: false,
      };
    }

    const requestedBytes = BigInt(command.bytes);
    const requestedSlots = command.fileSlots ?? 1;

    return this.transactions.run(async (tx) => {
      // 1. Asegurar y bloquear balance del evento para serializar operaciones
      await tx.query(
        `INSERT INTO event_capacity_balance (event_id, consumed_bytes, consumed_files, created_at, updated_at)
         VALUES ($1, 0, 0, now(), now())
         ON CONFLICT (event_id) DO NOTHING`,
        command.eventId
      );

      await tx.query(
        `SELECT event_id FROM event_capacity_balance WHERE event_id = $1 FOR UPDATE`,
        command.eventId
      );

      // 2. Comprobar si este original ya fue asentado previamente (Idempotencia)
      const existingRows = await tx.query<RawLedgerRow>(
        `SELECT id, event_id, media_id, bytes, file_slots, reservation_id, status, committed_at, purged_at, created_at, updated_at
         FROM media_consumption_ledger
         WHERE event_id = $1 AND media_id = $2
         FOR UPDATE`,
        command.eventId,
        command.mediaId
      );

      if (existingRows.length > 0) {
        const row = existingRows[0];
        if (row.status === 'COMMITTED') {
          return {
            eventId: command.eventId,
            mediaId: command.mediaId,
            bytes: BigInt(row.bytes),
            fileSlots: row.file_slots,
            isExisting: true,
            settledAt: row.committed_at,
            reservationCommitted: row.reservation_id !== null,
          };
        }
        if (row.status === 'PURGED') {
          throw new CapacityError(
            'MEDIA_ALREADY_PURGED',
            `Media '${command.mediaId}' was already purged and cannot be re-settled`
          );
        }
      }

      // 3. Si se especificó reserva previa, comitearla
      let reservationCommitted = false;
      let effectiveReservationId: string | null = command.reservationId ?? null;

      if (command.reservationId || command.idempotencyKey) {
        try {
          const resRecord = await this.reservationService.commitReservation({
            eventId: command.eventId,
            reservationId: command.reservationId,
            idempotencyKey: command.idempotencyKey,
          });
          reservationCommitted = true;
          effectiveReservationId = resRecord.id;
        } catch (err) {
          // Si la reserva no fue encontrada o ya estaba comiteada, proseguir con consumo directo si aplica
          if (err instanceof CapacityError && err.code === 'RESERVATION_NOT_FOUND') {
            reservationCommitted = false;
          } else {
            throw err;
          }
        }
      } else {
        // Sin reserva previa: incrementar directamente el balance consumido
        await tx.query(
          `UPDATE event_capacity_balance
           SET consumed_bytes = consumed_bytes + $2,
               consumed_files = consumed_files + $3,
               updated_at = now()
           WHERE event_id = $1`,
          command.eventId,
          requestedBytes,
          requestedSlots
        );
      }

      // 4. Registrar en el ledger inmutable de consumos
      const ledgerId = randomUUID();
      const now = new Date();

      await tx.query(
        `INSERT INTO media_consumption_ledger (
           id, event_id, media_id, bytes, file_slots, reservation_id, status, committed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'COMMITTED', $7, $7, $7)`,
        ledgerId,
        command.eventId,
        command.mediaId,
        requestedBytes,
        requestedSlots,
        effectiveReservationId,
        now
      );

      return {
        eventId: command.eventId,
        mediaId: command.mediaId,
        bytes: requestedBytes,
        fileSlots: requestedSlots,
        isExisting: false,
        settledAt: now,
        reservationCommitted,
      };
    });
  }

  /**
   * Confirma la purga física del archivo original, liberando la cuota comercial (EL-TK-137 / Escenario 3).
   * Solo la eliminación física confirmada reduce el consumo (DEC-079/080).
   * Es idempotente mediante el purgeReceiptId.
   */
  public async confirmPhysicalPurge(
    command: ConfirmPhysicalPurgeCommand
  ): Promise<ConfirmPhysicalPurgeResult> {
    this.validatePurgeCommand(command);

    return this.transactions.run(async (tx) => {
      // 1. Bloquear balance
      await tx.query(
        `INSERT INTO event_capacity_balance (event_id, consumed_bytes, consumed_files, created_at, updated_at)
         VALUES ($1, 0, 0, now(), now())
         ON CONFLICT (event_id) DO NOTHING`,
        command.eventId
      );

      await tx.query(
        `SELECT event_id FROM event_capacity_balance WHERE event_id = $1 FOR UPDATE`,
        command.eventId
      );

      // 2. Verificar si este recibo de purga ya fue procesado (Idempotencia)
      const receiptRows = await tx.query<RawPurgeReceiptRow>(
        `SELECT id, event_id, media_id, purge_receipt_id, bytes, file_slots, released_at, created_at
         FROM purge_release_receipt
         WHERE event_id = $1 AND purge_receipt_id = $2
         FOR UPDATE`,
        command.eventId,
        command.purgeReceiptId
      );

      if (receiptRows.length > 0) {
        const receipt = receiptRows[0];
        return {
          eventId: command.eventId,
          mediaId: receipt.media_id,
          purgeReceiptId: command.purgeReceiptId,
          bytesReleased: BigInt(receipt.bytes),
          filesReleased: receipt.file_slots,
          isExisting: true,
          releasedAt: receipt.released_at,
        };
      }

      // 3. Consultar registro en el ledger
      const ledgerRows = await tx.query<RawLedgerRow>(
        `SELECT id, event_id, media_id, bytes, file_slots, reservation_id, status, committed_at, purged_at, created_at, updated_at
         FROM media_consumption_ledger
         WHERE event_id = $1 AND media_id = $2
         FOR UPDATE`,
        command.eventId,
        command.mediaId
      );

      let bytesToRelease = command.bytes !== undefined ? BigInt(command.bytes) : 0n;
      let filesToRelease = command.fileSlots ?? 1;

      if (ledgerRows.length > 0) {
        const ledgerItem = ledgerRows[0];
        if (ledgerItem.status === 'PURGED') {
          // La media ya fue liberada previamente con otro recibo
          const now = new Date();
          await tx.query(
            `INSERT INTO purge_release_receipt (
               id, event_id, media_id, purge_receipt_id, bytes, file_slots, released_at, created_at
             ) VALUES ($1, $2, $3, $4, 0, 0, $5, $5)`,
            randomUUID(),
            command.eventId,
            command.mediaId,
            command.purgeReceiptId,
            now
          );

          return {
            eventId: command.eventId,
            mediaId: command.mediaId,
            purgeReceiptId: command.purgeReceiptId,
            bytesReleased: 0n,
            filesReleased: 0,
            isExisting: true,
            releasedAt: now,
          };
        }

        bytesToRelease = BigInt(ledgerItem.bytes);
        filesToRelease = ledgerItem.file_slots;
      }

      // 4. Reducir balance consumido (sin bajar de cero)
      const now = new Date();
      await tx.query(
        `UPDATE event_capacity_balance
         SET consumed_bytes = GREATEST(0, consumed_bytes - $2),
             consumed_files = GREATEST(0, consumed_files - $3),
             updated_at = $4
         WHERE event_id = $1`,
        command.eventId,
        bytesToRelease,
        filesToRelease,
        now
      );

      // 5. Marcar media como PURGED en ledger
      if (ledgerRows.length > 0) {
        await tx.query(
          `UPDATE media_consumption_ledger
           SET status = 'PURGED',
               purged_at = $2,
               updated_at = $2
           WHERE id = $1`,
          ledgerRows[0].id,
          now
        );
      }

      // 6. Registrar recibo de purga física
      await tx.query(
        `INSERT INTO purge_release_receipt (
           id, event_id, media_id, purge_receipt_id, bytes, file_slots, released_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        randomUUID(),
        command.eventId,
        command.mediaId,
        command.purgeReceiptId,
        bytesToRelease,
        filesToRelease,
        now
      );

      return {
        eventId: command.eventId,
        mediaId: command.mediaId,
        purgeReceiptId: command.purgeReceiptId,
        bytesReleased: bytesToRelease,
        filesReleased: filesToRelease,
        isExisting: false,
        releasedAt: now,
      };
    });
  }

  /**
   * Consulta el registro de consumo de un original específico.
   */
  public async getMediaConsumptionRecord(
    eventId: string,
    mediaId: string
  ): Promise<MediaConsumptionRecord | null> {
    if (!eventId || !mediaId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId and mediaId are required');
    }

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<RawLedgerRow>(
        `SELECT id, event_id, media_id, bytes, file_slots, reservation_id, status, committed_at, purged_at
         FROM media_consumption_ledger
         WHERE event_id = $1 AND media_id = $2`,
        eventId,
        mediaId
      );

      if (rows.length === 0) return null;

      const r = rows[0];
      return {
        id: r.id,
        eventId: r.event_id,
        mediaId: r.media_id,
        bytes: BigInt(r.bytes),
        fileSlots: r.file_slots,
        reservationId: r.reservation_id,
        status: r.status as 'COMMITTED' | 'PURGED',
        committedAt: r.committed_at,
        purgedAt: r.purged_at,
      };
    });
  }

  /**
   * Valida la regla de retención de cuota según el estado lógico del medio (EL-TK-137 / Escenario 2).
   * DEC-079/080: Estados lógicos (ACTIVE, TRASHED, QUARANTINED, HIDDEN) retienen cuota comercial mientras existan físicamente.
   */
  public assertMediaRetainsQuota(status: MediaLifecycleLogicalStatus): {
    retainsQuota: boolean;
    reason: string;
  } {
    const retains = doesMediaRetainCommercialQuota(status);
    if (retains) {
      return {
        retainsQuota: true,
        reason: `Media in status '${status}' retains commercial quota because it still physically exists in storage`,
      };
    }
    return {
      retainsQuota: false,
      reason: `Media in status 'PURGED' released its quota upon confirmed physical deletion`,
    };
  }

  private validateSettleCommand(command: SettleOriginalAcceptanceCommand): void {
    if (!command.eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }
    if (!command.mediaId) {
      throw new CapacityError('INVALID_ARGUMENT', 'mediaId is required');
    }
    const bytes = BigInt(command.bytes);
    if (bytes < 0n) {
      throw new CapacityError('INVALID_ARGUMENT', 'bytes cannot be negative');
    }
  }

  private validatePurgeCommand(command: ConfirmPhysicalPurgeCommand): void {
    if (!command.eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }
    if (!command.mediaId) {
      throw new CapacityError('INVALID_ARGUMENT', 'mediaId is required');
    }
    if (!command.purgeReceiptId || !command.purgeReceiptId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid purgeReceiptId is required');
    }
  }
}
