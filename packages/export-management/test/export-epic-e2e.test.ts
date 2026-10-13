import { describe, it, expect, beforeEach } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '../src/contracts.js';
import {
  EXPORT_AVAILABILITY_HOURS,
  ExportAvailabilityService,
  ExportInvalidationService,
  ExportPartDownloadGrantService,
  ExportRetryService,
  ExportQueryService,
  ExportErrorCode,
  type ExportManifestMediaItem,
  type ExportManifestSnapshot,
  type ExportPartDownloadSigner,
  type ExportAuditEvent,
  type ExportLifecycleNotice,
} from '../src/index.js';

// --- BASE DE DATOS EN MEMORIA PARA VALIDACIÓN E2E DE EL-EP-010 (EL-TK-133) ---

interface InMemoryExportE2eDb {
  events: Map<string, {
    id: string;
    organizer_id: string;
    status: string;
  }>;
  mediaCatalog: Map<string, {
    media_ref: string;
    event_ref: string;
    status: string;
    safety_outcome: 'APPROVED' | 'INCONCLUSIVE' | 'DENIED' | 'PENDING';
    file_name: string;
    size_bytes: bigint;
    storage_key: string;
  }>;
  exportRequests: Map<string, {
    id: string;
    event_id: string;
    organizer_id: string;
    idempotency_key: string;
    status: 'REQUESTED' | 'PREPARING' | 'AVAILABLE' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
    generation: bigint;
    selected_count: number;
    selected_bytes: bigint;
    manifest_key: string | null;
    snapshot_manifest: ExportManifestSnapshot;
    storage_prefix: string;
    failure_code: string | null;
    status_reason: string | null;
    requested_at: Date;
    prepared_at: Date | null;
    available_at: Date | null;
    expires_at: Date | null;
    expired_at: Date | null;
    invalidated_at: Date | null;
  }>;
  exportRequestItems: Array<{
    export_id: string;
    media_ref: string;
    size_bytes: bigint;
    part_number?: number;
  }>;
  exportParts: Map<string, {
    export_id: string;
    generation: bigint;
    part_number: number;
    status: 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
    object_key: string;
    size_bytes: bigint;
    entry_count: number;
    sha256: string | null;
    created_at: Date;
    ready_at: Date | null;
  }>;
  publishedJobs: any[];
}

function createE2eDb(): InMemoryExportE2eDb {
  return {
    events: new Map(),
    mediaCatalog: new Map(),
    exportRequests: new Map(),
    exportRequestItems: [],
    exportParts: new Map(),
    publishedJobs: [],
  };
}

class InMemorySqlTransaction implements SqlTransaction {
  constructor(private readonly db: InMemoryExportE2eDb) {}

  async execute(statement: string, ...args: unknown[]): Promise<number> {
    // 1. UPDATE export_request status = 'INVALIDATED'
    if (statement.includes('UPDATE export_request') && statement.includes("status = 'INVALIDATED'")) {
      const exportId = args[0] as string;
      const code = args[1] as string;
      const reason = args[2] as string;
      const invalidatedAt = args[3] as Date;
      const exp = this.db.exportRequests.get(exportId);
      if (exp) {
        exp.status = 'INVALIDATED';
        exp.failure_code = code;
        exp.status_reason = reason;
        exp.invalidated_at = invalidatedAt;
        return 1;
      }
      return 0;
    }

    // 2. UPDATE export_part status = 'INVALIDATED'
    if (statement.includes('UPDATE export_part') && statement.includes("status = 'INVALIDATED'")) {
      const exportId = args[0] as string;
      let count = 0;
      for (const part of this.db.exportParts.values()) {
        if (part.export_id === exportId && (part.status === 'PENDING' || part.status === 'READY')) {
          part.status = 'INVALIDATED';
          count++;
        }
      }
      return count;
    }

    // 3. UPDATE export_request status = 'AVAILABLE'
    if (statement.includes('UPDATE export_request') && statement.includes("status = 'AVAILABLE'") && !statement.includes('RETURNING')) {
      const availableAt = args[1] as Date;
      const expiresAt = args[2] as Date;
      const exportId = args[0] as string;
      const exp = this.db.exportRequests.get(exportId);
      if (exp) {
        exp.status = 'AVAILABLE';
        exp.available_at = availableAt;
        exp.expires_at = expiresAt;
        return 1;
      }
      return 0;
    }

    // 4. UPDATE export_request retry bump
    if (statement.includes('UPDATE export_request') && statement.includes("status = 'REQUESTED'")) {
      const exportId = args[0] as string;
      const newGen = BigInt(args[1] as any);
      const requestedAt = args[2] as Date;
      const exp = this.db.exportRequests.get(exportId);
      if (exp) {
        exp.generation = newGen;
        exp.status = 'REQUESTED';
        exp.failure_code = null;
        exp.status_reason = null;
        exp.prepared_at = null;
        exp.available_at = null;
        exp.expires_at = null;
        exp.expired_at = null;
        exp.requested_at = requestedAt;
        return 1;
      }
      return 0;
    }

    // 5. UPDATE export_part status = 'EXPIRED' for retry
    if (statement.includes('UPDATE export_part') && statement.includes("status = 'EXPIRED'")) {
      const exportId = args[0] as string;
      for (const part of this.db.exportParts.values()) {
        if (part.export_id === exportId) {
          part.status = 'EXPIRED';
        }
      }
      return 1;
    }

    return 1;
  }

