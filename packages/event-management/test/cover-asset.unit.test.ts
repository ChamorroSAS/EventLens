import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
import {
  CoverAssetService,
  EventDraftService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord,
  type DirectUploadStoragePort,
  type EventRecord,
  type CoverAssetRecord,
  type CoverUploadIntentRecord
} from '../src/index.js';

interface InMemoryDb {
  events: Map<string, any>;
  coverIntents: Map<string, any>;
  coverAssets: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // 1. SELECT preview_url FROM event_cover_asset WHERE id = $1 AND status = 'READY'
          if (
            normalized.includes('FROM event_cover_asset') &&
            normalized.includes("status = 'READY'")
          ) {
            const id = params[0] as string;
            const asset = db.coverAssets.get(id);
            if (asset && asset.status === 'READY') {
              return [{ preview_url: asset.preview_url }] as unknown as T[];
            }
            return [] as unknown as T[];
          }

          // 2. SELECT * FROM event_cover_asset WHERE event_id = $1 AND status != 'DELETED'
          if (
            normalized.includes('FROM event_cover_asset') &&
            normalized.includes("status != 'DELETED'")
          ) {
            const eventId = params[0] as string;
            const list = Array.from(db.coverAssets.values()).filter(
              (a) => a.event_id === eventId && a.status !== 'DELETED'
            );
            return list.map((a) => ({ ...a })) as unknown as T[];
          }

          // 3. SELECT * FROM event_cover_asset WHERE id = $1
          if (normalized.includes('FROM event_cover_asset') && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const asset = db.coverAssets.get(id);
            if (asset) return [{ ...asset }] as unknown as T[];
            return [] as unknown as T[];
          }

          // 4. SELECT * FROM event_cover_upload_intent WHERE event_id = $1 AND idempotency_key = $2
          if (
            normalized.includes('FROM event_cover_upload_intent') &&
            normalized.includes('idempotency_key = $2')
          ) {
            const eventId = params[0] as string;
            const key = params[1] as string;
            const found = Array.from(db.coverIntents.values()).filter(
              (i) => i.event_id === eventId && i.idempotency_key === key
            );
            return found.map((i) => ({ ...i })) as unknown as T[];
          }

          // 5. SELECT * FROM event_cover_upload_intent WHERE id = $1
          if (normalized.includes('FROM event_cover_upload_intent') && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const intent = db.coverIntents.get(id);
            if (intent) return [{ ...intent }] as unknown as T[];
            return [] as unknown as T[];
          }

