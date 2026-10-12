import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  UploadLifecycleService,
  UploadAuthorizationService,
  GuestSessionService,
  type DirectUploadStoragePort,
  type CapacityReservationPort,
  type MediaAcceptancePort,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('UploadLifecycleService (Real PostgreSQL Integration Tests — EL-TK-087..093)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    auditEvents.length = 0;
    storedObjects.clear();
    releasedReservations.length = 0;
    committedReservations.length = 0;
    acceptedMediaHandoffs.length = 0;

    await sql('DELETE FROM upload_attempt');
    await sql('DELETE FROM guest_consent_record');
    await sql('DELETE FROM guest_session');
    await sql('DELETE FROM public_access_credential');
    await sql('DELETE FROM event');
    await sql('DELETE FROM admin_audit_event');
  });

  const auditEvents: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    record: async (event) => {
      auditEvents.push(event);
      await sql(
        `INSERT INTO admin_audit_event (id, procedure, actor_id, target_identifier, result, details, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        event.id,
        event.procedure,
        event.actorId,
        event.targetIdentifier,
        event.result,
        event.details ?? null,
        event.timestamp
      );
    }
  };

  const storedObjects = new Map<string, { sizeBytes: bigint; contentType: string; content: Buffer }>();
  const storagePort: DirectUploadStoragePort = {
    createUploadUrl: async (params) => ({
      uploadUrl: `https://storage.internal.test/upload/${params.objectKey}?token=${randomBytes(16).toString('hex')}`,
      method: 'PUT',
      headers: { 'Content-Type': params.declaredType },
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000)
    }),
    getObjectMetadata: async (objectKey) => {
      const obj = storedObjects.get(objectKey);
      if (!obj) return null;
      return {
        objectKey,
        sizeBytes: obj.sizeBytes,
        contentType: obj.contentType,
        etag: 'etag-pg-123'
      };
    },
    readBytesRange: async (objectKey, start, end) => {
      const obj = storedObjects.get(objectKey);
      if (!obj) throw new Error('Object not found');
      return obj.content.subarray(start, end);
    },
    abortOrDeleteObject: async (objectKey) => {
      storedObjects.delete(objectKey);
    }
  };

  const releasedReservations: string[] = [];
  const committedReservations: { eventId: string; reservationId?: string }[] = [];
  const capacityPort: CapacityReservationPort = {
    reserveCapacity: vi.fn(async (params) => ({
      reservation: {
        id: randomUUID(),
        bytes: BigInt(params.bytes),
        fileSlots: 1,
        status: 'ACTIVE'
      },
      isExisting: false
    })),
    releaseReservation: vi.fn(async (params) => {
      if (params.reservationId) {
        releasedReservations.push(params.reservationId);
      }
    }),
    commitReservation: vi.fn(async (params) => {
      committedReservations.push({
        eventId: params.eventId,
        reservationId: params.reservationId
      });
    })
  };

  const acceptedMediaHandoffs: unknown[] = [];
  const mediaAcceptancePort: MediaAcceptancePort = {
    acceptOriginal: vi.fn(async (command) => {
      acceptedMediaHandoffs.push(command);
      return {
        mediaRef: command.mediaRef,
        jobId: randomUUID(),
        acceptedAt: new Date()
      };
    })
  };

  const guestSessionService = new GuestSessionService(txs, auditSink);
  const uploadAuthService = new UploadAuthorizationService(
    txs,
    guestSessionService,
    capacityPort,
    auditSink
  );

  const lifecycleService = new UploadLifecycleService(
    txs,
    guestSessionService,
    storagePort,
    capacityPort,
    mediaAcceptancePort,
    auditSink
  );

  async function createActiveEventWithSession() {
    const eventId = randomUUID();
    const organizerId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86400_000);

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled, pin_enabled, activated_at, expires_at)
       VALUES ($1, $2, 'Integration Test Event', 'ACTIVE', true, true, false, $3, $4)`,
      eventId,
      organizerId,
      now,
      expiresAt
    );

    const lookupKey = `lookup_${randomBytes(8).toString('hex')}`;
    await sql(
      `INSERT INTO public_access_credential (id, event_id, lookup_key, token_hash, generation, pin_required)
       VALUES ($1, $2, $3, 'test_hash', 1, false)`,
      randomUUID(),
      eventId,
      lookupKey
    );

    const { session } = await guestSessionService.createGuestSession({ lookupKey });
    await guestSessionService.recordConsent({
      sessionToken: session.token,
      documentVersion: 'v2026.1',
      accepted: true
    });
    await guestSessionService.setContributorNickname({
      sessionToken: session.token,
      nickname: 'Carlos Mendoza'
    });

    return { eventId, sessionToken: session.token, guestSessionId: session.id };
  }

  it('EL-TK-087: creates direct upload URL and transitions attempt to UPLOADING in PostgreSQL', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    const authResult = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2048000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-url-01'
    });

    expect(authResult.outcome).toBe('AUTHORIZED');

    const issueResult = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: authResult.attempt.id
    });

    expect(issueResult.outcome).toBe('ISSUED');
    expect(issueResult.grant.uploadUrl).toContain('https://storage.internal.test/upload/');
    expect(issueResult.grant.objectKey).toBeDefined();

    // Verify row in PostgreSQL
    const rows = await query<any>('SELECT * FROM upload_attempt WHERE id = $1', authResult.attempt.id);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('UPLOADING');
    expect(rows[0].object_key).toBe(issueResult.grant.objectKey);

    // Verify audit log exists and does NOT contain secrets/signed params
    const auditRecord = auditEvents.find((a) => a.procedure === 'UPLOAD_URL_ISSUED');
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.details).toContain(issueResult.grant.objectKey);
    expect(auditRecord?.details).not.toContain('token=');
  });

  it('EL-TK-088: confirms uploaded original existence and records actual size in PostgreSQL', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    const auth = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 4000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-conf-01'
    });

    const issued = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: auth.attempt.id
    });

    // Seed mock storage object
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    storedObjects.set(issued.grant.objectKey, {
      sizeBytes: 3850000n,
      contentType: 'image/png',
      content: pngBytes
    });

    const confirmResult = await lifecycleService.confirmUpload({
      sessionToken,
      attemptId: auth.attempt.id
    });

    expect(confirmResult.outcome).toBe('CONFIRMED');
    expect(confirmResult.attempt.status).toBe('CONFIRMING');
    expect(confirmResult.attempt.actualSize).toBe(3850000n);

    // Verify PostgreSQL persistence
    const rows = await query<any>('SELECT * FROM upload_attempt WHERE id = $1', auth.attempt.id);
    expect(rows[0].status).toBe('CONFIRMING');
    expect(BigInt(rows[0].actual_size)).toBe(3850000n);
  });

  it('EL-TK-089: validates magic bytes safely and rejects non-media payloads, releasing reserved capacity', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    // 1. Valid PNG
    const authValid = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-val-valid'
    });
    const issuedValid = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: authValid.attempt.id
    });
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    storedObjects.set(issuedValid.grant.objectKey, {
      sizeBytes: 1500000n,
      contentType: 'image/png',
      content: pngHeader
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: authValid.attempt.id });

    const valValid = await lifecycleService.validateUpload({
      sessionToken,
      attemptId: authValid.attempt.id
    });
    expect(valValid.valid).toBe(true);
    expect(valValid.detectedType).toBe('image/png');

    // 2. Invalid bytes -> Rejected and capacity released
    const authInvalid = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-val-invalid'
    });
    const issuedInvalid = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: authInvalid.attempt.id
    });
    const badBytes = Buffer.from('MZ executable file or unknown random data content');
    storedObjects.set(issuedInvalid.grant.objectKey, {
      sizeBytes: 1500000n,
      contentType: 'application/octet-stream',
      content: badBytes
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: authInvalid.attempt.id });

    const valInvalid = await lifecycleService.validateUpload({
      sessionToken,
      attemptId: authInvalid.attempt.id
    });
    expect(valInvalid.valid).toBe(false);
    expect(valInvalid.outcome).toBe('REJECTED');
    expect(valInvalid.rejectionReason).toBeDefined();

    // Verify rejection in PostgreSQL
    const rows = await query<any>('SELECT * FROM upload_attempt WHERE id = $1', authInvalid.attempt.id);
    expect(rows[0].status).toBe('REJECTED');
    expect(rows[0].rejection_reason).toBe('UNSUPPORTED_MEDIA_TYPE');

    // Verify reservation release
    expect(releasedReservations).toContain(authInvalid.attempt.reservationId);
  });

  it('EL-TK-090: atomically accepts validated original, commits capacity and dispatches to MediaAcceptancePort', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    const auth = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 5000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-acc-01'
    });
    const issued = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: auth.attempt.id
    });
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    storedObjects.set(issued.grant.objectKey, {
      sizeBytes: 4200000n,
      contentType: 'image/jpeg',
      content: jpegHeader
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth.attempt.id });

    const acceptResult = await lifecycleService.acceptUpload({
      sessionToken,
      attemptId: auth.attempt.id
    });

    expect(acceptResult.outcome).toBe('ACCEPTED');
    expect(acceptResult.attempt.status).toBe('ACCEPTED');
    expect(acceptResult.mediaRef).toBeDefined();

    // Capacity committed
    expect(committedReservations.some((c) => c.reservationId === auth.attempt.reservationId)).toBe(true);

    // Media Acceptance handoff received
    expect(acceptedMediaHandoffs.length).toBe(1);

    // PostgreSQL status
    const rows = await query<any>('SELECT * FROM upload_attempt WHERE id = $1', auth.attempt.id);
    expect(rows[0].status).toBe('ACCEPTED');
  });

  it('EL-TK-091: renews upload grant for retry without duplicate reservation', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    const auth = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 3000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-renew-01'
    });

    const renewResult = await lifecycleService.renewUploadGrant({
      sessionToken,
      attemptId: auth.attempt.id,
      reason: 'NETWORK_TIMEOUT'
    });

    expect(renewResult.outcome).toBe('RENEWED');
    expect(renewResult.grant.uploadUrl).toBeDefined();

    // Capacity reserve was only called once for the initial authorization
    expect(capacityPort.reserveCapacity).toHaveBeenCalledTimes(1);
  });

  it('EL-TK-092: cancels unconfirmed attempts upon policy change while strictly preserving accepted originals (DEC-085)', async () => {
    const { eventId, sessionToken } = await createActiveEventWithSession();

    // Item 1: ACCEPTED
    const auth1 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-dec085-acc'
    });
    const issued1 = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth1.attempt.id });
    storedObjects.set(issued1.grant.objectKey, {
      sizeBytes: 1800000n,
      contentType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: auth1.attempt.id });

    // Item 2: in-flight UPLOADING
    const auth2 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 3000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-dec085-inflight'
    });
    await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth2.attempt.id });

    // Item 3: in-flight CONFIRMING
    const auth3 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 4000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-dec085-confirming'
    });
    const issued3 = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth3.attempt.id });
    storedObjects.set(issued3.grant.objectKey, {
      sizeBytes: 3900000n,
      contentType: 'image/png',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth3.attempt.id });

    // Reconcile policy cancellation (e.g. event closed)
    const cancelResult = await lifecycleService.reconcilePolicyCancellations({
      eventId,
      reason: 'EVENT_CLOSED'
    });

    expect(cancelResult.cancelledAttemptIds).toContain(auth2.attempt.id);
    expect(cancelResult.cancelledAttemptIds).toContain(auth3.attempt.id);
    expect(cancelResult.cancelledAttemptIds).not.toContain(auth1.attempt.id);

    // Invariant DEC-085: Item 1 is ACCEPTED
    const [row1] = await query<any>('SELECT status FROM upload_attempt WHERE id = $1', auth1.attempt.id);
    expect(row1.status).toBe('ACCEPTED');

    // Items 2 and 3 are CANCELLED
    const [row2] = await query<any>('SELECT status, rejection_reason FROM upload_attempt WHERE id = $1', auth2.attempt.id);
    expect(row2.status).toBe('CANCELLED');
    expect(row2.rejection_reason).toBe('EVENT_CLOSED');

    const [row3] = await query<any>('SELECT status, rejection_reason FROM upload_attempt WHERE id = $1', auth3.attempt.id);
    expect(row3.status).toBe('CANCELLED');
    expect(row3.rejection_reason).toBe('EVENT_CLOSED');

    // Released reservations for unconfirmed items
    expect(releasedReservations).toContain(auth2.attempt.reservationId);
    expect(releasedReservations).toContain(auth3.attempt.reservationId);
  });

  it('EL-TK-093: returns authorized batch snapshot for guest session distinguishing upload reception from processing', async () => {
    const { sessionToken } = await createActiveEventWithSession();

    // 1 accepted
    const auth1 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-snap-1'
    });
    const issued1 = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth1.attempt.id });
    storedObjects.set(issued1.grant.objectKey, {
      sizeBytes: 1800000n,
      contentType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: auth1.attempt.id });

    // 1 in-flight
    const auth2 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 1000000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'idemp-pg-snap-2'
    });

    const snapshot = await lifecycleService.getUploadBatchSnapshot({ sessionToken });

    expect(snapshot.totalFiles).toBe(2);
    expect(snapshot.receivedCount).toBe(1);
    expect(snapshot.inProgressCount).toBe(1);
    expect(snapshot.items.length).toBe(2);

    const acceptedItem = snapshot.items.find((i) => i.attemptId === auth1.attempt.id);
    expect(acceptedItem?.status).toBe('ACCEPTED');

    const inFlightItem = snapshot.items.find((i) => i.attemptId === auth2.attempt.id);
    expect(inFlightItem?.status).toBe('AUTHORIZED');
  });
});
