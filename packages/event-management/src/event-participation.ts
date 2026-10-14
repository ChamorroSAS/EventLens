import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { EventManagementError, type EventAuditSink, type SetEventParticipationCommand, type SetEventParticipationResult, type CapacityReservationPort } from './contracts.js';

/** Logical cancellation only. Keys remain durable for the real cleanup worker. */
export async function cancelUnconfirmedUploads(tx: SqlTransaction, eventId: string, capacity: Required<Pick<CapacityReservationPort, 'releaseReservation'>>, now: Date) {
  const attempts = await tx.query<{ id: string; reservation_id: string }>(
    "SELECT id,reservation_id FROM upload_attempt WHERE event_id=$1 AND status IN ('AUTHORIZED','UPLOADING','CONFIRMING') ORDER BY id FOR UPDATE", eventId);
  for (const attempt of attempts) {
    await capacity.releaseReservation({ eventId, reservationId: attempt.reservation_id, reason: 'UPLOADS_DISABLED' });
    await tx.execute("UPDATE upload_attempt SET status='CANCELLED',rejection_reason='UPLOADS_DISABLED',updated_at=$2 WHERE id=$1", attempt.id, now);
  }
  return attempts.map(attempt => attempt.id);
}

export class EventParticipationService {
  constructor(private readonly runner: TransactionRunner, private readonly capacity: Required<Pick<CapacityReservationPort, 'releaseReservation'>>, private readonly audit: EventAuditSink) {}

  async setParticipation(command: SetEventParticipationCommand): Promise<SetEventParticipationResult> {
    if (!command || typeof command !== 'object') throw new EventManagementError('INVALID_ARGUMENT', 'Command required');
    const { actorContext: actor, eventId, uploadsEnabled, guestGalleryEnabled, expectedRevision, idempotencyKey } = command;
    if (!actor || actor.actorType !== 'ORGANIZER_HUMAN' || typeof actor.accountId !== 'string' || !actor.accountId || actor.restrictedContext) throw new EventManagementError('UNAUTHORIZED', 'Ordinary organizer required');
    if (typeof eventId !== 'string' || !eventId || typeof uploadsEnabled !== 'boolean' || typeof guestGalleryEnabled !== 'boolean' || typeof expectedRevision !== 'string' || !/^[1-9]\d{0,11}$/.test(expectedRevision) || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey)) throw new EventManagementError('INVALID_ARGUMENT', 'Invalid participation command');
    return this.runner.run(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked', `${actor.accountId}:SET_PARTICIPATION:${idempotencyKey}`);
      const rows = await tx.query<{ organizer_id: string; status: string; revision: bigint }>('SELECT organizer_id,status,revision FROM event WHERE id=$1 FOR UPDATE', eventId);
      if (!rows.length || rows[0].organizer_id !== actor.accountId) throw new EventManagementError('EVENT_NOT_FOUND', 'Event not found');
      const fingerprint = createHash('sha256').update(JSON.stringify({ eventId, uploadsEnabled, guestGalleryEnabled, expectedRevision })).digest('hex');
      const receipts = await tx.query<{ operation_id: string; fingerprint: string; applied_revision: bigint; outcome: string }>("SELECT operation_id,fingerprint,applied_revision,outcome FROM event_command_receipt WHERE actor_id=$1 AND operation='SET_PARTICIPATION' AND idempotency_key=$2 FOR UPDATE", actor.accountId, idempotencyKey);
      if (receipts.length) {
        const receipt = receipts[0];
        if (receipt.fingerprint !== fingerprint) throw new EventManagementError('IDEMPOTENCY_CONFLICT', 'Idempotency key already used');
        return { eventId, uploadsEnabled, guestGalleryEnabled, revision: String(receipt.applied_revision), outcome: 'IDEMPOTENT_REPLAY', receipt: { operationId: receipt.operation_id, eventId, operation: 'SET_PARTICIPATION', appliedRevision: String(receipt.applied_revision), outcome: receipt.outcome } };
      }
      if (String(rows[0].revision) !== expectedRevision) throw new EventManagementError('CONCURRENCY_CONFLICT', 'Event revision changed');
      if (!['DRAFT','SCHEDULED','ACTIVE'].includes(rows[0].status)) throw new EventManagementError('INVALID_STATE', 'Event settings are read-only');
      const now = command.now ?? new Date();
      const cancelled = uploadsEnabled ? [] : await cancelUnconfirmedUploads(tx, eventId, this.capacity, now);
      const updated = await tx.query<{ revision: bigint }>('UPDATE event SET uploads_enabled=$2,guest_gallery_enabled=$3,revision=revision+1,updated_at=$4 WHERE id=$1 RETURNING revision', eventId, uploadsEnabled, guestGalleryEnabled, now);
      const revision = String(updated[0].revision);
      const operationId = randomUUID();
      await tx.execute("INSERT INTO event_command_receipt (operation_id,event_id,actor_id,operation,idempotency_key,fingerprint,payload_hash,applied_revision,outcome,created_at) VALUES ($1,$2,$3,'SET_PARTICIPATION',$4,$5,$5,$6,'UPDATED',$7)", operationId,eventId,actor.accountId,idempotencyKey,fingerprint,BigInt(revision),now);
      await this.audit.record({ id: randomUUID(), procedure: 'EVENT_PARTICIPATION_CONFIGURED', actorId: actor.accountId, targetIdentifier: eventId, result: 'UPDATED', details: JSON.stringify({ uploadsEnabled, guestGalleryEnabled, cancelledAttempts: cancelled.length }), timestamp: now });
      return { eventId, uploadsEnabled, guestGalleryEnabled, revision, outcome: 'UPDATED', receipt: { operationId,eventId,operation:'SET_PARTICIPATION',appliedRevision:revision,outcome:'UPDATED' } };
    });
  }
}