          // 6. SELECT cover_asset_id FROM event WHERE id = $1 (or SELECT id, cover_asset_id)
          if (
            normalized.startsWith('SELECT cover_asset_id FROM event') ||
            normalized.startsWith('SELECT id, cover_asset_id FROM event')
          ) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ id: ev.id, cover_asset_id: ev.cover_asset_id }] as unknown as T[];
            return [] as unknown as T[];
          }

          // 7. SELECT FROM event WHERE id = $1
          if (/\bFROM event\b/.test(normalized) && normalized.includes('WHERE id = $1')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          // 8. UPDATE event SET cover_asset_id = ... RETURNING *
          if (normalized.includes('UPDATE event') && normalized.includes('cover_asset_id = $1')) {
            const assetId = params[0] as string;
            const idempotencyKey = params[1] as string | null;
            const payloadHash = params[2] as string | null;
            const now = params[3] as Date;
            const eventId = params[4] as string;

            const existing = db.events.get(eventId);
            if (!existing) throw new Error(`Event ${eventId} not found for cover assignment`);

            existing.cover_asset_id = assetId;
            if (idempotencyKey) existing.idempotency_key = idempotencyKey;
            if (payloadHash) existing.idempotency_payload_hash = payloadHash;
            existing.updated_at = now;

            db.events.set(eventId, existing);
            return [{ ...existing }] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // 1. INSERT INTO event_cover_upload_intent
          if (normalized.includes('INSERT INTO event_cover_upload_intent')) {
            const id = params[0] as string;
            const eventId = params[1] as string;
            const ownerId = params[2] as string;
            const assetId = params[3] as string;
            const declaredSize = params[4] as bigint;
            const declaredType = params[5] as string;
            const stagingKey = params[6] as string;
            const idempotencyKey = params[7] as string | null;
            const idempotencyPayloadHash = params[8] as string | null;
            const expiresAt = params[9] as Date;
            const createdAt = params[10] as Date;
            const updatedAt = params[11] as Date;

            db.coverIntents.set(id, {
              id,
              event_id: eventId,
              owner_id: ownerId,
              asset_id: assetId,
              declared_size: declaredSize,
              declared_type: declaredType,
              staging_key: stagingKey,
              status: 'AUTHORIZED',
              idempotency_key: idempotencyKey,
              idempotency_payload_hash: idempotencyPayloadHash,
              expires_at: expiresAt,
              created_at: createdAt,
              updated_at: updatedAt
            });
            return 1;
          }

          // 2. UPDATE event_cover_upload_intent SET status = 'EXPIRED'
          if (normalized.includes('UPDATE event_cover_upload_intent SET status = \'EXPIRED\'')) {
            const now = params[0] as Date;
            const id = params[1] as string;
            const existing = db.coverIntents.get(id);
            if (existing) {
              existing.status = 'EXPIRED';
              existing.updated_at = now;
              db.coverIntents.set(id, existing);
            }
            return 1;
          }

          // 3. UPDATE event_cover_upload_intent SET status = 'CONFIRMED'
          if (normalized.includes('UPDATE event_cover_upload_intent SET status = \'CONFIRMED\'')) {
            const now = params[0] as Date;
            const id = params[1] as string;
            const existing = db.coverIntents.get(id);
            if (existing) {
              existing.status = 'CONFIRMED';
              existing.updated_at = now;
              db.coverIntents.set(id, existing);
            }
            return 1;
          }

          // 4. INSERT INTO event_cover_asset ... ON CONFLICT
          if (normalized.includes('INSERT INTO event_cover_asset')) {
            const id = params[0] as string;
            const eventId = params[1] as string;
            const ownerId = params[2] as string;
            const originalKey = params[3] as string;
            const declaredSize = params[4] as bigint;
            const declaredType = params[5] as string;
            const actualSize = params[6] as bigint;
            const detectedType = params[7] as string;
            const createdAt = params[8] as Date;
            const updatedAt = params[9] as Date;

            db.coverAssets.set(id, {
              id,
              event_id: eventId,
              owner_id: ownerId,
              purpose: 'EVENT_COVER',
              status: 'RECEIVED',
              original_key: originalKey,
              declared_size: declaredSize,
              declared_type: declaredType,
              actual_size: actualSize,
              detected_type: detectedType,
              checksum_sha256: null,
              thumbnail_key: null,
              preview_key: null,
              preview_url: null,
              generation: 1n,
              failure_reason: null,
              created_at: createdAt,
              updated_at: updatedAt
            });
            return 1;
          }

          // 5. UPDATE event_cover_asset SET status = 'QUARANTINED' / 'FAILED'
          if (
            normalized.includes('UPDATE event_cover_asset') &&
            (normalized.includes("status = 'QUARANTINED'") || normalized.includes("status = 'FAILED'"))
          ) {
            const reason = params[0] as string;
            const now = params[1] as Date;
            const id = params[2] as string;
            const existing = db.coverAssets.get(id);
            if (existing) {
              existing.status = normalized.includes("status = 'QUARANTINED'") ? 'QUARANTINED' : 'FAILED';
              existing.failure_reason = reason;
              existing.updated_at = now;
              db.coverAssets.set(id, existing);
            }
            return 1;
          }

          // 6. UPDATE event_cover_asset SET status = 'READY'
          if (normalized.includes('UPDATE event_cover_asset') && normalized.includes("status = 'READY'")) {
            const thumbnailKey = params[0] as string;
            const previewKey = params[1] as string;
            const previewUrl = params[2] as string;
            const checksumSha256 = params[3] as string | null;
            const now = params[4] as Date;
            const id = params[5] as string;

            const existing = db.coverAssets.get(id);
            if (existing) {
              existing.status = 'READY';
              existing.thumbnail_key = thumbnailKey;
              existing.preview_key = previewKey;
              existing.preview_url = previewUrl;
              existing.checksum_sha256 = checksumSha256 ?? existing.checksum_sha256;
              existing.failure_reason = null;
              existing.updated_at = now;
              db.coverAssets.set(id, existing);
            }
            return 1;
          }

          // 7. UPDATE event_cover_asset SET status = 'DELETED'
          if (normalized.includes('UPDATE event_cover_asset') && normalized.includes("status = 'DELETED'")) {
            const now = params[0] as Date;
            const id = params[1] as string;
            const existing = db.coverAssets.get(id);
            if (existing) {
              existing.status = 'DELETED';
              existing.updated_at = now;
              db.coverAssets.set(id, existing);
            }
            return 1;
          }

          throw new Error(`Unhandled mock execute: ${sql}`);
        }
      };

      return callback(tx);
    }
  };
}

