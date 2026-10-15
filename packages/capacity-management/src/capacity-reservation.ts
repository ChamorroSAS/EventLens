import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  CapacityError,
  CapacityReservationRecord,
  CommitReservationCommand,
  EventCapacitySnapshot,
  ReleaseReservationCommand,
  ReservationStatus,
  ReserveCapacityCommand,
  ReserveCapacityResult
} from './contracts.js';
import { CapacityPlanService } from './capacity-plan.js';

interface RawReservationRow {
  id: string;
  event_id: string;
  idempotency_key: string;
  bytes: string | bigint;
  file_slots: number;
  media_type: string | null;
  status: string;
  release_reason: string | null;
  created_at: Date;
  released_at: Date | null;
  committed_at: Date | null;
  updated_at: Date;
}

interface RawBalanceRow {
  event_id: string;
  consumed_bytes: string | bigint;
  consumed_files: number;
  created_at: Date;
  updated_at: Date;
}

export class CapacityReservationService {
  /** Short transaction-bound guard; never commits or changes reserved capacity. */
  public async assertActiveReservation(eventId: string, reservationId: string): Promise<void> {
    if (!eventId || !reservationId) throw new CapacityError('INVALID_ARGUMENT', 'Event and reservation required');
    await this.transactions.run(async tx => {
      const rows = await tx.query<{ status: string }>('SELECT status FROM capacity_reservation WHERE event_id=$1 AND id=$2 FOR UPDATE', eventId, reservationId);
      if (!rows.length) throw new CapacityError('RESERVATION_NOT_FOUND', 'Reservation not found');
      if (rows[0].status !== 'ACTIVE') throw new CapacityError('CONFLICT', 'Reservation is no longer active');
    });
  }
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly planService: CapacityPlanService
  ) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!planService) {
      throw new CapacityError('INVALID_ARGUMENT', 'CapacityPlanService is required');
    }
  }

  public async reserveCapacity(command: ReserveCapacityCommand): Promise<ReserveCapacityResult> {
    this.validateReserveCommand(command);
    const requestedBytes = BigInt(command.bytes);
    const requestedFileSlots = command.fileSlots ?? 1;

    return this.transactions.run(async (tx) => {
      // 1. Lock event balance row to serialize concurrent reservations for this event (prevent race condition / overbooking)
      await tx.query(
        `INSERT INTO event_capacity_balance (event_id, consumed_bytes, consumed_files, created_at, updated_at)
         VALUES ($1, 0, 0, now(), now())
         ON CONFLICT (event_id) DO NOTHING`,
        command.eventId
      );

      const balanceRows = await tx.query<RawBalanceRow>(
        `SELECT event_id, consumed_bytes, consumed_files, created_at, updated_at
         FROM event_capacity_balance
         WHERE event_id = $1
         FOR UPDATE`,
        command.eventId
      );

      // 2. Check for existing reservation by idempotencyKey
      const existingRows = await tx.query<RawReservationRow>(
        `SELECT id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at
         FROM capacity_reservation
         WHERE event_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        command.eventId,
        command.idempotencyKey
      );

      if (existingRows.length > 0) {
        const existing = this.mapReservationRow(existingRows[0]);
        if (
          existing.status === 'ACTIVE' &&
          existing.bytes === requestedBytes &&
          existing.fileSlots === requestedFileSlots
        ) {
          return { reservation: existing, isExisting: true };
        }
        throw new CapacityError(
          'IDEMPOTENCY_CONFLICT',
          `A reservation for event '${command.eventId}' with idempotency key '${command.idempotencyKey}' already exists in status '${existing.status}' with different parameters`,
          { existing }
        );
      }

      // 3. Resolve effective limits for event
      const effectiveLimits = await this.planService.resolveEffectiveLimitsWithTx(tx, {
        eventId: command.eventId
      });

      // 4. Verify per-file limits if mediaType is declared
      if (command.mediaType === 'PHOTO' && requestedBytes > effectiveLimits.maxPhotoBytes) {
        throw new CapacityError(
          'FILE_SIZE_EXCEEDS_LIMIT',
          `Declared photo size (${requestedBytes} bytes) exceeds maximum photo limit (${effectiveLimits.maxPhotoBytes} bytes)`,
          { requestedBytes, limit: effectiveLimits.maxPhotoBytes }
        );
      }

      if (command.mediaType === 'VIDEO' && requestedBytes > effectiveLimits.maxVideoBytes) {
        throw new CapacityError(
          'FILE_SIZE_EXCEEDS_LIMIT',
          `Declared video size (${requestedBytes} bytes) exceeds maximum video limit (${effectiveLimits.maxVideoBytes} bytes)`,
          { requestedBytes, limit: effectiveLimits.maxVideoBytes }
        );
      }

      // 5. Query active reservations sum
      const sumRows = await tx.query<{
        active_bytes: string | bigint | null;
        active_files: number | string | null;
      }>(
        `SELECT COALESCE(SUM(bytes), 0) AS active_bytes, COALESCE(SUM(file_slots), 0) AS active_files
         FROM capacity_reservation
         WHERE event_id = $1 AND status = 'ACTIVE'`,
        command.eventId
      );

      const activeBytes = BigInt(sumRows[0]?.active_bytes ?? 0);
      const activeFiles = Number(sumRows[0]?.active_files ?? 0);
      const consumedBytes = BigInt(balanceRows[0]?.consumed_bytes ?? 0);
      const consumedFiles = Number(balanceRows[0]?.consumed_files ?? 0);

      // 6. Verify total storage capacity
      const projectedStorage = consumedBytes + activeBytes + requestedBytes;
      if (projectedStorage > effectiveLimits.storageBytes) {
        const availableBytes =
          effectiveLimits.storageBytes > (consumedBytes + activeBytes)
            ? effectiveLimits.storageBytes - (consumedBytes + activeBytes)
            : 0n;
        throw new CapacityError(
          'INSUFFICIENT_STORAGE_CAPACITY',
          `Requested storage (${requestedBytes} bytes) exceeds available capacity. Available: ${availableBytes} bytes, Limit: ${effectiveLimits.storageBytes} bytes`,
          {
            requestedBytes,
            availableBytes,
            limitBytes: effectiveLimits.storageBytes
          }
        );
      }

      // 7. Verify total file count capacity
      const projectedFiles = consumedFiles + activeFiles + requestedFileSlots;
      if (projectedFiles > effectiveLimits.maxFiles) {
        const availableFiles =
          effectiveLimits.maxFiles > (consumedFiles + activeFiles)
            ? effectiveLimits.maxFiles - (consumedFiles + activeFiles)
            : 0;
        throw new CapacityError(
          'INSUFFICIENT_FILE_CAPACITY',
          `Requested file slots (${requestedFileSlots}) exceed available file capacity. Available: ${availableFiles} slots, Limit: ${effectiveLimits.maxFiles}`,
          {
            requestedFileSlots,
            availableFiles,
            limitFiles: effectiveLimits.maxFiles
          }
        );
      }

      // 8. Insert new active reservation
      const reservationId = randomUUID();
      const now = new Date();
      const insertedRows = await tx.query<RawReservationRow>(
        `INSERT INTO capacity_reservation (
           id, event_id, idempotency_key, bytes, file_slots, media_type, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7)
         RETURNING id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at`,
        reservationId,
        command.eventId,
        command.idempotencyKey,
        requestedBytes,
        requestedFileSlots,
        command.mediaType ?? null,
        now
      );

      return {
        reservation: this.mapReservationRow(insertedRows[0]),
        isExisting: false
      };
    });
  }

  public async releaseReservation(command: ReleaseReservationCommand): Promise<CapacityReservationRecord> {
    if (!command.eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }
    if (!command.reservationId && !command.idempotencyKey) {
      throw new CapacityError('INVALID_ARGUMENT', 'Either reservationId or idempotencyKey must be provided');
    }

    return this.transactions.run(async (tx) => {
      const rows = await tx.query<RawReservationRow>(
        `SELECT id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at
         FROM capacity_reservation
         WHERE event_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid) AND ($3::text IS NULL OR idempotency_key = $3::text)
         FOR UPDATE`,
        command.eventId,
        command.reservationId ?? null,
        command.idempotencyKey ?? null
      );

      if (rows.length === 0) {
        throw new CapacityError('RESERVATION_NOT_FOUND', 'Reservation not found');
      }

      const current = this.mapReservationRow(rows[0]);

      // Idempotency: If already released, return existing record without double-releasing
      if (current.status === 'RELEASED') {
        return current;
      }

      if (current.status === 'COMMITTED') {
        throw new CapacityError(
          'RESERVATION_ALREADY_COMMITTED',
          'Cannot release a reservation that has already been committed as confirmed storage'
        );
      }

      const now = new Date();
      const updatedRows = await tx.query<RawReservationRow>(
        `UPDATE capacity_reservation
         SET status = 'RELEASED',
             released_at = $2,
             release_reason = $3,
             updated_at = $2
         WHERE id = $1
         RETURNING id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at`,
        current.id,
        now,
        command.reason ?? null
      );

      return this.mapReservationRow(updatedRows[0]);
    });
  }

  public async commitReservation(command: CommitReservationCommand): Promise<CapacityReservationRecord> {
    if (!command.eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }
    if (!command.reservationId && !command.idempotencyKey) {
      throw new CapacityError('INVALID_ARGUMENT', 'Either reservationId or idempotencyKey must be provided');
    }

    return this.transactions.run(async (tx) => {
      // 1. Lock event balance row
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

      // 2. Lock reservation
      const rows = await tx.query<RawReservationRow>(
        `SELECT id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at
         FROM capacity_reservation
         WHERE event_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid) AND ($3::text IS NULL OR idempotency_key = $3::text)
         FOR UPDATE`,
        command.eventId,
        command.reservationId ?? null,
        command.idempotencyKey ?? null
      );

      if (rows.length === 0) {
        throw new CapacityError('RESERVATION_NOT_FOUND', 'Reservation not found');
      }

      const current = this.mapReservationRow(rows[0]);

      // Idempotency: already committed
      if (current.status === 'COMMITTED') {
        return current;
      }

      if (current.status === 'RELEASED') {
        throw new CapacityError(
          'INVALID_ARGUMENT',
          'Cannot commit a reservation that was released or cancelled'
        );
      }

      const now = new Date();
      const updatedRows = await tx.query<RawReservationRow>(
        `UPDATE capacity_reservation
         SET status = 'COMMITTED',
             committed_at = $2,
             updated_at = $2
         WHERE id = $1
         RETURNING id, event_id, idempotency_key, bytes, file_slots, media_type, status, release_reason, created_at, released_at, committed_at, updated_at`,
        current.id,
        now
      );

      await tx.query(
        `UPDATE event_capacity_balance
         SET consumed_bytes = consumed_bytes + $2,
             consumed_files = consumed_files + $3,
             updated_at = $4
         WHERE event_id = $1`,
        command.eventId,
        current.bytes,
        current.fileSlots,
        now
      );

      return this.mapReservationRow(updatedRows[0]);
    });
  }

  public async getCapacitySnapshot(eventId: string): Promise<EventCapacitySnapshot> {
    if (!eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }

    return this.transactions.run(async (tx) => {
      const effectiveLimits = await this.planService.resolveEffectiveLimitsWithTx(tx, { eventId });

      const balanceRows = await tx.query<RawBalanceRow>(
        `SELECT consumed_bytes, consumed_files FROM event_capacity_balance WHERE event_id = $1`,
        eventId
      );

      const consumedBytes = balanceRows.length > 0 ? BigInt(balanceRows[0].consumed_bytes) : 0n;
      const consumedFiles = balanceRows.length > 0 ? Number(balanceRows[0].consumed_files) : 0;

      const sumRows = await tx.query<{
        active_bytes: string | bigint | null;
        active_files: number | string | null;
      }>(
        `SELECT COALESCE(SUM(bytes), 0) AS active_bytes, COALESCE(SUM(file_slots), 0) AS active_files
         FROM capacity_reservation
         WHERE event_id = $1 AND status = 'ACTIVE'`,
        eventId
      );

      const activeReservedBytes = BigInt(sumRows[0]?.active_bytes ?? 0);
      const activeReservedFiles = Number(sumRows[0]?.active_files ?? 0);

      const totalUsedBytes = consumedBytes + activeReservedBytes;
      const totalUsedFiles = consumedFiles + activeReservedFiles;

      const availableStorageBytes =
        effectiveLimits.storageBytes > totalUsedBytes
          ? effectiveLimits.storageBytes - totalUsedBytes
          : 0n;

      const availableFiles =
        effectiveLimits.maxFiles > totalUsedFiles
          ? effectiveLimits.maxFiles - totalUsedFiles
          : 0;

      return {
        eventId,
        effectiveLimits,
        consumedBytes,
        consumedFiles,
        activeReservedBytes,
        activeReservedFiles,
        availableStorageBytes,
        availableFiles,
        snapshotAt: new Date()
      };
    });
  }

  private validateReserveCommand(command: ReserveCapacityCommand): void {
    if (!command.eventId) {
      throw new CapacityError('INVALID_ARGUMENT', 'eventId is required');
    }
    if (!command.idempotencyKey || typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid idempotencyKey is required');
    }
    const bytes = BigInt(command.bytes);
    if (bytes <= 0n) {
      throw new CapacityError('INVALID_ARGUMENT', 'Reservation bytes must be positive');
    }
    const fileSlots = command.fileSlots ?? 1;
    if (fileSlots <= 0) {
      throw new CapacityError('INVALID_ARGUMENT', 'File slots must be positive');
    }
    if (command.mediaType && command.mediaType !== 'PHOTO' && command.mediaType !== 'VIDEO') {
      throw new CapacityError('INVALID_ARGUMENT', `Unsupported media type: '${command.mediaType}'`);
    }
  }

  private mapReservationRow(row: RawReservationRow): CapacityReservationRecord {
    return {
      id: row.id,
      eventId: row.event_id,
      idempotencyKey: row.idempotency_key,
      bytes: BigInt(row.bytes),
      fileSlots: Number(row.file_slots),
      mediaType: row.media_type as 'PHOTO' | 'VIDEO' | null,
      status: row.status as ReservationStatus,
      releaseReason: row.release_reason,
      createdAt: new Date(row.created_at),
      releasedAt: row.released_at ? new Date(row.released_at) : null,
      committedAt: row.committed_at ? new Date(row.committed_at) : null,
      updatedAt: new Date(row.updated_at)
    };
  }
}
