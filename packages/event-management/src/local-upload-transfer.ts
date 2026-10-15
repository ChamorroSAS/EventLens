import { createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import { EventManagementError, type CapacityReservationPort } from './contracts.js';
import { GuestSessionService } from './guest-session.js';
import { UploadAuthorizationService } from './upload-authorization.js';
export interface LocalUploadFile {
    name: string;
    size: number;
    type: string;
    idempotencyKey: string;
    sha256?: string;
}
export interface LocalUploadGrant {
    attemptId: string;
    objectKey: string;
    mimeType: string;
    size: number;
    expiresAt: Date;
    sha256: string | null;
}
export interface LocalUploadSeal {
    sourceVersion: string;
    sealedKey: string;
    sealedVersion: string;
    sha256: string;
    bytes: number;
}
interface TransferRow {
    attempt_id: string;
    staging_key: string;
    mime_type: string;
    request_fingerprint: string;
    expected_sha256: string | null;
    grant_expires_at: Date;
    source_version: string | null;
    sealed_key: string | null;
    sealed_version: string | null;
    actual_sha256: string | null;
    received_at: Date | null;
}
/** Owns durable authorization/receipt; storage effects occur between these transactions. */
export class LocalUploadTransferService {
    constructor(private readonly runner: TransactionRunner, private readonly capacity: (runner: TransactionRunner) => CapacityReservationPort & {
        assertActiveReservation(eventId: string, reservationId: string): Promise<void>;
    }) { }
    private async authenticate(tx: SqlTransaction, token: string, now: Date) {
        const runner: TransactionRunner = { run: work => work(tx) };
        const sessions = new GuestSessionService(runner);
        const initial = await sessions.resolveGuestSession(token, now);
        const hints = await tx.query<{
            organizer_id: string;
        }>('SELECT organizer_id FROM event WHERE id=$1', initial.eventId);
        if (!hints[0])
            throw new EventManagementError('EVENT_NOT_FOUND');
        const organizers = await tx.query<{
            status: string;
        }>('SELECT status FROM organizer_account WHERE id=$1 FOR SHARE', hints[0].organizer_id);
        const events = await tx.query<{
            id: string;
            organizer_id: string;
            status: string;
            uploads_enabled: boolean;
            expires_at: Date | null;
        }>('SELECT id,organizer_id,status,uploads_enabled,expires_at FROM event WHERE id=$1 FOR UPDATE', initial.eventId);
        const event = events[0];
        if (!event)
            throw new EventManagementError('EVENT_NOT_FOUND');
        if (event.organizer_id !== hints[0].organizer_id)
            throw new EventManagementError('CONCURRENCY_CONFLICT');
        const credentials = await tx.query<{
            generation: number;
        }>('SELECT generation FROM public_access_credential WHERE event_id=$1 AND revoked_at IS NULL AND generation=$2 FOR SHARE', event.id, initial.credentialGeneration);
        await tx.query('SELECT id FROM guest_session WHERE id=$1 FOR SHARE', initial.id);
        const session = await sessions.resolveGuestSession(token, now);
        if (organizers[0]?.status !== 'ACTIVE' || !credentials.length || session.credentialGeneration !== initial.credentialGeneration || session.eventId !== initial.eventId)
            throw new EventManagementError('SESSION_REVOKED');
        if (event.status !== 'ACTIVE' || !event.uploads_enabled || !event.expires_at || new Date(event.expires_at).getTime() <= now.getTime())
            throw new EventManagementError('UPLOADS_DISABLED');
        if (!session.consentRecordedAt || !session.consentVersion)
            throw new EventManagementError('CONSENT_REQUIRED');
        if (!session.contributorNickname?.trim())
            throw new EventManagementError('INVALID_CONTRIBUTOR_NICKNAME');
        return { runner, session };
    }
    async authorize(token: string, file: LocalUploadFile, now = new Date()): Promise<LocalUploadGrant> {
        const fingerprint = createHash('sha256').update(JSON.stringify({ name: file.name, size: file.size, type: file.type, sha256: file.sha256 ?? null })).digest('hex');
        return this.runner.run(async (tx) => {
            const { runner, session } = await this.authenticate(tx, token, now);
            // Event lock also serializes absent-row idempotency checks and quota reservations.
            const authorized = await new UploadAuthorizationService(runner, new GuestSessionService(runner), this.capacity(runner), {
                record: async event => {
                    await tx.execute('INSERT INTO admin_audit_event(id,procedure,actor_id,target_identifier,result,details,timestamp) VALUES($1,$2,$3,$4,$5,$6,$7)', event.id, event.procedure, event.actorId, event.targetIdentifier, event.result, event.details ?? null, event.timestamp);
                }
            }).authorizeUploadAttempt({ sessionToken: token, idempotencyKey: `${session.id}:${file.idempotencyKey}`, declaredSize: file.size, declaredType: file.type.startsWith('image/') ? 'PHOTO' : 'VIDEO', now });
            const attempt = authorized.attempt;
            if (!['AUTHORIZED', 'UPLOADING'].includes(attempt.status))
                throw new EventManagementError('INVALID_STATE');
            if (attempt.expiresAt.getTime() <= now.getTime())
                throw new EventManagementError('UPLOAD_ATTEMPT_EXPIRED');
            await this.assertReservation(this.capacity(runner), session.eventId, attempt.reservationId);
            let rows = await tx.query<TransferRow>('SELECT * FROM local_upload_transfer WHERE attempt_id=$1 FOR UPDATE', attempt.id);
            if (!rows.length) {
                const key = `events/${session.eventId}/staging/${attempt.id}`;
                const deadline = new Date(Math.min(attempt.expiresAt.getTime(), now.getTime() + 15 * 60 * 1000));
                await tx.execute('INSERT INTO local_upload_transfer(attempt_id,staging_key,mime_type,expected_sha256,grant_expires_at,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6)', attempt.id, key, file.type, file.sha256 ?? null, deadline, fingerprint);
                await tx.execute("UPDATE upload_attempt SET object_key=$2,status='UPLOADING',updated_at=$3 WHERE id=$1", attempt.id, key, now);
                rows = await tx.query<TransferRow>('SELECT * FROM local_upload_transfer WHERE attempt_id=$1', attempt.id);
            }
            const transfer = rows[0];
            if (transfer.request_fingerprint !== fingerprint || transfer.mime_type !== file.type || transfer.expected_sha256 !== (file.sha256 ?? null))
                throw new EventManagementError('IDEMPOTENCY_CONFLICT');
            if (new Date(transfer.grant_expires_at).getTime() <= now.getTime())
                throw new EventManagementError('UPLOAD_ATTEMPT_EXPIRED');
            return { attemptId: attempt.id, objectKey: transfer.staging_key, mimeType: transfer.mime_type, size: Number(attempt.declaredSize), expiresAt: new Date(transfer.grant_expires_at), sha256: transfer.expected_sha256 };
        });
    }
    async inspect(token: string, attemptId: string, now = new Date()): Promise<{
        grant: LocalUploadGrant;
        receivedAt: Date | null;
    }> {
        return this.runner.run(async (tx) => {
            const { session, runner } = await this.authenticate(tx, token, now);
            const attempts = await tx.query<{
                declared_size: bigint;
                status: string;
                expires_at: Date;
                reservation_id: string;
            }>('SELECT declared_size,status,expires_at,reservation_id FROM upload_attempt WHERE id=$1 AND event_id=$2 AND guest_session_id=$3 FOR UPDATE', attemptId, session.eventId, session.id);
            const attempt = attempts[0];
            if (!attempt)
                throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND');
            await this.assertReservation(this.capacity(runner), session.eventId, attempt.reservation_id);
            const rows = await tx.query<TransferRow & {
                operation_id: string | null;
            }>('SELECT * FROM local_upload_transfer WHERE attempt_id=$1 FOR UPDATE', attemptId);
            const transfer = rows[0];
            if (!transfer)
                throw new EventManagementError('UPLOAD_ATTEMPT_NOT_FOUND');
            if (!['AUTHORIZED', 'UPLOADING', 'CONFIRMING'].includes(attempt.status))
                throw new EventManagementError('INVALID_STATE');
            if (!transfer.received_at && (new Date(attempt.expires_at).getTime() <= now.getTime() || new Date(transfer.grant_expires_at).getTime() <= now.getTime()))
                throw new EventManagementError('UPLOAD_ATTEMPT_EXPIRED');
            return { grant: { attemptId, objectKey: transfer.staging_key, mimeType: transfer.mime_type, size: Number(attempt.declared_size), expiresAt: new Date(transfer.grant_expires_at), sha256: transfer.expected_sha256 }, receivedAt: transfer.received_at ? new Date(transfer.received_at) : null };
        });
    }
    async receive(token: string, grant: LocalUploadGrant, seal: LocalUploadSeal, now = new Date()): Promise<Date> {
        if (!seal || !Number.isSafeInteger(seal.bytes) || seal.bytes <= 0 || typeof seal.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(seal.sha256) || typeof seal.sourceVersion !== 'string' || !seal.sourceVersion || seal.sourceVersion === 'null' || typeof seal.sealedVersion !== 'string' || !seal.sealedVersion || seal.sealedVersion === 'null' || seal.sealedKey !== `originals/${grant.attemptId}/${createHash('sha256').update(seal.sourceVersion).digest('hex')}`)
            throw new EventManagementError('INVALID_ARGUMENT');
        return this.runner.run(async (tx) => {
            const bound = new LocalUploadTransferService({ run: work => work(tx) }, this.capacity);
            const current = await bound.inspect(token, grant.attemptId, now);
            if (current.receivedAt)
                return current.receivedAt;
            if (seal.bytes !== current.grant.size || (current.grant.sha256 && current.grant.sha256 !== seal.sha256))
                throw new EventManagementError('SIZE_MISMATCH');
            await tx.execute('UPDATE local_upload_transfer SET operation_id=$2,source_version=$3,sealed_key=$4,sealed_version=$5,actual_sha256=$6,received_at=$7,actual_bytes=$8 WHERE attempt_id=$1', grant.attemptId, grant.attemptId, seal.sourceVersion, seal.sealedKey, seal.sealedVersion, seal.sha256, now, seal.bytes);
            await tx.execute("UPDATE upload_attempt SET status='CONFIRMING',object_key=$2,actual_size=$3,updated_at=$4 WHERE id=$1", grant.attemptId, seal.sealedKey, seal.bytes, now);
            await tx.execute("INSERT INTO admin_audit_event(id,procedure,actor_id,target_identifier,result,details,timestamp) VALUES($1,'GUEST_UPLOAD_RECEIVED','GUEST_ANONYMOUS',$2,'SUCCESS',$3,$4)", cryptoId(grant.attemptId, grant.attemptId), grant.attemptId, 'Private original received; validation pending', now);
            return now;
        });
    }
    private async assertReservation(capacity: {
        assertActiveReservation(eventId: string, reservationId: string): Promise<void>;
    }, eventId: string, reservationId: string) {
        try {
            await capacity.assertActiveReservation(eventId, reservationId);
        }
        catch (error) {
            if (['RESERVATION_NOT_FOUND', 'CONFLICT'].includes((error as {
                code?: string;
            })?.code ?? ''))
                throw new EventManagementError('UPLOAD_ATTEMPT_CANCELLED');
            throw error;
        }
    }
}
function cryptoId(attemptId: string, operationId: string): string {
    const hash = createHash('sha256').update(`${attemptId}:${operationId}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
