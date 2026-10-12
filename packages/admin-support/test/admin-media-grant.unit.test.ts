import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminMediaGrantService,
  AdminSupportError,
  type AdminSupportAuditSink,
  type MediaGrantSigner,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

interface MockMediaDb {
  mediaCatalog: Map<string, {
    media_ref: string;
    event_ref: string;
    status: string;
    original: unknown;
  }>;
  derivatives: Map<string, Array<{
    role: string;
    reference: unknown;
  }>>;
  grants: Map<string, unknown>;
}

function createMockRunner(db: MockMediaDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // Consulta media_catalog
          if (normalized.includes('FROM media_catalog WHERE media_ref = $1 OR media_ref = $2')) {
            const ref1 = params[0] as string;
            const ref2 = params[1] as string;
            const found = db.mediaCatalog.get(ref1) || db.mediaCatalog.get(ref2);
            if (!found) return [] as R[];
            return [found] as unknown as R[];
          }

          // Consulta media_active_derivative
          if (normalized.includes('FROM media_active_derivative WHERE media_ref = $1')) {
            const ref = params[0] as string;
            const items = db.derivatives.get(ref) || [];
            return items as unknown as R[];
          }

          return [] as R[];
        },

        async execute(sql: string, ...params: unknown[]): Promise<number> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          if (normalized.includes('INSERT INTO admin_media_grant')) {
            const id = params[0] as string;
            db.grants.set(id, params);
            return 1;
          }

          return 1;
        }
      };

      return callback(tx);
    }
  };
}

