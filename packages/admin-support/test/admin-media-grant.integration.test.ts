import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminMediaGrantService,
  AdminSupportError,
  type AdminSupportAuditSink,
  type MediaGrantSigner
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('AdminMediaGrantService (PostgreSQL 16 Integration Tests — EL-TK-150)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function querySql<T extends object = Record<string, unknown>>(statement: string, ...args: unknown[]): Promise<T[]> {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let signer: MediaGrantSigner;
  let auditSink: AdminSupportAuditSink;
  let service: AdminMediaGrantService;
  let adminContext: AdminActorContext;

  beforeAll(async () => {
    await sql(`
      CREATE TABLE IF NOT EXISTS media_catalog (
        media_ref TEXT PRIMARY KEY,
        intent_ref TEXT,
        event_ref TEXT NOT NULL,
        actor_ref TEXT NOT NULL DEFAULT 'guest',
        generation BIGINT NOT NULL DEFAULT 1,
        revision BIGINT NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'UPLOADED',
        original JSONB NOT NULL DEFAULT '{}'::jsonb,
        job_id UUID
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS media_active_derivative (
        media_ref TEXT NOT NULL,
        role TEXT NOT NULL,
        reference JSONB NOT NULL,
        PRIMARY KEY (media_ref, role)
      );
    `);

    await sql(`
      CREATE TABLE IF NOT EXISTS admin_media_grant (
        id UUID PRIMARY KEY,
        event_id TEXT NOT NULL,
        media_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        reason TEXT NOT NULL,
        target_kind TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
  });

  beforeEach(() => {
    signer = {
      signDownloadUrl: vi.fn(async (key: string, ttl: number) => {
        return `https://s3.eventlens.test/signed/${key}?ttl=${ttl}&token=${randomUUID()}`;
      })
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminMediaGrantService(txs, signer, auditSink);

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: randomUUID(),
      identifier: 'media-support@eventlens.test',
      sessionId: randomUUID(),
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('emite grant temporal administrativo en PostgreSQL 16 registrando recibo y auditoria sanitizada', async () => {
    const eventId = 'event:' + randomUUID();
    const mediaId = 'media:' + randomUUID();
    const previewKey = 'previews/' + randomUUID() + '.jpg';

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status) VALUES ($1, $2, 'PUBLISHED')`,
      mediaId,
      eventId
    );

    await sql(
      `INSERT INTO media_active_derivative (media_ref, role, reference) VALUES ($1, 'PREVIEW', $2::jsonb)`,
      mediaId,
      JSON.stringify({ key: previewKey, namespace: 'private-bucket' })
    );

    const grant = await service.requestGrant({
      actorContext: adminContext,
      eventId,
      mediaId,
      purpose: 'SUPPORT_REQUEST',
      reason: 'Diagnostico de problema de renderizado reportado por anfitrion',
      preferredTarget: 'PREVIEW',
      ttlSeconds: 600
    });

    expect(grant.grantId).toBeDefined();
    expect(grant.eventId).toBe(eventId);
    expect(grant.mediaId).toBe(mediaId);
    expect(grant.storageKey).toBe(previewKey);
    expect(grant.downloadUrl).toContain(previewKey);
    expect(grant.grantedTo).toBe(adminContext.principalId);

    // Verificar en tabla admin_media_grant en PostgreSQL
    const rows = await querySql<{ id: string; purpose: string; storage_key: string }>(
      `SELECT id, purpose, storage_key FROM admin_media_grant WHERE id = $1`,
      grant.grantId
    );
    expect(rows.length).toBe(1);
    expect(rows[0]?.purpose).toBe('SUPPORT_REQUEST');
    expect(rows[0]?.storage_key).toBe(previewKey);

    // Verificar auditoria
    expect(auditSink.record).toHaveBeenCalledTimes(1);
  });

  it('deniega y no registra grant ante cross-event mismatch', async () => {
    const realEventId = 'event:' + randomUUID();
    const targetMediaId = 'media:' + randomUUID();
    const wrongEventId = 'event:' + randomUUID();

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status) VALUES ($1, $2, 'PUBLISHED')`,
      targetMediaId,
      realEventId
    );

    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId: wrongEventId,
        mediaId: targetMediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Intento de acceso con ID de evento disidente'
      })
    ).rejects.toThrowError(AdminSupportError);

    // Verificar que no se creo ningun grant
    const check = await querySql(
      `SELECT * FROM admin_media_grant WHERE media_id = $1`,
      targetMediaId
    );
    expect(check.length).toBe(0);
  });

  it('deniega emision de grant si la media fue eliminada (DELETED)', async () => {
    const eventId = 'event:' + randomUUID();
    const mediaId = 'media:' + randomUUID();

    await sql(
      `INSERT INTO media_catalog (media_ref, event_ref, status) VALUES ($1, $2, 'DELETED')`,
      mediaId,
      eventId
    );

    await expect(
      service.requestGrant({
        actorContext: adminContext,
        eventId,
        mediaId,
        purpose: 'SUPPORT_REQUEST',
        reason: 'Intento de consulta sobre elemento purgado'
      })
    ).rejects.toThrowError(AdminSupportError);
  });
});
