import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminSearchService,
  type AdminSearchQuery,
  type AdminSupportAuditSink,
  type SqlTransaction,
  type TransactionRunner
} from '../src/index.js';

interface MockDb {
  events: Array<{
    id: string;
    name: string;
    status: string;
    organizer_id: string;
    timezone: string;
    scheduled_at: Date | null;
    created_at: Date;
  }>;
  organizers: Array<{
    id: string;
    email: string;
    email_normalized: string;
    status: string;
    declared_adult: boolean;
    created_at: Date;
  }>;
}

function createMockRunner(db: MockDb): TransactionRunner {
  return {
    async run<T>(callback: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object = object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const normalized = sql.replace(/\s+/g, ' ').trim();

          // Conteo total
          if (normalized.includes('SELECT SUM(cnt)::bigint AS total')) {
            let total = 0;
            const hasEvent = normalized.includes('FROM event');
            const hasOrganizer = normalized.includes('FROM organizer_account');

            if (hasEvent) {
              total += filterEvents(db.events, normalized, params).length;
            }
            if (hasOrganizer) {
              total += filterOrganizers(db.organizers, normalized, params).length;
            }

            return [{ total: total.toString() }] as unknown as R[];
          }

          // Consulta de items paginados
          let results: any[] = [];
          const hasEvent = normalized.includes('FROM event');
          const hasOrganizer = normalized.includes('FROM organizer_account');

          if (hasEvent) {
            const evs = filterEvents(db.events, normalized, params).map((e) => ({
              row_type: 'EVENT',
              id: e.id,
              name_or_email: e.name,
              status: e.status,
              organizer_id: e.organizer_id,
              timezone: e.timezone,
              scheduled_at: e.scheduled_at,
              created_at: e.created_at,
              declared_adult: null
            }));
            results.push(...evs);
          }

          if (hasOrganizer) {
            const orgs = filterOrganizers(db.organizers, normalized, params).map((o) => ({
              row_type: 'ORGANIZER',
              id: o.id,
              name_or_email: o.email,
              status: o.status,
              organizer_id: null,
              timezone: null,
              scheduled_at: null,
              created_at: o.created_at,
              declared_adult: o.declared_adult
            }));
            results.push(...orgs);
          }

          // Ordenar por created_at DESC
          results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          // Paginación LIMIT y OFFSET
          const limit = (params[params.length - 2] as number) ?? 20;
          const offset = (params[params.length - 1] as number) ?? 0;
          const paged = results.slice(offset, offset + limit);

          return paged as unknown as R[];
        },
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          return 0;
        }
      };

      return callback(tx);
    }
  };
}

function filterEvents(events: MockDb['events'], sql: string, params: unknown[]) {
  return events.filter((e) => {
    // Si hay condición de status
    for (const p of params) {
      if (typeof p === 'string' && ['DRAFT', 'ACTIVE', 'SCHEDULED', 'CLOSED', 'SUSPENDED'].includes(p)) {
        if (e.status !== p) return false;
      }
    }
    // Si hay término de búsqueda
    for (const p of params) {
      if (typeof p === 'string') {
        if (p.startsWith('%') && p.endsWith('%')) {
          const term = p.slice(1, -1).toLowerCase();
          if (!e.name.toLowerCase().includes(term)) return false;
        } else if (p.length === 36 && p.includes('-')) {
          // UUID match
          if (e.id !== p && e.organizer_id !== p) return false;
        }
      }
    }
    return true;
  });
}

function filterOrganizers(orgs: MockDb['organizers'], sql: string, params: unknown[]) {
  return orgs.filter((o) => {
    for (const p of params) {
      if (typeof p === 'string' && ['ACTIVE', 'PENDING_VERIFICATION'].includes(p)) {
        if (o.status !== p) return false;
      }
    }
    for (const p of params) {
      if (typeof p === 'string') {
        if (p.startsWith('%') && p.endsWith('%')) {
          const term = p.slice(1, -1).toLowerCase();
          if (!o.email.toLowerCase().includes(term) && !o.email_normalized.toLowerCase().includes(term)) {
            return false;
          }
        } else if (p.length === 36 && p.includes('-')) {
          if (o.id !== p) return false;
        }
      }
    }
    return true;
  });
}