describe('AdminMediaGrantService (Unit Tests — EL-TK-150)', () => {
  let db: MockMediaDb;
  let runner: TransactionRunner;
  let signer: MediaGrantSigner;
  let auditSink: AdminSupportAuditSink;
  let service: AdminMediaGrantService;
  let adminContext: AdminActorContext;

  const eventId = '11111111-1111-1111-1111-111111111111';
  const mediaId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    db = {
      mediaCatalog: new Map(),
      derivatives: new Map(),
      grants: new Map()
    };

    // Fixture de media normal
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'PUBLISHED',
      original: { namespace: 'bucket-orig', key: 'orig/photo1.jpg' }
    });

    db.derivatives.set(mediaId, [
      { role: 'THUMBNAIL', reference: { key: 'derivatives/thumb.jpg' } },
      { role: 'PREVIEW', reference: { key: 'derivatives/preview.jpg' } }
    ]);

    runner = createMockRunner(db);

    signer = {
      signDownloadUrl: vi.fn(async (key: string, ttl: number) => {
        return `https://storage.eventlens.test/download/${key}?sig=test_signature&expires=${ttl}`;
      })
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminMediaGrantService(runner, signer, auditSink);

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin_usr_44',
      identifier: 'admin@eventlens.test',
      sessionId: 'session_admin_01',
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('emite grant temporal exitosamente para soporte con motivo valido y derivado preview', async () => {
    const grant = await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'SUPPORT_REQUEST',
      reason: 'Organizador reporta falla de visualizacion en dispositivo iOS'
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.eventId).toBe(eventId);
    expect(grant.mediaId).toBe(mediaId);
    expect(grant.purpose).toBe('SUPPORT_REQUEST');
    expect(grant.targetKind).toBe('PREVIEW');
    expect(grant.storageKey).toBe('derivatives/preview.jpg');
    expect(grant.downloadUrl).toContain('derivatives/preview.jpg');
    expect(grant.grantedTo).toBe('admin_usr_44');

    expect(signer.signDownloadUrl).toHaveBeenCalledWith('derivatives/preview.jpg', 900);
    expect(db.grants.size).toBe(1);

    // Auditoria sanitizada sin URL completa
    expect(auditSink.record).toHaveBeenCalledTimes(1);
    const auditCall = vi.mocked(auditSink.record).mock.calls[0]![0];
    expect(auditCall.procedure).toBe('ADMIN_MEDIA_ACCESS_GRANTED');
    expect(auditCall.principalId).toBe('admin_usr_44');
    const parsedDetails = JSON.parse(auditCall.details);
    expect(parsedDetails).toHaveProperty('grantId');
    expect(parsedDetails).toHaveProperty('reason');
    expect(parsedDetails).not.toHaveProperty('downloadUrl');
    expect(auditCall.details).not.toContain('sig=test_signature');
  });

  it('deniega si actorContext no es ADMIN_HUMAN', async () => {
    const invalidActor = { ...adminContext, actorType: 'ORGANIZER' as any };

    await expect(
      service.requestGrant({
        actorContext: invalidActor,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Motivo valido para prueba'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'UNAUTHORIZED'
    });
  });

  it('deniega si el motivo operativo es vacio o menor a 5 caracteres', async () => {
    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'abc'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });
  });

  it('deniega si el motivo operativo excede 500 caracteres', async () => {
    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'x'.repeat(501)
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });
  });

  it('deniega si el proposito es invalido', async () => {
    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'BROWSE_GALLERY_FOR_FUN' as any,
        reason: 'Navegacion no justificada'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });
  });

  it('deniega si el medio no existe en media_catalog', async () => {
    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId: '33333333-3333-3333-3333-333333333333',
        purpose: 'SUPPORT_REQUEST',
        reason: 'Investigacion de medio inexistente'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'MEDIA_NOT_FOUND'
    });
  });

  it('deniega ante cross-event mismatch si el medio pertenece a otro evento', async () => {
    const foreignEventId = '99999999-9999-9999-9999-999999999999';

    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId: foreignEventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Intento de consulta cruzada entre eventos'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'CROSS_EVENT_MISMATCH'
    });
  });

  it('deniega si el medio esta en estado DELETED o PURGED', async () => {
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'DELETED',
      original: null
    });

    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Intento de apertura de medio eliminado'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'MEDIA_UNAVAILABLE'
    });
  });

  it('deniega acceso a medio QUARANTINED si el proposito es ordinario SUPPORT_REQUEST', async () => {
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'QUARANTINED',
      original: { key: 'quarantine/orig.bin' }
    });

    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Soporte ordinario para media en cuarentena'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'MEDIA_UNAVAILABLE'
    });
  });

  it('permite acceso a medio QUARANTINED si el proposito es INCIDENT_INVESTIGATION', async () => {
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'QUARANTINED',
      original: { key: 'quarantine/orig.bin' }
    });

    const grant = await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'INCIDENT_INVESTIGATION',
      reason: 'Investigacion de deteccion de amenaza malware'
    });

    expect(grant.purpose).toBe('INCIDENT_INVESTIGATION');
    expect(grant.storageKey).toBe('derivatives/preview.jpg');
  });

  it('utiliza fallback a original para CORRUPTION_DIAGNOSIS si no existen derivados', async () => {
    db.derivatives.delete(mediaId); // Sin derivados
    db.mediaCatalog.set(mediaId, {
      media_ref: mediaId,
      event_ref: eventId,
      status: 'PROCESSING_FAILED',
      original: { key: 'originals/raw-corrupt.jpg' }
    });

    const grant = await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'CORRUPTION_DIAGNOSIS',
      reason: 'Diagnostico de archivo corrupto que fallo en pipeline'
    });

    expect(grant.storageKey).toBe('originals/raw-corrupt.jpg');
    expect(signer.signDownloadUrl).toHaveBeenCalledWith('originals/raw-corrupt.jpg', 900);
  });

  it('acota el TTL entre [60..3600] segundos', async () => {
    // TTL solicitado menor a 60s
    await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'SUPPORT_REQUEST',
      reason: 'Solicitud con TTL muy bajo',
      ttlSeconds: 10
    });
    expect(signer.signDownloadUrl).toHaveBeenCalledWith('derivatives/preview.jpg', 60);

    // TTL solicitado mayor a 3600s
    await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'SUPPORT_REQUEST',
      reason: 'Solicitud con TTL excesivo',
      ttlSeconds: 999999
    });
    expect(signer.signDownloadUrl).toHaveBeenCalledWith('derivatives/preview.jpg', 3600);
  });
});
