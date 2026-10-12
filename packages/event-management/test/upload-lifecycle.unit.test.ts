import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  UploadLifecycleService,
  EventManagementError,
  type DirectUploadStoragePort,
  type CapacityReservationPort,
  type MediaAcceptancePort,
  type EventAuditSink,
  type EventAuditRecord,
  type UploadAttemptStatus,
  type UploadMediaType
} from '../src/index.js';
import { GuestSessionService } from '../src/guest-session.js';

interface InMemoryEventRow {
  id: string;
  organizer_id: string;
  name: string;
  status: string;
  timezone: string;
  starts_at_local: string | null;
  scheduled_at: Date | string | null;
  utc_offset_minutes: number | null;
  expires_at: Date | string | null;
  grace_ends_at: Date | string | null;
  activated_at: Date | string | null;
  closed_at: Date | string | null;
  purge_started_at: Date | string | null;
  suspended_at: Date | string | null;
  suspension_reason: string | null;
  previous_status: string | null;
  validity_duration_days: number | null;
  grace_days: number | null;
  uploads_enabled: boolean;
  guest_gallery_enabled: boolean;
  moderation_mode: string;
  pin_enabled: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  idempotency_key: string | null;
  idempotency_payload_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

interface InMemoryUploadAttemptRow {
  id: string;
  event_id: string;
  guest_session_id: string;
  reservation_id: string;
  idempotency_key: string;
  declared_size: string | bigint;
  declared_type: string;
  contributor_nickname: string;
  status: string;
  object_key?: string | null;
  actual_size?: string | bigint | null;
  detected_type?: string | null;
  duration_seconds?: string | number | null;
  rejection_reason?: string | null;
  created_at: Date;
  expires_at: Date;
  updated_at: Date;
}

interface InMemoryDb {
  events: Map<string, InMemoryEventRow>;
  attempts: Map<string, InMemoryUploadAttemptRow>;
}

function createInMemoryRunner(db: InMemoryDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT * FROM upload_attempt WHERE id = $1 FOR UPDATE
          if (normalized.includes('FROM upload_attempt WHERE id = $1')) {
            const id = params[0] as string;
            const row = db.attempts.get(id);
            return row ? ([{ ...row }] as unknown as T[]) : [];
          }

          // SELECT * FROM upload_attempt WHERE guest_session_id = $1 AND event_id = $2
          if (normalized.includes('FROM upload_attempt WHERE guest_session_id = $1 AND event_id = $2')) {
            const [guestSessionId, eventId] = params as [string, string];
            const rows = Array.from(db.attempts.values()).filter(
              (a) => a.guest_session_id === guestSessionId && a.event_id === eventId
            );
            return rows as unknown as T[];
          }

          // SELECT id, reservation_id, object_key, status FROM upload_attempt WHERE event_id = $1 AND status IN (...)
          if (normalized.includes('FROM upload_attempt WHERE event_id = $1 AND status IN')) {
            const eventId = params[0] as string;
            const guestSessionId = params[1] as string | undefined;
            const rows = Array.from(db.attempts.values()).filter((a) => {
              const matchesEvent = a.event_id === eventId;
              const matchesSession = guestSessionId ? a.guest_session_id === guestSessionId : true;
              const matchesStatus = ['AUTHORIZED', 'UPLOADING', 'CONFIRMING'].includes(a.status);
              return matchesEvent && matchesSession && matchesStatus;
            });
            return rows as unknown as T[];
          }

          // SELECT count(*)::int as count FROM upload_attempt WHERE event_id = $1 AND status = 'ACCEPTED'
          if (normalized.includes("count FROM upload_attempt WHERE event_id = $1 AND status = 'ACCEPTED'")) {
            const eventId = params[0] as string;
            const count = Array.from(db.attempts.values()).filter(
              (a) => a.event_id === eventId && a.status === 'ACCEPTED'
            ).length;
            return [{ count }] as unknown as T[];
          }

          // SELECT * FROM event WHERE id = $1 [FOR UPDATE]
          if (normalized.includes('FROM event WHERE id = $1')) {
            const id = params[0] as string;
            const row = db.events.get(id);
            return row ? ([{ ...row }] as unknown as T[]) : [];
          }

          // UPDATE upload_attempt SET ... RETURNING *
          if (normalized.includes('UPDATE upload_attempt') && normalized.includes('RETURNING *')) {
            if (normalized.includes("status = 'REJECTED'")) {
              // validate reject
              const [id, detectedType, rejectionReason, now] = params as [string, string, string, Date];
              const current = db.attempts.get(id);
              if (current) {
                current.status = 'REJECTED';
                current.detected_type = detectedType;
                current.rejection_reason = rejectionReason;
                current.updated_at = now;
                return [{ ...current }] as unknown as T[];
              }
            } else if (normalized.includes("status = 'VALIDATED'")) {
              const [id, detectedType, durationSeconds, now] = params as [string, string, number | null, Date];
              const current = db.attempts.get(id);
              if (current) {
                current.status = 'VALIDATED';
                current.detected_type = detectedType;
                current.duration_seconds = durationSeconds;
                current.rejection_reason = null;
                current.updated_at = now;
                return [{ ...current }] as unknown as T[];
              }
            } else if (normalized.includes("status = 'CONFIRMING'")) {
              const [id, actualSize, now] = params as [string, string, Date];
              const current = db.attempts.get(id);
              if (current) {
                current.status = 'CONFIRMING';
                current.actual_size = actualSize;
                current.updated_at = now;
                return [{ ...current }] as unknown as T[];
              }
            } else if (normalized.includes("status = 'ACCEPTED'")) {
              const [id, now] = params as [string, Date];
              const current = db.attempts.get(id);
              if (current) {
                current.status = 'ACCEPTED';
                current.updated_at = now;
                return [{ ...current }] as unknown as T[];
              }
            }
          }

          return [];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // UPDATE upload_attempt SET object_key = $2, status = 'UPLOADING', updated_at = $3 WHERE id = $1
          if (normalized.includes("status = 'UPLOADING'")) {
            const [id, objectKey, now] = params as [string, string, Date];
            const current = db.attempts.get(id);
            if (current) {
              current.object_key = objectKey;
              current.status = 'UPLOADING';
              current.updated_at = now;
              return 1;
            }
          }

          // UPDATE upload_attempt SET status = 'CANCELLED', rejection_reason = $2, updated_at = $3 WHERE id = $1
          if (normalized.includes("status = 'CANCELLED'")) {
            const [id, reason, now] = params as [string, string, Date];
            const current = db.attempts.get(id);
            if (current) {
              current.status = 'CANCELLED';
              current.rejection_reason = reason;
              current.updated_at = now;
              return 1;
            }
          }

          return 0;
        }
      };

      return callback(tx);
    }
  };
}