function createValidAdminContext(): AdminActorContext {
  return {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.test',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };
}

describe('EL-TK-146: AdminSearchService (Unit Tests)', () => {
  let db: MockDb;
  let auditSink: AdminSupportAuditSink;
  let service: AdminSearchService;
  let validAdminContext: AdminActorContext;

  const org1Id = randomUUID();
  const org2Id = randomUUID();
  const event1Id = randomUUID();
  const event2Id = randomUUID();

  beforeEach(() => {
    validAdminContext = createValidAdminContext();

    db = {
      events: [
        {
          id: event1Id,
          name: 'Festival de Primavera 2026',
          status: 'ACTIVE',
          organizer_id: org1Id,
          timezone: 'America/Bogota',
          scheduled_at: new Date('2026-05-10T15:00:00Z'),
          created_at: new Date('2026-04-01T10:00:00Z')
        },
        {
          id: event2Id,
          name: 'Boda de Andrea & Carlos',
          status: 'DRAFT',
          organizer_id: org2Id,
          timezone: 'America/Bogota',
          scheduled_at: null,
          created_at: new Date('2026-04-05T12:00:00Z')
        }
      ],
      organizers: [
        {
          id: org1Id,
          email: 'andrea.org@eventlens.test',
          email_normalized: 'andrea.org@eventlens.test',
          status: 'ACTIVE',
          declared_adult: true,
          created_at: new Date('2026-03-20T08:00:00Z')
        },
        {
          id: org2Id,
          email: 'carlos.producciones@eventlens.test',
          email_normalized: 'carlos.producciones@eventlens.test',
          status: 'PENDING_VERIFICATION',
          declared_adult: true,
          created_at: new Date('2026-03-25T09:00:00Z')
        }
      ]
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    service = new AdminSearchService(createMockRunner(db), auditSink);
  });

  describe('Criterio 1: Búsqueda con criterio válido por admin autorizado', () => {
    it('Devuelve eventos y organizadores paginados y sanitizados con entityType ALL', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        query: 'Andrea',
        entityType: 'ALL',
        page: 1,
        limit: 10
      });

      expect(result.items).toHaveLength(2); // 1 evento ("Boda de Andrea & Carlos") + 1 organizador ("andrea.org@eventlens.test")
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
      expect(result.pagination.totalPages).toBe(1);

      const eventItem = result.items.find((i) => i.type === 'EVENT');
      expect(eventItem).toBeDefined();
      expect(eventItem?.id).toBe(event2Id);
      expect((eventItem as any).pinHash).toBeUndefined(); // Sin secretos

      const orgItem = result.items.find((i) => i.type === 'ORGANIZER');
      expect(orgItem).toBeDefined();
      expect(orgItem?.id).toBe(org1Id);
      expect((orgItem as any).secretDigest).toBeUndefined();
    });

    it('Filtra únicamente eventos cuando entityType es EVENT', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        entityType: 'EVENT',
        page: 1,
        limit: 10
      });

      expect(result.items.every((i) => i.type === 'EVENT')).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it('Filtra únicamente organizadores cuando entityType es ORGANIZER', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        entityType: 'ORGANIZER',
        page: 1,
        limit: 10
      });

      expect(result.items.every((i) => i.type === 'ORGANIZER')).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it('Permite buscar directamente por UUID exacto de evento', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        query: event1Id,
        entityType: 'EVENT'
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(event1Id);
      expect(result.items[0].type).toBe('EVENT');
    });

    it('Permite buscar directamente por UUID exacto de organizador', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        query: org2Id,
        entityType: 'ORGANIZER'
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(org2Id);
      expect(result.items[0].type).toBe('ORGANIZER');
    });

    it('Aplica paginación correctamente (limit y offset)', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        entityType: 'EVENT',
        page: 1,
        limit: 1
      });

      expect(result.items).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('Criterio 2: Estado vacío sin errores cuando no hay coincidencias', () => {
    it('Devuelve items vacío y total 0 cuando ningún recurso coincide con el criterio', async () => {
      const result = await service.search({
        actorContext: validAdminContext,
        query: 'termino_inexistente_xyz_123',
        entityType: 'ALL'
      });

      expect(result.items).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.page).toBe(1);
    });
  });

  describe('Criterio 3: Denegación de acceso para actores no autorizados', () => {
    it('Rechaza con UNAUTHORIZED si actorContext no es proporcionado', async () => {
      await expect(
        service.search({
          actorContext: null as any,
          query: 'test'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza con UNAUTHORIZED si actorType no es ADMIN_HUMAN', async () => {
      const invalidContext = {
        ...validAdminContext,
        actorType: 'ORGANIZER_HUMAN' as any
      };

      await expect(
        service.search({
          actorContext: invalidContext,
          query: 'test'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Rechaza con UNAUTHORIZED si principalId está vacío', async () => {
      const invalidContext = {
        ...validAdminContext,
        principalId: ''
      };

      await expect(
        service.search({
          actorContext: invalidContext,
          query: 'test'
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('Validación de entradas y sanitización', () => {
    it('Rechaza con INVALID_ARGUMENT si el query supera 100 caracteres', async () => {
      const longQuery = 'a'.repeat(101);

      await expect(
        service.search({
          actorContext: validAdminContext,
          query: longQuery
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza con INVALID_ARGUMENT si page es menor a 1', async () => {
      await expect(
        service.search({
          actorContext: validAdminContext,
          page: 0
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza con INVALID_ARGUMENT si limit supera 100', async () => {
      await expect(
        service.search({
          actorContext: validAdminContext,
          limit: 101
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Rechaza con INVALID_ARGUMENT si entityType es inválido', async () => {
      await expect(
        service.search({
          actorContext: validAdminContext,
          entityType: 'UNKNOWN_TYPE' as any
        })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });

    it('Sanitiza caracteres de control ASCII sin fallar', async () => {
      const dirtyQuery = 'Andrea\x00\x1F\x7F';
      const result = await service.search({
        actorContext: validAdminContext,
        query: dirtyQuery
      });

      expect(result.items.length).toBeGreaterThan(0);
    });
  });

  describe('Observabilidad y auditoría', () => {
    it('Registra evento de auditoría ADMIN_SEARCH_PERFORMED sin secretos', async () => {
      await service.search({
        actorContext: validAdminContext,
        query: 'Festival',
        entityType: 'EVENT'
      });

      expect(auditSink.record).toHaveBeenCalledTimes(1);
      expect(auditSink.record).toHaveBeenCalledWith(
        expect.objectContaining({
          procedure: 'ADMIN_SEARCH_PERFORMED',
          principalId: validAdminContext.principalId
        })
      );
    });
  });
});
