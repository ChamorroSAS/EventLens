import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import {
  UploadLifecycleService,
  UploadAuthorizationService,
  GuestSessionService,
  EventManagementError,
  type DirectUploadStoragePort,
  type CapacityReservationPort,
  type MediaAcceptancePort,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('EL-TK-095: Mobile Upload Full Flow & Partial Results Integration Validation', () => {
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
    acceptedHandoffs.length = 0;

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
      uploadUrl: `https://storage.internal.test/upload/${params.objectKey}?sig=${randomBytes(16).toString('hex')}`,
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
        etag: 'etag-e2e-123'
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
  let availableCapacityBytes = 100_000_000n; // 100MB default

  const capacityPort: CapacityReservationPort = {
    reserveCapacity: vi.fn(async (params) => {
      const requested = BigInt(params.bytes);
      if (requested > availableCapacityBytes) {
        throw new EventManagementError('CAPACITY_EXCEEDED', 'Event capacity reservation quota exceeded');
      }
      availableCapacityBytes -= requested;
      return {
        reservation: {
          id: randomUUID(),
          bytes: requested,
          fileSlots: 1,
          status: 'ACTIVE'
        },
        isExisting: false
      };
    }),
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

  const acceptedHandoffs: any[] = [];
  const mediaAcceptancePort: MediaAcceptancePort = {
    acceptOriginal: vi.fn(async (command) => {
      acceptedHandoffs.push(command);
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

  async function setupActiveEventWithGuest() {
    availableCapacityBytes = 100_000_000n;
    const eventId = randomUUID();
    const organizerId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 86400_000);

    await sql(
      `INSERT INTO event (id, organizer_id, name, status, uploads_enabled, guest_gallery_enabled, pin_enabled, activated_at, expires_at)
       VALUES ($1, $2, 'E2E Wedding Gala', 'ACTIVE', true, true, false, $3, $4)`,
      eventId,
      organizerId,
      now,
      expiresAt
    );

    const lookupKey = `e2e_lookup_${randomBytes(8).toString('hex')}`;
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
      nickname: 'Familia Gómez'
    });

    return { eventId, sessionToken: session.token, guestSessionId: session.id };
  }

  it('Escenario 1: Mixed valid batch (photo + video) under normal conditions is preserved and handed off exactly once to processing pipeline', async () => {
    const { eventId, sessionToken } = await setupActiveEventWithGuest();

    // 1. Photo item (JPEG)
    const photoAuth = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 3_500_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-batch-photo-01'
    });
    const photoUrl = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: photoAuth.attempt.id
    });
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    storedObjects.set(photoUrl.grant.objectKey, {
      sizeBytes: 3_200_000n,
      contentType: 'image/jpeg',
      content: jpegBytes
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: photoAuth.attempt.id });
    const photoVal = await lifecycleService.validateUpload({ sessionToken, attemptId: photoAuth.attempt.id });
    expect(photoVal.valid).toBe(true);
    const photoAccepted = await lifecycleService.acceptUpload({ sessionToken, attemptId: photoAuth.attempt.id });
    expect(photoAccepted.outcome).toBe('ACCEPTED');

    // 2. Video item (MP4)
    const videoAuth = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 25_000_000n,
      declaredType: 'VIDEO',
      idempotencyKey: 'e2e-batch-video-01'
    });
    const videoUrl = await lifecycleService.createDirectUploadUrl({
      sessionToken,
      attemptId: videoAuth.attempt.id
    });
    // Synthetic MP4 box with ftyp
    const mp4Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // size 32, 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor_version 512
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible brands
      0x6d, 0x70, 0x34, 0x31, 0x00, 0x00, 0x00, 0x00
    ]);
    storedObjects.set(videoUrl.grant.objectKey, {
      sizeBytes: 24_500_000n,
      contentType: 'video/mp4',
      content: mp4Bytes
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: videoAuth.attempt.id });
    const videoVal = await lifecycleService.validateUpload({ sessionToken, attemptId: videoAuth.attempt.id });
    expect(videoVal.valid).toBe(true);
    const videoAccepted = await lifecycleService.acceptUpload({ sessionToken, attemptId: videoAuth.attempt.id });
    expect(videoAccepted.outcome).toBe('ACCEPTED');

    // Verification: exactly 2 handoffs to processing pipeline, each handed off once
    expect(acceptedHandoffs.length).toBe(2);
    expect(acceptedHandoffs[0].original.key).toBe(photoUrl.grant.objectKey);
    expect(acceptedHandoffs[1].original.key).toBe(videoUrl.grant.objectKey);

    // Verification: Both rows in PostgreSQL are ACCEPTED
    const attempts = await query<any>(
      'SELECT id, status, actual_size FROM upload_attempt WHERE event_id = $1 ORDER BY created_at ASC',
      eventId
    );
    expect(attempts.length).toBe(2);
    expect(attempts[0].status).toBe('ACCEPTED');
    expect(attempts[1].status).toBe('ACCEPTED');

    // Batch snapshot shows 2 received
    const snapshot = await lifecycleService.getUploadBatchSnapshot({ sessionToken });
    expect(snapshot.totalFiles).toBe(2);
    expect(snapshot.receivedCount).toBe(2);
    expect(snapshot.inProgressCount).toBe(0);
  });

  it('Escenario 2: Temporary failure on one file recovers via retry without duplicating results or affecting other items', async () => {
    const { sessionToken } = await setupActiveEventWithGuest();

    // File 1: Succeeds immediately
    const auth1 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 2_000_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-retry-item-01'
    });
    const url1 = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth1.attempt.id });
    storedObjects.set(url1.grant.objectKey, {
      sizeBytes: 1_900_000n,
      contentType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: auth1.attempt.id });

    // File 2: Fails during first attempt (network timeout before storage confirms)
    const auth2 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 4_000_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-retry-item-02'
    });
    await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth2.attempt.id });
    // Intentionally do NOT put in storage yet (simulating client network drop)

    // Check snapshot while File 2 is in-flight: File 1 received, File 2 in progress
    const snapMid = await lifecycleService.getUploadBatchSnapshot({ sessionToken });
    expect(snapMid.receivedCount).toBe(1);
    expect(snapMid.inProgressCount).toBe(1);

    // Client retries File 2: renews upload grant
    const renew = await lifecycleService.renewUploadGrant({
      sessionToken,
      attemptId: auth2.attempt.id,
      reason: 'NETWORK_TIMEOUT'
    });
    expect(renew.outcome).toBe('RENEWED');

    // Client completes transfer on renewed URL
    storedObjects.set(renew.grant.objectKey, {
      sizeBytes: 3_800_000n,
      contentType: 'image/png',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth2.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth2.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: auth2.attempt.id });

    // Verify: File 1 maintained state, File 2 succeeded, 0 duplicates
    expect(acceptedHandoffs.length).toBe(2);

    const snapFinal = await lifecycleService.getUploadBatchSnapshot({ sessionToken });
    expect(snapFinal.totalFiles).toBe(2);
    expect(snapFinal.receivedCount).toBe(2);
    expect(snapFinal.inProgressCount).toBe(0);
  });

  it('Escenario 3: Near-quota concurrency rejects excess requests cleanly without exceeding capacity or losing confirmed files', async () => {
    const { sessionToken } = await setupActiveEventWithGuest();

    // Set available capacity strictly to 10 MB
    availableCapacityBytes = 10_000_000n;

    // 1. First upload of 7 MB (succeeds, leaves 3 MB)
    const auth1 = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 7_000_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-quota-01'
    });
    expect(auth1.outcome).toBe('AUTHORIZED');

    const url1 = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: auth1.attempt.id });
    storedObjects.set(url1.grant.objectKey, {
      sizeBytes: 6_800_000n,
      contentType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: auth1.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: auth1.attempt.id });

    // 2. Second upload competing with 6 MB (exceeds remaining 3 MB quota)
    await expect(
      uploadAuthService.authorizeUploadAttempt({
        sessionToken,
        declaredSize: 6_000_000n,
        declaredType: 'PHOTO',
        idempotencyKey: 'e2e-quota-02'
      })
    ).rejects.toThrow('Event capacity reservation quota exceeded');

    // 3. Confirm prior accepted file is intact and safe
    const [row1] = await query<any>('SELECT status FROM upload_attempt WHERE id = $1', auth1.attempt.id);
    expect(row1.status).toBe('ACCEPTED');

    // Total accepted files remains 1
    const snap = await lifecycleService.getUploadBatchSnapshot({ sessionToken });
    expect(snap.receivedCount).toBe(1);
    expect(snap.inProgressCount).toBe(0);
  });

  it('Escenario 4: Policy closure during in-flight transfer cancels unconfirmed items, releases reservations and strictly preserves accepted originals (DEC-085)', async () => {
    const { eventId, sessionToken } = await setupActiveEventWithGuest();

    // 1. One ACCEPTED file
    const authAcc = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 3_000_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-pol-acc'
    });
    const urlAcc = await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: authAcc.attempt.id });
    storedObjects.set(urlAcc.grant.objectKey, {
      sizeBytes: 2_900_000n,
      contentType: 'image/jpeg',
      content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
    });
    await lifecycleService.confirmUpload({ sessionToken, attemptId: authAcc.attempt.id });
    await lifecycleService.validateUpload({ sessionToken, attemptId: authAcc.attempt.id });
    await lifecycleService.acceptUpload({ sessionToken, attemptId: authAcc.attempt.id });

    // 2. One in-flight file (UPLOADING)
    const authInflight = await uploadAuthService.authorizeUploadAttempt({
      sessionToken,
      declaredSize: 5_000_000n,
      declaredType: 'PHOTO',
      idempotencyKey: 'e2e-pol-inflight'
    });
    await lifecycleService.createDirectUploadUrl({ sessionToken, attemptId: authInflight.attempt.id });

    // Event is closed by organizer/admin (policy change)
    await sql("UPDATE event SET status = 'CLOSED', closed_at = NOW() WHERE id = $1", eventId);

    // Reconcile policy cancellations
    const reconciliation = await lifecycleService.reconcilePolicyCancellations({
      eventId,
      reason: 'EVENT_CLOSED'
    });

    expect(reconciliation.cancelledAttemptIds).toContain(authInflight.attempt.id);
    expect(reconciliation.cancelledAttemptIds).not.toContain(authAcc.attempt.id);

    // Reserved capacity of in-flight file is released
    expect(releasedReservations).toContain(authInflight.attempt.reservationId);

    // DEC-085 Invariant: Accepted file remains ACCEPTED
    const [rowAcc] = await query<any>('SELECT status FROM upload_attempt WHERE id = $1', authAcc.attempt.id);
    expect(rowAcc.status).toBe('ACCEPTED');

    // In-flight file is CANCELLED with reason
    const [rowInflight] = await query<any>(
      'SELECT status, rejection_reason FROM upload_attempt WHERE id = $1',
      authInflight.attempt.id
    );
    expect(rowInflight.status).toBe('CANCELLED');
    expect(rowInflight.rejection_reason).toBe('EVENT_CLOSED');
  });
});