  async query<T extends object>(statement: string, ...args: unknown[]): Promise<T[]> {
    // A0. Availability UPDATE RETURNING
    if (statement.includes('UPDATE export_request') && statement.includes("SET status = 'AVAILABLE'") && statement.includes('RETURNING')) {
      const exportId = args[0] as string;
      const hours = Number(args[1] ?? EXPORT_AVAILABILITY_HOURS);
      const exp = this.db.exportRequests.get(exportId);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);
      if (exp) {
        exp.status = 'AVAILABLE';
        exp.available_at = now;
        exp.expires_at = expiresAt;
        return [{ available_at: now, expires_at: expiresAt }] as unknown as T[];
      }
      return [];
    }

    // A. Event ownership check
    if (statement.includes('SELECT status, organizer_id FROM event WHERE id = $1::uuid')) {
      const eventId = args[0] as string;
      const event = this.db.events.get(eventId);
      if (!event) return [];
      return [{ status: event.status, organizer_id: event.organizer_id }] as unknown as T[];
    }

    // B. Query export_request for retry & availability
    if (statement.includes('FROM export_request WHERE id = $1::uuid FOR UPDATE')) {
      const exportId = args[0] as string;
      const exp = this.db.exportRequests.get(exportId);
      if (!exp) return [];
      return [
        {
          id: exp.id,
          event_id: exp.event_id,
          organizer_id: exp.organizer_id,
          status: exp.status,
          generation: exp.generation,
          selected_count: exp.selected_count,
          selected_bytes: exp.selected_bytes,
          manifest_key: exp.manifest_key,
          storage_prefix: exp.storage_prefix,
          requested_at: exp.requested_at,
          prepared_at: exp.prepared_at,
          available_at: exp.available_at,
          expires_at: exp.expires_at,
          failure_code: exp.failure_code,
          status_reason: exp.status_reason,
        } as unknown as T,
      ];
    }

    // C. Query export_request by id (Availability / Query / Grants)
    if (statement.includes('FROM export_request WHERE id = $1::uuid')) {
      const exportId = args[0] as string;
      const exp = this.db.exportRequests.get(exportId);
      if (!exp) return [];
      return [
        {
          id: exp.id,
          event_id: exp.event_id,
          organizer_id: exp.organizer_id,
          status: exp.status,
          generation: exp.generation,
          selected_count: exp.selected_count,
          selected_bytes: exp.selected_bytes,
          manifest_key: exp.manifest_key,
          storage_prefix: exp.storage_prefix,
          failure_code: exp.failure_code,
          status_reason: exp.status_reason,
          created_at: exp.requested_at,
          requested_at: exp.requested_at,
          prepared_at: exp.prepared_at,
          available_at: exp.available_at,
          expires_at: exp.expires_at,
          expired_at: exp.expired_at,
          invalidated_at: exp.invalidated_at,
        } as unknown as T,
      ];
    }

