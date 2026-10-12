import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  UploadAuthorizationService,
  GuestSessionService,
  EventManagementError,
  type CapacityReservationPort,
  type EventAuditSink,
  type EventAuditRecord,
  type GuestSessionRecord
} from '../src/index.js';

interface MockDb {
  events: Map<string, any>;
  credentials: Map<string, any>;
  sessions: Map<string, any>;
  attempts: Map<string, any>;
  uploadAttempts: Map<string, any>;
  auditEvents: EventAuditRecord[];
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<R>(callback: (tx: SqlTransaction) => Promise<R>): Promise<R> {
      const tx: SqlTransaction = {
        async query<T extends object>(sql: string, ...params: unknown[]): Promise<T[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // SELECT ... FROM event WHERE id = $1
          if (normalized.includes('FROM event WHERE id = $1')) {
            const id = params[0] as string;
            const ev = db.events.get(id);
            if (ev) return [{ ...ev }] as unknown as T[];
            return [] as unknown as T[];
          }

          // SELECT ... FROM upload_attempt WHERE event_id = $1 AND idempotency_key = $2
          if (normalized.includes('FROM upload_attempt WHERE event_id = $1 AND idempotency_key = $2')) {
            const [eventId, key] = params as [string, string];
            const found = Array.from(db.uploadAttempts.values()).find(
              (a) => a.event_id === eventId && a.idempotency_key === key
            );
            if (found) return [{ ...found }] as unknown as T[];
            return [] as unknown as T[];
          }

          // SELECT ... FROM public_access_credential c JOIN event e ... WHERE c.lookup_key = $1
          if (normalized.includes('FROM public_access_credential c JOIN event e') && normalized.includes('WHERE c.lookup_key = $1')) {
            const key = params[0] as string;
            const cred = Array.from(db.credentials.values()).find((c) => c.lookup_key === key);
            if (!cred) return [] as unknown as T[];
            const ev = db.events.get(cred.event_id);
            if (!ev) return [] as unknown as T[];

            return [{
              cred_id: cred.id,
              event_id: cred.event_id,
              lookup_key: cred.lookup_key,
              cred_token_hash: cred.token_hash,
              generation: cred.generation,
              pin_required: cred.pin_required,
              cred_revoked_at: cred.revoked_at ?? null,
              name: ev.name ?? 'Mock Event',
              status: ev.status,
              timezone: ev.timezone ?? 'America/Bogota',
              pin_enabled: Boolean(ev.pin_enabled),
              pin_hash: ev.pin_hash ?? null,
              pin_salt: ev.pin_salt ?? null,
              starts_at_local: ev.starts_at_local ?? null,
              scheduled_at: ev.scheduled_at ?? null,
              expires_at: ev.expires_at ?? null,
              grace_ends_at: ev.grace_ends_at ?? null,
              activated_at: ev.activated_at ?? null,
              closed_at: ev.closed_at ?? null,
              purge_started_at: ev.purge_started_at ?? null,
              suspended_at: ev.suspended_at ?? null,
              suspension_reason: ev.suspension_reason ?? null,
              previous_status: ev.previous_status ?? null,
              validity_duration_days: ev.validity_duration_days ?? null,
              grace_days: ev.grace_days ?? null,
              uploads_enabled: Boolean(ev.uploads_enabled),
              guest_gallery_enabled: Boolean(ev.guest_gallery_enabled),
              moderation_mode: ev.moderation_mode ?? 'AUTO_PUBLISH',
              organizer_id: ev.organizer_id ?? '00000000-0000-0000-0000-000000000001',
              created_at: cred.created_at,
              updated_at: cred.created_at
            }] as unknown as T[];
          }

          // SELECT ... FROM guest_session WHERE token_hash = $1
          if (normalized.includes('FROM guest_session WHERE token_hash = $1')) {
            const hash = params[0] as string;
            const sess = Array.from(db.sessions.values()).find((s) => s.token_hash === hash);
            if (sess) return [{ ...sess }] as unknown as T[];
            return [] as unknown as T[];
          }

          // SELECT ... FROM guest_session WHERE id = $1
          if (normalized.includes('FROM guest_session WHERE id = $1')) {
            const id = params[0] as string;
            const sess = db.sessions.get(id);
            if (sess) return [{ ...sess }] as unknown as T[];
            return [] as unknown as T[];
          }

          throw new Error(`Unhandled mock query: ${sql}`);
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // INSERT INTO upload_attempt
          if (normalized.includes('INSERT INTO upload_attempt')) {
            const [
              id,
              event_id,
              guest_session_id,
              reservation_id,
              idempotency_key,
              declared_size,
              declared_type,
              contributor_nickname,
              status,
              created_at,
              expires_at,
              updated_at
            ] = params;
            db.uploadAttempts.set(id as string, {
              id,
              event_id,
              guest_session_id,
              reservation_id,
              idempotency_key,
              declared_size,
              declared_type,
              contributor_nickname,
              status,
              created_at,
              expires_at,
              updated_at
            });
            return 1;
          }

          // INSERT INTO guest_session
          if (normalized.includes('INSERT INTO guest_session')) {
            const [id, event_id, token_hash, credential_generation, created_at, expires_at] = params;
            db.sessions.set(id as string, {
              id,
              event_id,
              token_hash,
              credential_generation,
              created_at,
              expires_at,
              revoked_at: null,
              consent_recorded_at: null,
              consent_version: null,
              contributor_nickname: null
            });
            return 1;
          }

          // UPDATE guest_session SET consent_recorded_at
          if (normalized.includes('UPDATE guest_session') && normalized.includes('consent_recorded_at')) {
            const [id, consent_recorded_at, consent_version] = params;
            const sess = db.sessions.get(id as string);
            if (sess) {
              sess.consent_recorded_at = consent_recorded_at;
              sess.consent_version = consent_version;
            }
            return 1;
          }

          // INSERT INTO guest_consent_record
          if (normalized.includes('INSERT INTO guest_consent_record')) {
            return 1;
          }

          // UPDATE guest_session SET contributor_nickname
          if (normalized.includes('UPDATE guest_session') && normalized.includes('contributor_nickname')) {
            const [id, contributor_nickname] = params;
            const sess = db.sessions.get(id as string);
            if (sess) {
              sess.contributor_nickname = contributor_nickname;
            }
            return 1;
          }

          // UPDATE guest_session SET revoked_at
          if (normalized.includes('UPDATE guest_session SET revoked_at')) {
            const id = params[0] as string;
            const sess = db.sessions.get(id);
            if (sess) {
              sess.revoked_at = new Date();
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

describe('EL-TK-086: UploadAuthorizationService (Unit Tests)', () => {
  let db: MockDb;
  let auditSink: EventAuditSink;
  let guestSessionService: GuestSessionService;
  let capacityPort: CapacityReservationPort;
  let uploadService: UploadAuthorizationService;

  beforeEach(() => {
    db = {
      events: new Map(),
      credentials: new Map(),
      sessions: new Map(),
      attempts: new Map(),
      uploadAttempts: new Map(),
      auditEvents: []
    };

    auditSink = {
      record: vi.fn(async (event) => {
        db.auditEvents.push(event);
      })
    };

    const runner = createMockRunner(db);
    guestSessionService = new GuestSessionService(runner, auditSink);

    capacityPort = {
      reserveCapacity: vi.fn(async (cmd) => {
        return {
          reservation: {
            id: randomUUID(),
            bytes: BigInt(cmd.bytes),
            fileSlots: cmd.fileSlots ?? 1,
            status: 'ACTIVE'
          },
          isExisting: false
        };
      })
    };

    uploadService = new UploadAuthorizationService(
      runner,
      guestSessionService,
      capacityPort,
      auditSink
    );
  });

  async function setupReadyGuestSession(options?: {
    status?: string;
    uploadsEnabled?: boolean;
    hasConsent?: boolean;
    hasNickname?: boolean;
    nickname?: string;
  }) {
    const eventId = randomUUID();
    const lookupKey = 'lookup_' + randomBytes(8).toString('hex');
    const tokenHash = 'hash_' + randomBytes(8).toString('hex');

    db.events.set(eventId, {
      id: eventId,
      organizer_id: randomUUID(),
      name: 'Boda de Ensueño',
      status: options?.status ?? 'ACTIVE',
      timezone: 'America/Bogota',
      starts_at_local: '2026-10-15 10:00:00',
      scheduled_at: new Date('2026-10-15T15:00:00Z'),
      expires_at: new Date('2026-11-15T15:00:00Z'),
      grace_ends_at: new Date('2026-11-22T15:00:00Z'),
      uploads_enabled: options?.uploadsEnabled ?? true,
      guest_gallery_enabled: true,
      moderation_mode: 'AUTO_PUBLISH',
      pin_enabled: false,
      created_at: new Date(),
      updated_at: new Date()
    });

    db.credentials.set(lookupKey, {
      id: randomUUID(),
      event_id: eventId,
      lookup_key: lookupKey,
      token_hash: tokenHash,
      generation: 1,
      pin_required: false,
      created_at: new Date(),
      revoked_at: null
    });

    const { session } = await guestSessionService.createGuestSession({ lookupKey });

    if (options?.hasConsent !== false) {
      await guestSessionService.recordConsent({
        sessionToken: session.token,
        documentVersion: 'v1.0.0',
        accepted: true
      });
    }

    if (options?.hasNickname !== false) {
      await guestSessionService.setContributorNickname({
        sessionToken: session.token,
        nickname: options?.nickname ?? 'Fotógrafo Invitado'
      });
    }

    return { eventId, session };
  }

  describe('Escenario 1: Autorización válida y reserva atómica de capacidad', () => {
    it('Crea un intento único AUTHORIZED y reserva bytes y 1 slot de archivo en capacityPort (DEC-080)', async () => {
      const { session, eventId } = await setupReadyGuestSession();

      const result = await uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 4500000n, // 4.5 MB
        declaredType: 'PHOTO',
        idempotencyKey: 'idem_upload_001'
      });

      expect(result.outcome).toBe('AUTHORIZED');
      expect(result.attempt.eventId).toBe(eventId);
      expect(result.attempt.guestSessionId).toBe(session.id);
      expect(result.attempt.status).toBe('AUTHORIZED');
      expect(result.attempt.declaredSize).toBe(4500000n);
      expect(result.attempt.declaredType).toBe('PHOTO');
      expect(result.attempt.contributorNickname).toBe('Fotógrafo Invitado');
      expect(result.attempt.reservationId).toBeDefined();

      // Verifica invocación a la reserva atómica
      expect(capacityPort.reserveCapacity).toHaveBeenCalledWith({
        eventId,
        bytes: 4500000n,
        fileSlots: 1,
        mediaType: 'PHOTO',
        idempotencyKey: 'upload_attempt_idem_upload_001'
      });

      // Verifica auditoría sin secretos
      const audit = db.auditEvents.find((e) => e.procedure === 'UPLOAD_ATTEMPT_AUTHORIZED');
      expect(audit).toBeDefined();
      expect(audit?.targetIdentifier).toBe(eventId);
      expect(audit?.details).toContain('PHOTO');
      expect(audit?.details).toContain('4500000 bytes');
    });

    it('Autoriza video con declarado y tipo VIDEO', async () => {
      const { session, eventId } = await setupReadyGuestSession();

      const result = await uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 50000000n, // 50 MB
        declaredType: 'VIDEO',
        idempotencyKey: 'idem_video_001'
      });

      expect(result.outcome).toBe('AUTHORIZED');
      expect(result.attempt.declaredType).toBe('VIDEO');
      expect(result.attempt.declaredSize).toBe(50000000n);
      expect(capacityPort.reserveCapacity).toHaveBeenCalledWith(
        expect.objectContaining({
          bytes: 50000000n,
          mediaType: 'VIDEO'
        })
      );
    });
  });

  describe('Escenario 2: Capacidad insuficiente o límite alcanzado (Rechazo sin intento parcial)', () => {
    it('Rechaza con INSUFFICIENT_STORAGE_CAPACITY sin persistir intento parcial cuando storage se agota', async () => {
      const { session } = await setupReadyGuestSession();

      vi.mocked(capacityPort.reserveCapacity).mockRejectedValueOnce({
        code: 'INSUFFICIENT_STORAGE_CAPACITY',
        message: 'Storage quota exceeded'
      });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 9999999999n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_storage_exceeded'
        })
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STORAGE_CAPACITY' });

      // No se persiste ningún upload_attempt
      expect(db.uploadAttempts.size).toBe(0);
    });

    it('Rechaza con INSUFFICIENT_FILE_CAPACITY sin persistir intento parcial cuando cupo de archivos se agota', async () => {
      const { session } = await setupReadyGuestSession();

      vi.mocked(capacityPort.reserveCapacity).mockRejectedValueOnce({
        code: 'INSUFFICIENT_FILE_CAPACITY',
        message: 'Max file slots exceeded'
      });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 1000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_files_exceeded'
        })
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_FILE_CAPACITY' });

      expect(db.uploadAttempts.size).toBe(0);
    });

    it('Rechaza con FILE_SIZE_EXCEEDS_LIMIT cuando el archivo supera el límite unitario del plan', async () => {
      const { session } = await setupReadyGuestSession();

      vi.mocked(capacityPort.reserveCapacity).mockRejectedValueOnce({
        code: 'FILE_SIZE_EXCEEDS_LIMIT',
        message: 'Photo exceeds 25 MB limit'
      });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 30000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_file_too_large'
        })
      ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDS_LIMIT' });

      expect(db.uploadAttempts.size).toBe(0);
    });
  });

  describe('Escenario 3: Idempotencia y serialización concurrente', () => {
    it('Llamadas repetidas idénticas devuelven IDEMPOTENT_REPLAY con el mismo intento sin duplicar reservas', async () => {
      const { session } = await setupReadyGuestSession();

      const first = await uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 5000000n,
        declaredType: 'PHOTO',
        idempotencyKey: 'idem_replay_test'
      });
      expect(first.outcome).toBe('AUTHORIZED');

      const second = await uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 5000000n,
        declaredType: 'PHOTO',
        idempotencyKey: 'idem_replay_test'
      });
      expect(second.outcome).toBe('IDEMPOTENT_REPLAY');
      expect(second.attempt.id).toBe(first.attempt.id);
      expect(second.attempt.reservationId).toBe(first.attempt.reservationId);

      // Solo una llamada a reserveCapacity
      expect(capacityPort.reserveCapacity).toHaveBeenCalledTimes(1);
    });

    it('Rechaza con IDEMPOTENCY_CONFLICT si se reusa la clave con parámetros diferentes', async () => {
      const { session } = await setupReadyGuestSession();

      await uploadService.authorizeUploadAttempt({
        sessionToken: session.token,
        declaredSize: 5000000n,
        declaredType: 'PHOTO',
        idempotencyKey: 'idem_conflict_test'
      });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 8000000n, // Diferente tamaño
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_conflict_test'
        })
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    });
  });

  describe('Validaciones y Gating (EL-TK-075, 076, 077, 072)', () => {
    it('Rechaza si la sesión no ha aceptado consentimiento versionado (CONSENT_REQUIRED)', async () => {
      const { session } = await setupReadyGuestSession({ hasConsent: false });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_no_consent'
        })
      ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    });

    it('Rechaza si la sesión no tiene apodo/nombre de aportante (INVALID_CONTRIBUTOR_NICKNAME)', async () => {
      const { session } = await setupReadyGuestSession({ hasNickname: false });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_no_nickname'
        })
      ).rejects.toMatchObject({ code: 'INVALID_CONTRIBUTOR_NICKNAME' });
    });

    it('Rechaza si el evento tiene uploads_enabled = false (UPLOADS_DISABLED)', async () => {
      const { session } = await setupReadyGuestSession({ uploadsEnabled: false });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_uploads_disabled'
        })
      ).rejects.toMatchObject({ code: 'UPLOADS_DISABLED' });
    });

    it('Rechaza si el evento está en estado CLOSED (UPLOADS_DISABLED per EventAccessPolicy)', async () => {
      const { session } = await setupReadyGuestSession({ status: 'CLOSED' });

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_closed'
        })
      ).rejects.toMatchObject({ code: 'UPLOADS_DISABLED' });
    });

    it('Rechaza si el evento está en estado SUSPENDED (EVENT_SUSPENDED)', async () => {
      const { session, eventId } = await setupReadyGuestSession();
      const event = db.events.get(eventId)!;
      event.status = 'SUSPENDED';

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_suspended'
        })
      ).rejects.toMatchObject({ code: 'EVENT_SUSPENDED' });
    });

    it('Rechaza tipo de medio no soportado (INVALID_MEDIA_TYPE)', async () => {
      const { session } = await setupReadyGuestSession();

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 5000000n,
          declaredType: 'AUDIO' as any,
          idempotencyKey: 'idem_bad_type'
        })
      ).rejects.toMatchObject({ code: 'INVALID_MEDIA_TYPE' });
    });

    it('Rechaza tamaño menor o igual a cero (INVALID_FILE_SIZE)', async () => {
      const { session } = await setupReadyGuestSession();

      await expect(
        uploadService.authorizeUploadAttempt({
          sessionToken: session.token,
          declaredSize: 0,
          declaredType: 'PHOTO',
          idempotencyKey: 'idem_zero_size'
        })
      ).rejects.toMatchObject({ code: 'INVALID_FILE_SIZE' });
    });
  });
});