class MockStoragePort implements DirectUploadStoragePort {
  public objects = new Map<string, { sizeBytes: bigint; contentType: string }>();
  public deletedKeys: string[] = [];
  public createdUrls: string[] = [];

  async createUploadUrl(params: {
    objectKey: string;
    declaredSize: bigint | number;
    declaredType: string;
    ttlSeconds: number;
  }) {
    const uploadUrl = `https://storage.eventlens.local/upload/${params.objectKey}`;
    this.createdUrls.push(uploadUrl);
    return {
      uploadUrl,
      method: 'PUT' as const,
      headers: { 'Content-Type': params.declaredType },
      expiresAt: new Date(Date.now() + params.ttlSeconds * 1000)
    };
  }

  async getObjectMetadata(objectKey: string) {
    const obj = this.objects.get(objectKey);
    if (!obj) return null;
    return {
      objectKey,
      sizeBytes: obj.sizeBytes,
      contentType: obj.contentType,
      lastModified: new Date()
    };
  }

  async abortOrDeleteObject(objectKey: string): Promise<void> {
    this.deletedKeys.push(objectKey);
    this.objects.delete(objectKey);
  }
}

describe('EL-EP-002 Ruta 3: Cover Asset Service (Unit Tests)', () => {
  let db: InMemoryDb;
  let auditRecords: EventAuditRecord[];
  let auditSink: EventAuditSink;
  let storagePort: MockStoragePort;
  let service: CoverAssetService;
  let draftService: EventDraftService;
  let ownerActor: OrganizerActorContext;
  let otherActor: OrganizerActorContext;
  let eventId: string;

  beforeEach(() => {
    auditRecords = [];
    auditSink = {
      record: async (rec: EventAuditRecord) => {
        auditRecords.push(rec);
      }
    };

    db = {
      events: new Map(),
      coverIntents: new Map(),
      coverAssets: new Map(),
      auditEvents: auditRecords
    };

    storagePort = new MockStoragePort();
    const runner = createInMemoryRunner(db);
    service = new CoverAssetService(runner, storagePort, auditSink);
    draftService = new EventDraftService(runner, auditSink);

    ownerActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'organizer@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    otherActor = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: randomUUID(),
      email: 'other@eventlens.local',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };

    eventId = randomUUID();
    db.events.set(eventId, {
      id: eventId,
      organizer_id: ownerActor.accountId,
      name: 'Boda Alejandra & Mateo',
      status: 'DRAFT',
      timezone: 'America/Bogota',
      starts_at_local: null,
      scheduled_at: null,
      utc_offset_minutes: null,
      expires_at: null,
      grace_ends_at: null,
      activated_at: null,
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: null,
      grace_days: null,
      uploads_enabled: false,
      guest_gallery_enabled: false,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      welcome_message: null,
      cover_asset_id: null,
      created_at: new Date('2026-10-12T10:00:00Z'),
      updated_at: new Date('2026-10-12T10:00:00Z')
    });
  });

  // =========================================================================
  // EL-TK-049: createCoverUpload
  // =========================================================================
  describe('EL-TK-049: createCoverUpload', () => {
    it('rejects unauthenticated actor context', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: null as any,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects missing or empty eventId', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId: '',
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('rejects size equal to 0 or negative', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 0n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDS_LIMIT' });
    });

    it('rejects size exceeding 25MB (25,000,000 bytes)', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 25_000_001n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDS_LIMIT' });
    });

    it('rejects unsupported media types (e.g. video/mp4, image/gif, application/pdf)', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'video/mp4'
        })
      ).rejects.toMatchObject({ code: 'INVALID_MEDIA_TYPE' });

      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'image/gif'
        })
      ).rejects.toMatchObject({ code: 'INVALID_MEDIA_TYPE' });
    });

    it('accepts valid MIME types (JPEG, PNG, HEIC, HEIF, WebP)', async () => {
      const types = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
      for (const t of types) {
        const res = await service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 1_000_000n,
          declaredType: t
        });
        expect(res.outcome).toBe('AUTHORIZED');
        expect(res.intent.declaredType).toBe(t);
        expect(res.uploadGrant.uploadUrl).toBeDefined();
      }
    });

    it('rejects non-existent event', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId: randomUUID(),
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
    });

    it('rejects actor who is not the event owner', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: otherActor,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_UPLOAD_AUTHORIZED',
          result: 'REJECTED_UNAUTHORIZED'
        })
      );
    });

    it('rejects if event is not in DRAFT or SCHEDULED (e.g. ACTIVE)', async () => {
      db.events.get(eventId).status = 'ACTIVE';

      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg'
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_UPLOAD_AUTHORIZED',
          result: 'REJECTED_INVALID_STATE'
        })
      );
    });

    it('allows cover upload for SCHEDULED event', async () => {
      db.events.get(eventId).status = 'SCHEDULED';

      const res = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 5_000_000n,
        declaredType: 'image/jpeg'
      });
      expect(res.outcome).toBe('AUTHORIZED');
    });

    it('rejects config revision mismatch with CONCURRENCY_CONFLICT', async () => {
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 5_000_000n,
          declaredType: 'image/jpeg',
          expectedConfigRevision: '9999999999999'
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });
    });

    it('handles idempotency replay and prevents idempotency conflicts', async () => {
      const idempotencyKey = randomUUID();

      const first = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 5_000_000n,
        declaredType: 'image/jpeg',
        idempotencyKey
      });
      expect(first.outcome).toBe('AUTHORIZED');

      // Replay identical
      const replay = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 5_000_000n,
        declaredType: 'image/jpeg',
        idempotencyKey
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.intent.id).toBe(first.intent.id);

      // Conflict with different parameters
      await expect(
        service.createCoverUpload({
          actorContext: ownerActor,
          eventId,
          declaredSize: 8_000_000n,
          declaredType: 'image/png',
          idempotencyKey
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  // =========================================================================
  // EL-TK-049: confirmCoverUpload
  // =========================================================================
  describe('EL-TK-049: confirmCoverUpload', () => {
    let intentId: string;
    let stagingKey: string;

    beforeEach(async () => {
      const res = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 4_000_000n,
        declaredType: 'image/jpeg'
      });
      intentId = res.intent.id;
      stagingKey = res.intent.stagingKey;

      storagePort.objects.set(stagingKey, {
        sizeBytes: 4_000_000n,
        contentType: 'image/jpeg'
      });
    });

    it('rejects non-existent intent', async () => {
      await expect(
        service.confirmCoverUpload({
          actorContext: ownerActor,
          intentId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'COVER_UPLOAD_INTENT_NOT_FOUND' });
    });

    it('rejects non-owner trying to confirm intent', async () => {
      await expect(
        service.confirmCoverUpload({
          actorContext: otherActor,
          intentId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects if intent has expired, marking intent as EXPIRED', async () => {
      const intent = db.coverIntents.get(intentId);
      intent.expires_at = new Date('2020-01-01T00:00:00Z');

      await expect(
        service.confirmCoverUpload({
          actorContext: ownerActor,
          intentId,
          now: new Date('2026-10-12T12:00:00Z')
        })
      ).rejects.toMatchObject({ code: 'COVER_UPLOAD_INTENT_EXPIRED' });

      expect(db.coverIntents.get(intentId).status).toBe('EXPIRED');
    });

    it('rejects if object was not uploaded to storage', async () => {
      storagePort.objects.delete(stagingKey);

      await expect(
        service.confirmCoverUpload({
          actorContext: ownerActor,
          intentId
        })
      ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    });

    it('rejects if uploaded file is 0 bytes', async () => {
      storagePort.objects.set(stagingKey, {
        sizeBytes: 0n,
        contentType: 'image/jpeg'
      });

      await expect(
        service.confirmCoverUpload({
          actorContext: ownerActor,
          intentId
        })
      ).rejects.toMatchObject({ code: 'INVALID_FILE_SIZE' });
    });

    it('rejects if uploaded file exceeds 25MB limit', async () => {
      storagePort.objects.set(stagingKey, {
        sizeBytes: 25_000_001n,
        contentType: 'image/jpeg'
      });

      await expect(
        service.confirmCoverUpload({
          actorContext: ownerActor,
          intentId
        })
      ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDS_LIMIT' });
    });

    it('confirms successfully: marks intent CONFIRMED and creates asset in RECEIVED status', async () => {
      const res = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId
      });

      expect(res.outcome).toBe('CONFIRMED');
      expect(res.asset.status).toBe('RECEIVED');
      expect(res.asset.actualSize).toBe(4_000_000n);
      expect(res.asset.generation).toBe(1n);

      expect(db.coverIntents.get(intentId).status).toBe('CONFIRMED');
      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_UPLOAD_CONFIRMED',
          result: 'COVER_UPLOAD_CONFIRMED'
        })
      );

      // Replay idempotence
      const replay = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.asset.id).toBe(res.asset.id);
    });
  });

  // =========================================================================
  // EL-TK-050: processCoverAsset
  // =========================================================================
  describe('EL-TK-050: processCoverAsset', () => {
    let assetId: string;

    beforeEach(async () => {
      const uploadRes = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 2_000_000n,
        declaredType: 'image/png'
      });
      storagePort.objects.set(uploadRes.intent.stagingKey, {
        sizeBytes: 2_000_000n,
        contentType: 'image/png'
      });
      const confirmRes = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId: uploadRes.intent.id
      });
      assetId = confirmRes.asset.id;
    });

    it('rejects non-existent assetId', async () => {
      await expect(
        service.processCoverAsset({
          assetId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'COVER_ASSET_NOT_FOUND' });
    });

    it('rejects processing of DELETED asset', async () => {
      db.coverAssets.get(assetId).status = 'DELETED';

      await expect(
        service.processCoverAsset({
          assetId
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('quarantines suspicious malware payload (EICAR_TEST_VIRUS)', async () => {
      const malwareBytes = Buffer.from('EICAR_TEST_VIRUS_SAMPLE_STRING');

      const res = await service.processCoverAsset({
        assetId,
        headerBytes: malwareBytes
      });

      expect(res.status).toBe('QUARANTINED');
      expect(res.asset.status).toBe('QUARANTINED');
      expect(res.asset.failureReason).toBe('SUSPICIOUS_OR_UNSAFE_PAYLOAD');

      // Verified active cover is untouched
      expect(db.events.get(eventId).cover_asset_id).toBeNull();
      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_PROCESSING_FAILED',
          result: 'COVER_PROCESSING_FAILED'
        })
      );
    });

    it('marks asset FAILED when file header is corrupt or truncated', async () => {
      const corruptBytes = Buffer.from('CORRUPTED_PNG_DATA');

      const res = await service.processCoverAsset({
        assetId,
        headerBytes: corruptBytes
      });

      expect(res.status).toBe('FAILED');
      expect(res.asset.status).toBe('FAILED');
      expect(res.asset.failureReason).toBe('CORRUPTED_OR_UNREADABLE_FILE');

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_PROCESSING_FAILED',
          result: 'COVER_PROCESSING_FAILED'
        })
      );
    });

    it('processes successfully to READY: sets derivatives and checksum', async () => {
      const validHeader = Buffer.from('\x89PNG\r\n\x1a\nVALID_PNG_DATA');
      const sha256 = createHash('sha256').update(validHeader).digest('hex');

      const res = await service.processCoverAsset({
        assetId,
        headerBytes: validHeader,
        checksumSha256: sha256
      });

      expect(res.status).toBe('READY');
      expect(res.asset.status).toBe('READY');
      expect(res.asset.thumbnailKey).toBe(`covers/${eventId}/${assetId}_thumb.webp`);
      expect(res.asset.previewKey).toBe(`covers/${eventId}/${assetId}_preview.webp`);
      expect(res.asset.previewUrl).toContain(assetId);
      expect(res.asset.checksumSha256).toBe(sha256);

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_PROCESSED_READY',
          result: 'COVER_PROCESSED_READY'
        })
      );

      // Replay idempotence on READY asset
      const replay = await service.processCoverAsset({
        assetId
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.status).toBe('READY');
    });
  });

  // =========================================================================
  // EL-TK-051: assignCoverAsset
  // =========================================================================
  describe('EL-TK-051: assignCoverAsset', () => {
    let readyAssetId: string;
    let receivedAssetId: string;

    beforeEach(async () => {
      // Create ready asset
      const upload1 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 1_500_000n,
        declaredType: 'image/jpeg'
      });
      storagePort.objects.set(upload1.intent.stagingKey, {
        sizeBytes: 1_500_000n,
        contentType: 'image/jpeg'
      });
      const confirm1 = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId: upload1.intent.id
      });
      const process1 = await service.processCoverAsset({
        assetId: confirm1.asset.id,
        headerBytes: Buffer.from('\xFF\xD8\xFF\xE0\x00\x10JFIF\x00')
      });
      readyAssetId = process1.asset.id;

      // Create received asset (not READY)
      const upload2 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 1_000_000n,
        declaredType: 'image/png'
      });
      storagePort.objects.set(upload2.intent.stagingKey, {
        sizeBytes: 1_000_000n,
        contentType: 'image/png'
      });
      const confirm2 = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId: upload2.intent.id
      });
      receivedAssetId = confirm2.asset.id;
    });

    it('rejects unauthorized actor context or non-owner', async () => {
      await expect(
        service.assignCoverAsset({
          actorContext: otherActor,
          eventId,
          assetId: readyAssetId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects if event is in non-draft/scheduled status (e.g. CLOSED)', async () => {
      db.events.get(eventId).status = 'CLOSED';

      await expect(
        service.assignCoverAsset({
          actorContext: ownerActor,
          eventId,
          assetId: readyAssetId
        })
      ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    });

    it('rejects if candidate asset is not READY (e.g. RECEIVED or FAILED)', async () => {
      await expect(
        service.assignCoverAsset({
          actorContext: ownerActor,
          eventId,
          assetId: receivedAssetId
        })
      ).rejects.toMatchObject({ code: 'COVER_ASSET_NOT_READY' });

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_ASSIGNED',
          result: 'REJECTED_ASSET_NOT_READY'
        })
      );
    });

    it('rejects if candidate asset belongs to another event', async () => {
      db.coverAssets.get(readyAssetId).event_id = randomUUID();

      await expect(
        service.assignCoverAsset({
          actorContext: ownerActor,
          eventId,
          assetId: readyAssetId
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('rejects CAS expectedCoverRevision mismatch', async () => {
      await expect(
        service.assignCoverAsset({
          actorContext: ownerActor,
          eventId,
          assetId: readyAssetId,
          expectedCoverRevision: '1111111111'
        })
      ).rejects.toMatchObject({ code: 'CONCURRENCY_CONFLICT' });

      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_ASSIGNED',
          result: 'REJECTED_REVISION_MISMATCH'
        })
      );
    });

    it('assigns READY asset: updates cover_asset_id and advances config revision', async () => {
      const res = await service.assignCoverAsset({
        actorContext: ownerActor,
        eventId,
        assetId: readyAssetId
      });

      expect(res.outcome).toBe('ASSIGNED');
      expect(res.assignedAssetId).toBe(readyAssetId);
      expect(res.previousCoverAssetId).toBeNull();
      expect(res.event.coverAssetId).toBe(readyAssetId);

      expect(db.events.get(eventId).cover_asset_id).toBe(readyAssetId);
      expect(auditRecords).toContainEqual(
        expect.objectContaining({
          procedure: 'EVENT_COVER_ASSIGNED',
          result: 'COVER_ASSIGNED'
        })
      );
    });

    it('replaces existing cover: correctly tracks previousCoverAssetId for cleanup', async () => {
      // First assign
      await service.assignCoverAsset({
        actorContext: ownerActor,
        eventId,
        assetId: readyAssetId
      });

      // Prepare second READY asset
      const upload3 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 2_500_000n,
        declaredType: 'image/webp'
      });
      storagePort.objects.set(upload3.intent.stagingKey, {
        sizeBytes: 2_500_000n,
        contentType: 'image/webp'
      });
      const confirm3 = await service.confirmCoverUpload({
        actorContext: ownerActor,
        intentId: upload3.intent.id
      });
      const process3 = await service.processCoverAsset({
        assetId: confirm3.asset.id,
        headerBytes: Buffer.from('RIFF....WEBP')
      });
      const secondAssetId = process3.asset.id;

      // Assign second
      const secondAssign = await service.assignCoverAsset({
        actorContext: ownerActor,
        eventId,
        assetId: secondAssetId
      });

      expect(secondAssign.assignedAssetId).toBe(secondAssetId);
      expect(secondAssign.previousCoverAssetId).toBe(readyAssetId);
      expect(db.events.get(eventId).cover_asset_id).toBe(secondAssetId);
    });

    it('supports idempotent replay of cover assignment', async () => {
      const idempotencyKey = randomUUID();

      const first = await service.assignCoverAsset({
        actorContext: ownerActor,
        eventId,
        assetId: readyAssetId,
        idempotencyKey
      });
      expect(first.outcome).toBe('ASSIGNED');

      const replay = await service.assignCoverAsset({
        actorContext: ownerActor,
        eventId,
        assetId: readyAssetId,
        idempotencyKey
      });
      expect(replay.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(replay.assignedAssetId).toBe(readyAssetId);
    });
  });

  // =========================================================================
  // EL-TK-052: cleanupCoverAssets & helpers
  // =========================================================================
  describe('EL-TK-052: cleanupCoverAssets & getters', () => {
    let activeAssetId: string;
    let oldAssetId: string;
    let failedAssetId: string;

    beforeEach(async () => {
      // Active asset
      const u1 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 1_000_000n,
        declaredType: 'image/jpeg'
      });
      storagePort.objects.set(u1.intent.stagingKey, { sizeBytes: 1_000_000n, contentType: 'image/jpeg' });
      const c1 = await service.confirmCoverUpload({ actorContext: ownerActor, intentId: u1.intent.id });
      const p1 = await service.processCoverAsset({ assetId: c1.asset.id, headerBytes: Buffer.from('VALID_HEADER_1234') });
      activeAssetId = p1.asset.id;
      await service.assignCoverAsset({ actorContext: ownerActor, eventId, assetId: activeAssetId });

      // Old superseded asset
      const u2 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 1_000_000n,
        declaredType: 'image/jpeg'
      });
      storagePort.objects.set(u2.intent.stagingKey, { sizeBytes: 1_000_000n, contentType: 'image/jpeg' });
      const c2 = await service.confirmCoverUpload({ actorContext: ownerActor, intentId: u2.intent.id });
      const p2 = await service.processCoverAsset({ assetId: c2.asset.id, headerBytes: Buffer.from('VALID_HEADER_5678') });
      oldAssetId = p2.asset.id;
      storagePort.objects.set(p2.asset.thumbnailKey!, { sizeBytes: 100n, contentType: 'image/webp' });
      storagePort.objects.set(p2.asset.previewKey!, { sizeBytes: 200n, contentType: 'image/webp' });

      // Failed unassigned asset
      const u3 = await service.createCoverUpload({
        actorContext: ownerActor,
        eventId,
        declaredSize: 500_000n,
        declaredType: 'image/jpeg'
      });
      storagePort.objects.set(u3.intent.stagingKey, { sizeBytes: 500_000n, contentType: 'image/jpeg' });
      const c3 = await service.confirmCoverUpload({ actorContext: ownerActor, intentId: u3.intent.id });
      await service.processCoverAsset({ assetId: c3.asset.id, headerBytes: Buffer.from('CORRUPTED') });
      failedAssetId = c3.asset.id;
    });

    it('STRICT GUARANTEE: Never cleans up or deletes the currently active cover asset', async () => {
      const res = await service.cleanupCoverAssets({
        eventId
      });

      expect(res.outcome).toBe('CLEANED_UP');
      expect(res.preservedActiveAssetId).toBe(activeAssetId);
      expect(res.cleanedAssetIds).not.toContain(activeAssetId);
      expect(res.cleanedAssetIds).toContain(oldAssetId);
      expect(res.cleanedAssetIds).toContain(failedAssetId);

      // Active asset is still READY and not DELETED
      expect(db.coverAssets.get(activeAssetId).status).toBe('READY');
      // Superseded and failed assets are DELETED
      expect(db.coverAssets.get(oldAssetId).status).toBe('DELETED');
      expect(db.coverAssets.get(failedAssetId).status).toBe('DELETED');

      // Storage objects of superseded asset were deleted
      expect(storagePort.deletedKeys).toContain(db.coverAssets.get(oldAssetId).original_key);
      expect(storagePort.deletedKeys).toContain(`covers/${eventId}/${oldAssetId}_thumb.webp`);
      expect(storagePort.deletedKeys).toContain(`covers/${eventId}/${oldAssetId}_preview.webp`);
      // Storage object of active asset was preserved
      expect(storagePort.deletedKeys).not.toContain(db.coverAssets.get(activeAssetId).original_key);
    });

    it('supports targeted cleanup of specific asset IDs while respecting active cover protection', async () => {
      // Attempt to clean activeAssetId and oldAssetId
      const res = await service.cleanupCoverAssets({
        eventId,
        targetAssetIds: [activeAssetId, oldAssetId]
      });

      // activeAssetId was filtered out and protected
      expect(res.cleanedAssetIds).toEqual([oldAssetId]);
      expect(res.preservedActiveAssetId).toBe(activeAssetId);
      expect(db.coverAssets.get(activeAssetId).status).toBe('READY');
      expect(db.coverAssets.get(oldAssetId).status).toBe('DELETED');
      // failedAssetId was not in target list so left untouched
      expect(db.coverAssets.get(failedAssetId).status).toBe('FAILED');
    });

    it('handles storage errors gracefully without crashing DB cleanup', async () => {
      storagePort.abortOrDeleteObject = async () => {
        throw new Error('S3 network timeout');
      };

      const res = await service.cleanupCoverAssets({
        eventId,
        targetAssetIds: [oldAssetId]
      });

      expect(res.cleanedAssetIds).toContain(oldAssetId);
      expect(db.coverAssets.get(oldAssetId).status).toBe('DELETED');
    });

    it('getCoverAssetById returns asset or null', async () => {
      const asset = await service.getCoverAssetById(activeAssetId);
      expect(asset).not.toBeNull();
      expect(asset?.id).toBe(activeAssetId);
      expect(asset?.status).toBe('READY');

      const missing = await service.getCoverAssetById(randomUUID());
      expect(missing).toBeNull();
    });

    it('getActiveCoverForEvent returns assigned asset or null', async () => {
      const active = await service.getActiveCoverForEvent(eventId);
      expect(active).not.toBeNull();
      expect(active?.id).toBe(activeAssetId);

      const otherEventId = randomUUID();
      const none = await service.getActiveCoverForEvent(otherEventId);
      expect(none).toBeNull();
    });

    it('integrates with previewDraftAsGuest: guest preview receives READY cover preview URL', async () => {
      const previewRes = await draftService.previewDraftAsGuest({
        actorContext: ownerActor,
        eventId
      });

      expect(previewRes.snapshot.coverPreviewUrl).toBe(
        `https://assets.eventlens.local/covers/${eventId}/${activeAssetId}_preview.webp`
      );
    });
  });
});