    // D. Query latest export for event
    if (statement.includes('FROM export_request') && statement.includes('WHERE event_id = $1') && statement.includes('ORDER BY')) {
      const eventId = args[0] as string;
      const matches = Array.from(this.db.exportRequests.values())
        .filter((e) => e.event_id === eventId)
        .sort((a, b) => b.requested_at.getTime() - a.requested_at.getTime());
      if (matches.length === 0) return [];
      const exp = matches[0];
      return [
        {
          id: exp.id,
          event_id: exp.event_id,
          organizer_id: exp.organizer_id,
          status: exp.status,
          generation: exp.generation,
          selected_count: exp.selected_count,
          selected_bytes: exp.selected_bytes,
          manifest_key: exp.manifest_key,
          storage_prefix: exp.storage_prefix,
          failure_code: exp.failure_code,
          status_reason: exp.status_reason,
          created_at: exp.requested_at,
          requested_at: exp.requested_at,
          prepared_at: exp.prepared_at,
          available_at: exp.available_at,
          expires_at: exp.expires_at,
          expired_at: exp.expired_at,
          invalidated_at: exp.invalidated_at,
        } as unknown as T,
      ];
    }

    // D2. Query items grouped by part_number for Availability manifest check
    if (statement.includes('FROM export_request_item WHERE export_id = $1::uuid GROUP BY part_number')) {
      const exportId = args[0] as string;
      const counts = new Map<number, number>();
      for (const item of this.db.exportRequestItems) {
        if (item.export_id === exportId && item.part_number !== undefined) {
          counts.set(item.part_number, (counts.get(item.part_number) ?? 0) + 1);
        }
      }
      return Array.from(counts.entries()).map(([part_number, cnt]) => ({
        part_number,
        cnt,
      })) as unknown as T[];
    }

    // E. Query active exports containing specific mediaRef
    if (statement.includes('FROM export_request e') && statement.includes('JOIN export_request_item i ON i.export_id = e.id') && statement.includes('WHERE i.media_ref = $1')) {
      const mediaRef = args[0] as string;
      const exportIdsWithMedia = this.db.exportRequestItems
        .filter((item) => item.media_ref === mediaRef)
        .map((item) => item.export_id);

      const rows: any[] = [];
      for (const id of exportIdsWithMedia) {
        const exp = this.db.exportRequests.get(id);
        if (exp && (exp.status === 'REQUESTED' || exp.status === 'PREPARING' || exp.status === 'AVAILABLE')) {
          rows.push({
            id: exp.id,
            event_id: exp.event_id,
            organizer_id: exp.organizer_id,
            status: exp.status,
            generation: exp.generation,
            selected_count: exp.selected_count,
            failure_code: exp.failure_code,
            status_reason: exp.status_reason,
          });
        }
      }
      return rows as T[];
    }

    // F. Query active exports for targetEventIds in Scope Invalidation
    if (statement.includes('FROM export_request') && statement.includes('WHERE event_id = ANY($1::uuid[])')) {
      const eventIds = args[0] as string[];
      const rows = Array.from(this.db.exportRequests.values())
        .filter((e) => eventIds.includes(e.event_id) && (e.status === 'REQUESTED' || e.status === 'PREPARING' || e.status === 'AVAILABLE'))
        .map((e) => ({
          id: e.id,
          event_id: e.event_id,
          organizer_id: e.organizer_id,
          status: e.status,
          generation: e.generation,
          selected_count: e.selected_count,
          failure_code: e.failure_code,
          status_reason: e.status_reason,
        }));
      return rows as T[];
    }

    // G. Query parts inventory for Scope Invalidation
    if (statement.includes('FROM export_part p') && statement.includes('WHERE e.event_id = ANY($1::uuid[])')) {
      const eventIds = args[0] as string[];
      const parts: any[] = [];
      for (const p of this.db.exportParts.values()) {
        const exp = this.db.exportRequests.get(p.export_id);
        if (exp && eventIds.includes(exp.event_id) && p.object_key) {
          parts.push({
            export_id: p.export_id,
            part_number: p.part_number,
            object_key: p.object_key,
          });
        }
      }
      return parts as T[];
    }

    // H. Query export manifest rows for Scope Invalidation
    if (statement.includes('SELECT id, manifest_key FROM export_request WHERE event_id = ANY($1::uuid[])')) {
      const eventIds = args[0] as string[];
      const rows: any[] = [];
      for (const e of this.db.exportRequests.values()) {
        if (eventIds.includes(e.event_id) && e.manifest_key) {
          rows.push({ id: e.id, manifest_key: e.manifest_key });
        }
      }
      return rows as T[];
    }