describe('EL-EP-005 Upload Lifecycle Services (Unit Tests — EL-TK-087..093)', () => {
  let db: InMemoryDb;
  let runner: TransactionRunner;
  let mockGuestService: GuestSessionService;
  let mockStorage: DirectUploadStoragePort;
  let mockCapacity: CapacityReservationPort;
  let mockAcceptance: MediaAcceptancePort;
  let auditSink: EventAuditSink;
  let auditRecords: EventAuditRecord[];
  let service: UploadLifecycleService;

  const eventId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const sessionToken = 'valid-guest-session-token-1234';

  beforeEach(() => {
    db = {
      events: new Map(),
      attempts: new Map()
    };
    runner = createInMemoryRunner(db);
    auditRecords = [];

    auditSink = {
      record: async (event: EventAuditRecord) => {
        auditRecords.push(event);
      }
    };

    mockGuestService = {
      resolveGuestSession: vi.fn(async (token: string) => {
        if (token !== sessionToken) {
          throw new EventManagementError('UNAUTHORIZED', 'Invalid or expired session');
        }
        return {
          id: sessionId,
          eventId,
          tokenHash: 'hash',
          credentialGeneration: 1,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: null,
          consentRecordedAt: new Date(),
          consentVersion: 'v1.0',
          contributorNickname: 'Invitado Test'
        };
      })
    } as unknown as GuestSessionService;

    mockStorage = {
      createUploadUrl: vi.fn(async ({ objectKey }) => ({
        uploadUrl: `https://storage.eventlens.test/${objectKey}?signature=secret123`,
        method: 'PUT' as const,
        headers: { 'Content-Type': 'application/octet-stream' },
        expiresAt: new Date(Date.now() + 900000)
      })),
      getObjectMetadata: vi.fn(async (objectKey: string) => ({
        objectKey,
        sizeBytes: 5_000_000n,
        contentType: 'image/jpeg',
        lastModified: new Date()
      })),
      abortOrDeleteObject: vi.fn(async () => {})
    };

    mockCapacity = {
      reserveCapacity: vi.fn(async () => ({
        reservation: { id: randomUUID(), bytes: 5000000n, fileSlots: 1, status: 'ACTIVE' },
        isExisting: false
      })),
      releaseReservation: vi.fn(async () => {}),
      commitReservation: vi.fn(async () => {})
    };

    mockAcceptance = {
      acceptOriginal: vi.fn(async () => ({
        mediaRef: 'media_test',
        jobId: randomUUID(),
        acceptedAt: new Date()
      }))
    };

    service = new UploadLifecycleService(
      runner,
      mockGuestService,
      mockStorage,
      mockCapacity,
      mockAcceptance,
      auditSink
    );

    // Seed Active Event
    db.events.set(eventId, {
      id: eventId,
      organizer_id: randomUUID(),
      name: 'Boda de Ensueño',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      starts_at_local: '2026-11-01 10:00:00',
      scheduled_at: new Date('2026-11-01T15:00:00.000Z'),
      utc_offset_minutes: -300,
      expires_at: new Date('2026-12-01T15:00:00.000Z'),
      grace_ends_at: new Date('2026-12-08T15:00:00.000Z'),
      activated_at: new Date('2026-11-01T15:00:00.000Z'),
      closed_at: null,
      purge_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      previous_status: null,
      validity_duration_days: 30,
      grace_days: 7,
      uploads_enabled: true,
      guest_gallery_enabled: true,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      pin_hash: null,
      pin_salt: null,
      idempotency_key: null,
      idempotency_payload_hash: null,
      created_at: new Date(),
      updated_at: new Date()
    });
  });

  describe('EL-TK-087: createDirectUploadUrl', () => {
    it('Escenario 1: Emite URL temporal de carga directa ligada al intento y objeto esperado', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-1',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'AUTHORIZED',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const result = await service.createDirectUploadUrl({ sessionToken, attemptId });

      expect(result.outcome).toBe('ISSUED');
      expect(result.grant.attemptId).toBe(attemptId);
      expect(result.grant.objectKey).toBe(`events/${eventId}/originals/${attemptId}`);
      expect(result.grant.uploadUrl).toContain(result.grant.objectKey);
      expect(mockStorage.createUploadUrl).toHaveBeenCalledOnce();

      // Verificar que la auditoría no expone la URL firmada completa con credenciales (DEC-013)
      const audit = auditRecords.find((a) => a.procedure === 'UPLOAD_URL_ISSUED');
      expect(audit).toBeDefined();
      expect(audit?.details).not.toContain('signature=secret123');
      expect(audit?.details).toContain(result.grant.objectKey);
    });

    it('Escenario 2: Rechaza emisión si el intento está cancelado o expirado', async () => {
      const cancelledId = randomUUID();
      db.attempts.set(cancelledId, {
        id: cancelledId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-2',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'CANCELLED',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      await expect(
        service.createDirectUploadUrl({ sessionToken, attemptId: cancelledId })
      ).rejects.toThrowError(EventManagementError);

      const expiredId = randomUUID();
      db.attempts.set(expiredId, {
        id: expiredId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-3',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'AUTHORIZED',
        created_at: new Date(),
        expires_at: new Date(Date.now() - 10000), // Expirado
        updated_at: new Date()
      });

      await expect(
        service.createDirectUploadUrl({ sessionToken, attemptId: expiredId })
      ).rejects.toThrowError(EventManagementError);
    });

    it('Escenario 3: Idempotent replay si el intento ya se encuentra en UPLOADING', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-replay',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'UPLOADING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const result = await service.createDirectUploadUrl({ sessionToken, attemptId });
      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
    });
  });

  describe('EL-TK-088: confirmUpload', () => {
    it('Escenario 1: Confirma objeto existente en storage con tamaño real y avanza a CONFIRMING', async () => {
      const attemptId = randomUUID();
      const objectKey = `events/${eventId}/originals/${attemptId}`;
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-conf',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'UPLOADING',
        object_key: objectKey,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const result = await service.confirmUpload({ sessionToken, attemptId });
      expect(result.outcome).toBe('CONFIRMED');
      expect(result.attempt.status).toBe('CONFIRMING');
      expect(result.attempt.actualSize).toBe(5_000_000n);
      expect(mockStorage.getObjectMetadata).toHaveBeenCalledWith(objectKey);
    });

    it('Escenario 2: Rechaza confirmación si el objeto no existe en storage o tiene 0 bytes', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-missing',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'UPLOADING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      (mockStorage.getObjectMetadata as any).mockResolvedValueOnce(null);

      await expect(
        service.confirmUpload({ sessionToken, attemptId })
      ).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });

      // 0 bytes
      (mockStorage.getObjectMetadata as any).mockResolvedValueOnce({
        objectKey: `events/${eventId}/originals/${attemptId}`,
        sizeBytes: 0n
      });

      await expect(
        service.confirmUpload({ sessionToken, attemptId })
      ).rejects.toMatchObject({ code: 'SIZE_MISMATCH' });
    });
  });

  describe('EL-TK-089: validateUpload', () => {
    it('Escenario 1: Valida foto JPEG dentro de límites y avanza a VALIDATED', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-val-photo',
        declared_size: 3_000_000n,
        actual_size: 3_100_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'CONFIRMING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      // Magic bytes JPEG
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

      const result = await service.validateUpload({
        sessionToken,
        attemptId,
        headerBytes: jpegHeader
      });

      expect(result.valid).toBe(true);
      expect(result.outcome).toBe('VALIDATED');
      expect(result.detectedType).toBe('image/jpeg');
      expect(result.attempt.status).toBe('VALIDATED');
    });

    it('Escenario 2: Valida video MP4 y extrae duración sin desbordar el límite de 5 min', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-val-video',
        declared_size: 50_000_000n,
        actual_size: 48_000_000n,
        declared_type: 'VIDEO',
        contributor_nickname: 'Invitado Test',
        status: 'CONFIRMING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      // Synthetic ftyp MP4 header with mvhd indicating 120 seconds duration
      const ftypMp4 = Buffer.alloc(128);
      ftypMp4.writeUInt32BE(28, 0); // length
      ftypMp4.write('ftyp', 4);
      ftypMp4.write('mp42', 8);

      // mvhd atom at offset 32
      ftypMp4.writeUInt32BE(40, 32); // length
      ftypMp4.write('mvhd', 36);
      ftypMp4.writeUInt8(0, 40); // version 0
      ftypMp4.writeUInt32BE(1000, 52); // timescale = 1000
      ftypMp4.writeUInt32BE(120000, 56); // duration = 120000 -> 120s

      const result = await service.validateUpload({
        sessionToken,
        attemptId,
        headerBytes: ftypMp4
      });

      expect(result.valid).toBe(true);
      expect(result.outcome).toBe('VALIDATED');
      expect(result.detectedType).toBe('video/mp4');
      expect(result.durationSeconds).toBe(120);
    });

    it('Escenario 3: Rechaza archivo si excede tamaño máximo y libera la reserva de capacidad', async () => {
      const attemptId = randomUUID();
      const reservationId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: reservationId,
        idempotency_key: 'idem-val-huge',
        declared_size: 20_000_000n,
        actual_size: 40_000_000n, // Excede 25 MB
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'CONFIRMING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

      const result = await service.validateUpload({
        sessionToken,
        attemptId,
        headerBytes: jpegHeader
      });

      expect(result.valid).toBe(false);
      expect(result.outcome).toBe('REJECTED');
      expect(result.rejectionReason).toBe('FILE_SIZE_EXCEEDS_LIMIT');
      expect(result.attempt.status).toBe('REJECTED');

      // Verifica liberación de la reserva en el puerto de capacidad
      expect(mockCapacity.releaseReservation).toHaveBeenCalledWith({
        eventId,
        reservationId,
        reason: 'FILE_SIZE_EXCEEDS_LIMIT'
      });
    });
  });

  describe('EL-TK-090: acceptUpload', () => {
    it('Escenario 1: Acepta original validado atómicamente, consolida consumo y entrega al pipeline', async () => {
      const attemptId = randomUUID();
      const reservationId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: reservationId,
        idempotency_key: 'idem-accept',
        declared_size: 5_000_000n,
        actual_size: 5_000_000n,
        declared_type: 'PHOTO',
        detected_type: 'image/jpeg',
        contributor_nickname: 'Invitado Test',
        status: 'VALIDATED',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const result = await service.acceptUpload({ sessionToken, attemptId });

      expect(result.outcome).toBe('ACCEPTED');
      expect(result.attempt.status).toBe('ACCEPTED');
      expect(result.mediaRef).toBe(`media_${attemptId}`);

      // Verifica commit de cuota y handoff al pipeline
      expect(mockCapacity.commitReservation).toHaveBeenCalledWith({
        eventId,
        reservationId
      });
      expect(mockAcceptance.acceptOriginal).toHaveBeenCalledWith(
        expect.objectContaining({
          intentId: attemptId,
          mediaRef: `media_${attemptId}`,
          eventRef: eventId,
          guestRef: sessionId
        })
      );
    });

    it('Escenario 2: Replay de aceptación devuelve resultado sin duplicar commits ni jobs', async () => {
      const attemptId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-accept-rep',
        declared_size: 5_000_000n,
        actual_size: 5_000_000n,
        declared_type: 'PHOTO',
        status: 'ACCEPTED',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const result = await service.acceptUpload({ sessionToken, attemptId });
      expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(mockCapacity.commitReservation).not.toHaveBeenCalled();
      expect(mockAcceptance.acceptOriginal).not.toHaveBeenCalled();
    });
  });

  describe('EL-TK-091: renewUploadGrant', () => {
    it('Escenario 1: Renueva autorización temporal de transferencia para fallo de red sin duplicar reserva', async () => {
      const attemptId = randomUUID();
      const reservationId = randomUUID();
      db.attempts.set(attemptId, {
        id: attemptId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: reservationId,
        idempotency_key: 'idem-retry-net',
        declared_size: 4_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'UPLOADING',
        object_key: `events/${eventId}/originals/${attemptId}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        updated_at: new Date()
      });

      const result = await service.renewUploadGrant({
        sessionToken,
        attemptId,
        reason: 'network_interruption'
      });

      expect(result.outcome).toBe('RENEWED');
      expect(result.grant.attemptId).toBe(attemptId);
      expect(result.grant.objectKey).toBe(`events/${eventId}/originals/${attemptId}`);
      // Reserva previa intacta y no se reserva nueva capacidad
      expect(mockCapacity.reserveCapacity).not.toHaveBeenCalled();
    });

    it('Escenario 2: Rechaza reintento si el intento ya está cancelado o aceptado', async () => {
      const acceptedId = randomUUID();
      db.attempts.set(acceptedId, {
        id: acceptedId,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'idem-ret-acc',
        declared_size: 4_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado Test',
        status: 'ACCEPTED',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        updated_at: new Date()
      });

      await expect(
        service.renewUploadGrant({ sessionToken, attemptId: acceptedId })
      ).rejects.toMatchObject({ code: 'UPLOAD_ATTEMPT_ALREADY_ACCEPTED' });
    });
  });

  describe('EL-TK-092: reconcilePolicyCancellations (DEC-085)', () => {
    it('Escenario 1 y 2: Cancela intentos no confirmados y libera sus reservas atómicamente', async () => {
      const attempt1 = randomUUID();
      const res1 = randomUUID();
      db.attempts.set(attempt1, {
        id: attempt1,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: res1,
        idempotency_key: 'canc-1',
        declared_size: 4_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado',
        status: 'UPLOADING',
        object_key: `events/${eventId}/originals/${attempt1}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        updated_at: new Date()
      });

      const attempt2 = randomUUID();
      const res2 = randomUUID();
      db.attempts.set(attempt2, {
        id: attempt2,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: res2,
        idempotency_key: 'canc-2',
        declared_size: 5_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado',
        status: 'CONFIRMING',
        object_key: `events/${eventId}/originals/${attempt2}`,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        updated_at: new Date()
      });

      // Original ya aceptado
      const acceptedAttempt = randomUUID();
      db.attempts.set(acceptedAttempt, {
        id: acceptedAttempt,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'acc-kept',
        declared_size: 6_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Invitado',
        status: 'ACCEPTED',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 300000),
        updated_at: new Date()
      });

      const result = await service.reconcilePolicyCancellations({
        eventId,
        reason: 'EVENT_CLOSED'
      });

      expect(result.cancelledAttemptIds).toContain(attempt1);
      expect(result.cancelledAttemptIds).toContain(attempt2);
      expect(result.cancelledAttemptIds).not.toContain(acceptedAttempt);
      expect(result.releasedReservationIds).toContain(res1);
      expect(result.releasedReservationIds).toContain(res2);
      expect(result.preservedAcceptedCount).toBe(1);

      // Verifica estados actualizados
      expect(db.attempts.get(attempt1)?.status).toBe('CANCELLED');
      expect(db.attempts.get(attempt2)?.status).toBe('CANCELLED');
      expect(db.attempts.get(acceptedAttempt)?.status).toBe('ACCEPTED');

      // Verifica limpieza de provisionales en storage
      expect(mockStorage.abortOrDeleteObject).toHaveBeenCalledWith(`events/${eventId}/originals/${attempt1}`);
      expect(mockStorage.abortOrDeleteObject).toHaveBeenCalledWith(`events/${eventId}/originals/${attempt2}`);
    });
  });

  describe('EL-TK-093: getUploadBatchSnapshot', () => {
    it('Escenario 1: Devuelve snapshot del lote con estados autorizados y diferenciación de progreso', async () => {
      const a1 = randomUUID();
      const a2 = randomUUID();
      const a3 = randomUUID();

      db.attempts.set(a1, {
        id: a1,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'batch-1',
        declared_size: 2_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Ana',
        status: 'ACCEPTED',
        actual_size: 2_000_000n,
        created_at: new Date(Date.now() - 3000),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      db.attempts.set(a2, {
        id: a2,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'batch-2',
        declared_size: 15_000_000n,
        declared_type: 'VIDEO',
        contributor_nickname: 'Ana',
        status: 'UPLOADING',
        created_at: new Date(Date.now() - 2000),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      db.attempts.set(a3, {
        id: a3,
        event_id: eventId,
        guest_session_id: sessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'batch-3',
        declared_size: 80_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Ana',
        status: 'REJECTED',
        rejection_reason: 'FILE_SIZE_EXCEEDS_LIMIT',
        created_at: new Date(Date.now() - 1000),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const snapshot = await service.getUploadBatchSnapshot({ sessionToken });

      expect(snapshot.totalFiles).toBe(3);
      expect(snapshot.receivedCount).toBe(1); // a1
      expect(snapshot.inProgressCount).toBe(1); // a2
      expect(snapshot.actionRequiredCount).toBe(0); // a3 has size error (non retryable)
      expect(snapshot.rejectedCount).toBe(1); // a3

      expect(snapshot.items[0].attemptId).toBe(a1);
      expect(snapshot.items[0].status).toBe('ACCEPTED');
      expect(snapshot.items[1].attemptId).toBe(a2);
      expect(snapshot.items[1].canRetry).toBe(true);
      expect(snapshot.items[2].attemptId).toBe(a3);
      expect(snapshot.items[2].canRetry).toBe(false);
    });

    it('Escenario 2: Aislamiento estricto por sesión (no filtra archivos de otras sesiones)', async () => {
      const otherSessionId = randomUUID();
      const foreignAttempt = randomUUID();
      db.attempts.set(foreignAttempt, {
        id: foreignAttempt,
        event_id: eventId,
        guest_session_id: otherSessionId,
        reservation_id: randomUUID(),
        idempotency_key: 'foreign-1',
        declared_size: 2_000_000n,
        declared_type: 'PHOTO',
        contributor_nickname: 'Carlos Extraño',
        status: 'ACCEPTED',
        created_at: new Date(),
        expires_at: new Date(Date.now() + 600000),
        updated_at: new Date()
      });

      const snapshot = await service.getUploadBatchSnapshot({ sessionToken });
      expect(snapshot.totalFiles).toBe(0);
      expect(snapshot.items).toHaveLength(0);
    });
  });
});