    // I. Query parts count for applyInvalidation
    if (statement.includes('UPDATE export_part') && statement.includes('count(*)::int AS count')) {
      const exportId = args[0] as string;
      let count = 0;
      for (const p of this.db.exportParts.values()) {
        if (p.export_id === exportId && (p.status === 'PENDING' || p.status === 'READY')) {
          p.status = 'INVALIDATED';
          count++;
        }
      }
      return [{ count }] as unknown as T[];
    }

    // J. Query export part for grant
    if (statement.includes('FROM export_part') && statement.includes('part_number = $2') && statement.includes('generation = $3')) {
      const exportId = args[0] as string;
      const partNumber = Number(args[1]);
      const generation = BigInt(args[2] as any);
      const key = `${exportId}:${generation}:${partNumber}`;
      const part = this.db.exportParts.get(key);
      if (!part) return [];
      return [
        {
          export_id: part.export_id,
          generation: part.generation,
          part_number: part.part_number,
          status: part.status,
          object_key: part.object_key,
          size_bytes: part.size_bytes,
          entry_count: part.entry_count,
          sha256: part.sha256,
          created_at: part.created_at,
          ready_at: part.ready_at,
        } as unknown as T,
      ];
    }

    // K. Query all parts for export (for Availability publication / Query)
    if (statement.includes('FROM export_part') && statement.includes('WHERE export_id = $1::uuid') && statement.includes('ORDER BY part_number')) {
      const exportId = args[0] as string;
      const parts = Array.from(this.db.exportParts.values())
        .filter((p) => p.export_id === exportId)
        .sort((a, b) => a.part_number - b.part_number);
      return parts.map((p) => ({
        export_id: p.export_id,
        generation: p.generation,
        part_number: p.part_number,
        status: p.status,
        object_key: p.object_key,
        size_bytes: p.size_bytes,
        entry_count: p.entry_count,
        sha256: p.sha256,
        created_at: p.created_at,
        ready_at: p.ready_at,
      })) as unknown as T[];
    }

    return [];
  }
}

class InMemoryRunner implements TransactionRunner {
  constructor(private readonly db: InMemoryExportE2eDb) {}

  async run<T>(block: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx = new InMemorySqlTransaction(this.db);
    return block(tx);
  }
}

describe('EL-EP-010: Validación de recuperación individual y exportación E2E (EL-TK-133)', () => {
  let db: InMemoryExportE2eDb;
  let runner: InMemoryRunner;
  let signer: ExportPartDownloadSigner;
  let auditEvents: ExportAuditEvent[];
  let notices: ExportLifecycleNotice[];

  const eventA = '22222222-2222-2222-2222-222222222222';
  const eventB = '33333333-3333-3333-3333-333333333333';
  const organizerA = '11111111-1111-1111-1111-111111111111';
  const organizerB = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    db = createE2eDb();
    runner = new InMemoryRunner(db);
    auditEvents = [];
    notices = [];

    db.events.set(eventA, { id: eventA, organizer_id: organizerA, status: 'PUBLISHED' });
    db.events.set(eventB, { id: eventB, organizer_id: organizerB, status: 'PUBLISHED' });

    signer = {
      createDownloadUrl: async (params: { key: string; ttlSeconds: number }) => {
        return `https://storage.eventlens.internal/signed/${params.key}?ttl=${params.ttlSeconds}`;
      },
    };
  });

  describe('Escenario 1: Descarga individual de original con aislamiento multi-tenant estricto (DEC-075, DEC-090)', () => {
    async function authorizeOriginalDownload(
      requesterOrganizerId: string,
      targetEventRef: string,
      mediaRef: string
    ): Promise<{ downloadUrl: string; expiresAt: Date }> {
      const event = db.events.get(targetEventRef);
      if (!event) throw new Error('EVENT_NOT_FOUND');
      if (event.organizer_id !== requesterOrganizerId) {
        throw new Error('ACCESS_DENIED'); // Aislamiento estricto multi-tenant
      }

      const media = db.mediaCatalog.get(mediaRef);
      if (!media || media.event_ref !== targetEventRef) {
        throw new Error('NOT_FOUND');
      }

      // DEC-075: Requiere APPROVED en inspección de seguridad
      if (media.safety_outcome !== 'APPROVED') {
        throw new Error('SAFETY_BLOCKED');
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const downloadUrl = `https://storage.eventlens.internal/originals/${media.storage_key}?token=sig123`;
      return { downloadUrl, expiresAt };
    }

    it('permite a un organizador descargar el original de su evento cuando la seguridad está APPROVED', async () => {
      db.mediaCatalog.set('media-01', {
        media_ref: 'media-01',
        event_ref: eventA,
        status: 'PUBLISHED',
        safety_outcome: 'APPROVED',
        file_name: 'boda_foto1.jpg',
        size_bytes: 4096000n,
        storage_key: 'events/alpha/orig/boda_foto1.jpg',
      });

      const grant = await authorizeOriginalDownload(organizerA, eventA, 'media-01');
      expect(grant.downloadUrl).toContain('boda_foto1.jpg');
      expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('permite descargar el original si status es PROCESSING_FAILED pero safety_outcome fue APPROVED (DEC-075)', async () => {
      db.mediaCatalog.set('media-failed-opt', {
        media_ref: 'media-failed-opt',
        event_ref: eventA,
        status: 'PROCESSING_FAILED',
        safety_outcome: 'APPROVED',
        file_name: 'video_bruto.mov',
        size_bytes: 85000000n,
        storage_key: 'events/alpha/orig/video_bruto.mov',
      });

      const grant = await authorizeOriginalDownload(organizerA, eventA, 'media-failed-opt');
      expect(grant.downloadUrl).toContain('video_bruto.mov');
    });

    it('bloquea la descarga con aislamiento multi-tenant si un organizador intenta acceder a media de otro evento', async () => {
      db.mediaCatalog.set('media-event-b', {
        media_ref: 'media-event-b',
        event_ref: eventB,
        status: 'PUBLISHED',
        safety_outcome: 'APPROVED',
        file_name: 'evento_ajeno.jpg',
        size_bytes: 3000000n,
        storage_key: 'events/bravo/orig/evento_ajeno.jpg',
      });

      await expect(authorizeOriginalDownload(organizerA, eventB, 'media-event-b')).rejects.toThrow(
        'ACCESS_DENIED'
      );
    });

    it('bloquea la descarga si el archivo tiene resultado de seguridad DENIED o PENDING', async () => {
      db.mediaCatalog.set('media-quarantined', {
        media_ref: 'media-quarantined',
        event_ref: eventA,
        status: 'QUARANTINED',
        safety_outcome: 'DENIED',
        file_name: 'archivo_sospechoso.exe',
        size_bytes: 1024n,
        storage_key: 'events/alpha/orig/archivo_sospechoso.exe',
      });

      await expect(authorizeOriginalDownload(organizerA, eventA, 'media-quarantined')).rejects.toThrow(
        'SAFETY_BLOCKED'
      );
    });
  });

  describe('Escenario 2: Exportación multipart, disponibilidad de 48h y emisión de grants de partes (DEC-046..049)', () => {
    it('crea snapshot fijo, publica disponibilidad 48h y emite grants temporales para cada parte', async () => {
      const exportId = randomUUID();
      const exportPrefix = `exports/${eventA}/${exportId}`;

      const items: ExportManifestMediaItem[] = [
        { mediaRef: 'm-1', storageKey: 'orig/m1.jpg', sizeBytes: 2000000000n, fileName: 'm1.jpg' },
        { mediaRef: 'm-2', storageKey: 'orig/m2.jpg', sizeBytes: 2500000000n, fileName: 'm2.jpg' },
        { mediaRef: 'm-3', storageKey: 'orig/m3.jpg', sizeBytes: 2000000000n, fileName: 'm3.jpg' },
        { mediaRef: 'm-4', storageKey: 'orig/m4.jpg', sizeBytes: 2500000000n, fileName: 'm4.jpg' },
      ];
      const snapshot: ExportManifestSnapshot = {
        eventId: eventA,
        createdAt: new Date().toISOString(),
        items,
        totalBytes: 9000000000n,
      };

      // 1. Guardar export en BD como PREPARING
      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-e2e-01',
        status: 'PREPARING',
        generation: 1n,
        selected_count: 4,
        selected_bytes: 9000000000n,
        manifest_key: `${exportPrefix}/manifest.json`,
        snapshot_manifest: snapshot,
        storage_prefix: exportPrefix,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: new Date(),
        available_at: null,
        expires_at: null,
        expired_at: null,
        invalidated_at: null,
      });

      db.exportRequestItems.push({ export_id: exportId, media_ref: 'm-1', size_bytes: 2000000000n, part_number: 1 });
      db.exportRequestItems.push({ export_id: exportId, media_ref: 'm-2', size_bytes: 2500000000n, part_number: 1 });
      db.exportRequestItems.push({ export_id: exportId, media_ref: 'm-3', size_bytes: 2000000000n, part_number: 2 });
      db.exportRequestItems.push({ export_id: exportId, media_ref: 'm-4', size_bytes: 2500000000n, part_number: 2 });

      // 2. Partes multipart ZIP64
      const part1Key = `${exportPrefix}/gen-1/part-1.zip`;
      const part2Key = `${exportPrefix}/gen-1/part-2.zip`;

      db.exportParts.set(`${exportId}:1:1`, {
        export_id: exportId,
        generation: 1n,
        part_number: 1,
        status: 'READY',
        object_key: part1Key,
        size_bytes: 4500000000n,
        entry_count: 2,
        sha256: createHash('sha256').update('part1-content').digest('hex'),
        created_at: new Date(),
        ready_at: new Date(),
      });

      db.exportParts.set(`${exportId}:1:2`, {
        export_id: exportId,
        generation: 1n,
        part_number: 2,
        status: 'READY',
        object_key: part2Key,
        size_bytes: 4500000000n,
        entry_count: 2,
        sha256: createHash('sha256').update('part2-content').digest('hex'),
        created_at: new Date(),
        ready_at: new Date(),
      });

      // 3. Publicar disponibilidad 48h (EL-TK-127)
      const availabilityService = new ExportAvailabilityService(
        runner,
        { record: async (e) => { auditEvents.push(e); } },
        {
          exportAvailable: async (_tx, notice) => {
            notices.push(notice);
          },
        }
      );

      const availabilityResult = await availabilityService.publish(exportId);
      expect(availabilityResult.publishedNow).toBe(true);

      const updatedExp = db.exportRequests.get(exportId)!;
      expect(updatedExp.status).toBe('AVAILABLE');
      expect(updatedExp.available_at).not.toBeNull();
      expect(updatedExp.expires_at).not.toBeNull();

      // Ventana de 48 horas (DEC-048)
      const diffMs = updatedExp.expires_at!.getTime() - updatedExp.available_at!.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(EXPORT_AVAILABILITY_HOURS, 1);

      // Notificación recibida
      expect(notices).toHaveLength(1);
      expect(notices[0].exportId).toBe(exportId);
      expect(notices[0].partCount).toBe(2);

      // 4. Consultar estado y capacidades (EL-TK-131)
      const queryService = new ExportQueryService(runner);
      const querySnapshot = await queryService.queryExportStatus({
        eventId: eventA,
        organizerAccountId: organizerA,
      });
      expect(querySnapshot).not.toBeNull();
      expect(querySnapshot?.status).toBe('AVAILABLE');
      expect(querySnapshot?.parts).toHaveLength(2);
      expect(querySnapshot?.parts[0].status).toBe('READY');
      expect(querySnapshot?.capabilities.canDownload).toBe(true);

      // 5. Emitir grants por parte (EL-TK-129)
      const grantService = new ExportPartDownloadGrantService(runner, signer);

      const grantPart1 = await grantService.requestPartDownloadGrant({
        exportId,
        partNumber: 1,
        organizerAccountId: organizerA,
      });
      expect(grantPart1.partNumber).toBe(1);
      expect(grantPart1.downloadUrl).toContain('part-1.zip');
      expect(new Date(grantPart1.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const grantPart2 = await grantService.requestPartDownloadGrant({
        exportId,
        partNumber: 2,
        organizerAccountId: organizerA,
      });
      expect(grantPart2.partNumber).toBe(2);
      expect(grantPart2.downloadUrl).toContain('part-2.zip');
    });
  });

  describe('Escenario 3: Retiro de medio invalida activamente y bloquea nuevos grants (DEC-090)', () => {
    it('cuando un medio incluido es retirado, invalida la exportación, bloquea nuevos grants y programa limpieza', async () => {
      const exportId = randomUUID();
      const exportPrefix = `exports/${eventA}/${exportId}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 48 * 3600 * 1000);

      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-inv-01',
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 2,
        selected_bytes: 4000000n,
        manifest_key: `${exportPrefix}/manifest.json`,
        snapshot_manifest: {
          eventId: eventA,
          createdAt: now.toISOString(),
          items: [
            { mediaRef: 'm-target', storageKey: 'orig/m-target.jpg', sizeBytes: 2000000n, fileName: 'target.jpg' },
            { mediaRef: 'm-safe', storageKey: 'orig/m-safe.jpg', sizeBytes: 2000000n, fileName: 'safe.jpg' },
          ],
          totalBytes: 4000000n,
        },
        storage_prefix: exportPrefix,
        failure_code: null,
        status_reason: null,
        requested_at: now,
        prepared_at: now,
        available_at: now,
        expires_at: expiresAt,
        expired_at: null,
        invalidated_at: null,
      });

      db.exportRequestItems.push({
        export_id: exportId,
        media_ref: 'm-target',
        size_bytes: 2000000n,
      });
      db.exportRequestItems.push({
        export_id: exportId,
        media_ref: 'm-safe',
        size_bytes: 2000000n,
      });

      db.exportParts.set(`${exportId}:1:1`, {
        export_id: exportId,
        generation: 1n,
        part_number: 1,
        status: 'READY',
        object_key: `${exportPrefix}/gen-1/part-1.zip`,
        size_bytes: 4000000n,
        entry_count: 2,
        sha256: 'dummy-sha',
        created_at: now,
        ready_at: now,
      });

      const invalidationService = new ExportInvalidationService(runner, {
        jobPublisher: {
          publish: async (_tx, spec) => {
            db.publishedJobs.push(spec);
          },
        },
      });

      // Retiro de media: se invoca invalidateExportsForMedia
      const invResult = await invalidationService.invalidateExportsForMedia('m-target', {
        code: 'MEDIA_WITHDRAWN',
        reason: 'User requested withdrawal',
      });
      expect(invResult.invalidatedCount).toBe(1);
      expect(invResult.exportIds).toContain(exportId);

      // Export y partes en INVALIDATED
      const exp = db.exportRequests.get(exportId)!;
      expect(exp.status).toBe('INVALIDATED');
      expect(exp.invalidated_at).not.toBeNull();

      const part = db.exportParts.get(`${exportId}:1:1`)!;
      expect(part.status).toBe('INVALIDATED');

      // Limpieza operacional encolada
      expect(db.publishedJobs).toHaveLength(1);
      expect(db.publishedJobs[0].type).toBe('EXPORT_CLEANUP');

      // Intento de emitir grant de descarga para la parte falla con EXPORT_INVALIDATED (DEC-090)
      const grantService = new ExportPartDownloadGrantService(runner, signer);
      await expect(
        grantService.requestPartDownloadGrant({ exportId, partNumber: 1, organizerAccountId: organizerA })
      ).rejects.toMatchObject({
        code: 'EXPORT_INVALIDATED',
      });
    });

    it('la barrera de eliminación de evento invalida todas las exportaciones activas del scope', async () => {
      const export1 = randomUUID();
      const export2 = randomUUID();

      db.exportRequests.set(export1, {
        id: export1,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-ev-1',
        status: 'PREPARING',
        generation: 1n,
        selected_count: 1,
        selected_bytes: 1000n,
        manifest_key: null,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 1000n },
        storage_prefix: `exports/${eventA}/${export1}`,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: null,
        available_at: null,
        expires_at: null,
        expired_at: null,
        invalidated_at: null,
      });

      db.exportRequests.set(export2, {
        id: export2,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-ev-2',
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 1,
        selected_bytes: 1000n,
        manifest_key: `exports/${eventA}/${export2}/manifest.json`,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 1000n },
        storage_prefix: `exports/${eventA}/${export2}`,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: null,
        available_at: null,
        expires_at: new Date(Date.now() + 100000),
        expired_at: null,
        invalidated_at: null,
      });

      const invalidationService = new ExportInvalidationService(runner, {
        jobPublisher: {
          publish: async (_tx, spec) => {
            db.publishedJobs.push(spec);
          },
        },
      });

      const barrierResult = await invalidationService.invalidateExportsForScope({
        scopeType: 'EVENT',
        scopeRef: eventA,
        targetEventIds: [eventA],
        requestId: 'req-del-01',
        reason: 'Event deleted',
      });

      expect(barrierResult.invalidatedExportsCount).toBe(2);
      expect(db.exportRequests.get(export1)!.status).toBe('INVALIDATED');
      expect(db.exportRequests.get(export2)!.status).toBe('INVALIDATED');
    });
  });

  describe('Escenario 4: Reintento y regeneración de exportaciones fallidas o expiradas (EL-TK-130)', () => {
    it('permite reintentar una exportación FAILED incrementando la generación atómicamente', async () => {
      const exportId = randomUUID();
      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-fail-01',
        status: 'FAILED',
        generation: 1n,
        selected_count: 5,
        selected_bytes: 5000000n,
        manifest_key: null,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 5000000n },
        storage_prefix: `exports/${eventA}/${exportId}`,
        failure_code: 'STORAGE_UNAVAILABLE',
        status_reason: 'Fallo transitorio',
        requested_at: new Date(),
        prepared_at: null,
        available_at: null,
        expires_at: null,
        expired_at: null,
        invalidated_at: null,
      });

      let enqueuedJob: any = null;
      const retryService = new ExportRetryService(runner, {
        jobPublisher: {
          publish: async (_tx, spec) => {
            enqueuedJob = spec;
          },
        },
      });

      const retryRes = await retryService.retryExport({
        exportId,
        organizerAccountId: organizerA,
      });
      expect(retryRes.status).toBe('REQUESTED');
      expect(retryRes.generation).toBe(2n);

      const updated = db.exportRequests.get(exportId)!;
      expect(updated.status).toBe('REQUESTED');
      expect(updated.generation).toBe(2n);
      expect(updated.failure_code).toBeNull();
      expect(updated.status_reason).toBeNull();

      expect(enqueuedJob).not.toBeNull();
      expect(enqueuedJob.generation).toBe(2n);
    });

    it('permite regenerar una exportación EXPIRED', async () => {
      const exportId = randomUUID();
      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-exp-01',
        status: 'EXPIRED',
        generation: 1n,
        selected_count: 5,
        selected_bytes: 5000000n,
        manifest_key: null,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 5000000n },
        storage_prefix: `exports/${eventA}/${exportId}`,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: null,
        available_at: null,
        expires_at: new Date(Date.now() - 10000),
        expired_at: new Date(),
        invalidated_at: null,
      });

      const retryService = new ExportRetryService(runner, {
        jobPublisher: {
          publish: async (_tx, _spec) => {},
        },
      });

      const retryRes = await retryService.retryExport({
        exportId,
        organizerAccountId: organizerA,
      });
      expect(retryRes.status).toBe('REQUESTED');
      expect(retryRes.generation).toBe(2n);
    });

    it('rechaza reintentar una exportación que aún se encuentra AVAILABLE', async () => {
      const exportId = randomUUID();
      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-avail-01',
        status: 'AVAILABLE',
        generation: 1n,
        selected_count: 5,
        selected_bytes: 5000000n,
        manifest_key: null,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 5000000n },
        storage_prefix: `exports/${eventA}/${exportId}`,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: new Date(),
        available_at: new Date(),
        expires_at: new Date(Date.now() + 100000),
        expired_at: null,
        invalidated_at: null,
      });

      const retryService = new ExportRetryService(runner);

      await expect(
        retryService.retryExport({ exportId, organizerAccountId: organizerA })
      ).rejects.toMatchObject({
        code: 'EXPORT_IN_PROGRESS',
      });
    });

    it('rechaza reintentar una exportación que fue INVALIDATED por retiro de contenido', async () => {
      const exportId = randomUUID();
      db.exportRequests.set(exportId, {
        id: exportId,
        event_id: eventA,
        organizer_id: organizerA,
        idempotency_key: 'idem-inv-02',
        status: 'INVALIDATED',
        generation: 1n,
        selected_count: 5,
        selected_bytes: 5000000n,
        manifest_key: null,
        snapshot_manifest: { eventId: eventA, createdAt: '', items: [], totalBytes: 5000000n },
        storage_prefix: `exports/${eventA}/${exportId}`,
        failure_code: null,
        status_reason: null,
        requested_at: new Date(),
        prepared_at: null,
        available_at: null,
        expires_at: null,
        expired_at: null,
        invalidated_at: new Date(),
      });

      const retryService = new ExportRetryService(runner);

      await expect(
        retryService.retryExport({ exportId, organizerAccountId: organizerA })
      ).rejects.toMatchObject({
        code: 'EXPORT_INVALIDATED',
      });
    });
  });
});
