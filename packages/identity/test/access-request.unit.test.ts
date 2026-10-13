import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  BetaAccessRequestService,
  AccessRequestError,
  type AdminActorContext,
  type AuditSink
} from '../src/index.js';

class MockTransactionRunner implements TransactionRunner {
  public executedQueries: { sql: string; params: unknown[] }[] = [];
  public mockRows: any[] = [];

  async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...params: unknown[]): Promise<R[]> => {
        this.executedQueries.push({ sql, params });
        if (sql.includes('INSERT INTO beta_access_request') && sql.includes('RETURNING id')) {
          if (this.mockRows.length === 0) {
            return [{ id: params[0] }] as unknown as R[];
          }
          return [] as R[];
        }
        if (sql.includes('SELECT id FROM beta_access_request WHERE email_normalized = $1')) {
          if (this.mockRows.length > 0) {
            return [{ id: this.mockRows[0].id }] as unknown as R[];
          }
          return [] as R[];
        }
        return [...this.mockRows] as R[];
      },
      execute: async (sql: string, ...params: unknown[]): Promise<number> => {
        this.executedQueries.push({ sql, params });
        return 1;
      }
    };
    return fn(tx);
  }
}

describe('BetaAccessRequestService (Unit Tests — EL-TK-008 & EL-TK-009)', () => {
  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.internal',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  describe('EL-TK-008: Solicitar acceso a la BETA (público sin enumeración)', () => {
    function scriptedRunner(responses: { id: string }[][]) {
      const queries: string[] = [];
      const audits: unknown[][] = [];
      const runner: TransactionRunner = {
        run: (work) => work({
          query: async <R extends object>(sql: string): Promise<R[]> => {
            queries.push(sql);
            const response = responses.shift();
            if (!response) throw new Error('Unexpected query after scripted responses');
            return response as unknown as R[];
          },
          execute: async (_sql, ...args) => { audits.push(args); return 1; }
        })
      };
      return { runner, queries, audits };
    }

    it('retries when a conflicting row disappears, then resolves the identifier before auditing', async () => {
      const id = randomUUID();
      const script = scriptedRunner([[], [], [{ id }]]);
      const result = await new BetaAccessRequestService(script.runner).requestAccess({ email: 'vanishing@example.com' });
      expect(result.requestId).toBe(id);
      expect(script.queries).toHaveLength(3);
      expect(script.queries[0]).toContain('INSERT INTO beta_access_request');
      expect(script.queries[1]).toContain('SELECT id FROM beta_access_request');
      expect(script.queries[2]).toContain('INSERT INTO beta_access_request');
      expect(script.audits).toHaveLength(1);
      expect(script.audits[0]).toContain(id);
    });

    it('fails after exactly three unresolved attempts and never emits a success audit', async () => {
      const script = scriptedRunner([[], [], [], [], [], []]);
      await expect(new BetaAccessRequestService(script.runner).requestAccess({ email: 'unresolved@example.com' }))
        .rejects.toThrow('Failed to deterministically resolve beta access request identifier');
      expect(script.queries.filter((sql) => sql.includes('INSERT INTO beta_access_request'))).toHaveLength(3);
      expect(script.queries.filter((sql) => sql.includes('SELECT id FROM beta_access_request'))).toHaveLength(3);
      expect(script.audits).toEqual([]);
    });

    it('resolves a surviving conflict on a later retry without inventing a new identifier', async () => {
      const id = randomUUID();
      const script = scriptedRunner([[], [], [], [{ id }]]);
      const result = await new BetaAccessRequestService(script.runner).requestAccess({ email: 'surviving@example.com' });
      expect(result.requestId).toBe(id);
      expect(script.queries).toHaveLength(4);
      expect(script.audits).toHaveLength(1);
      expect(script.audits[0]).toContain(id);
    });

    it('rejects invalid email formats without creating records', async () => {
      const runner = new MockTransactionRunner();
      const service = new BetaAccessRequestService(runner);

      const invalidEmails = ['', 'invalid-email', '@no-local.com', 'spaces @domain.com'];
      for (const email of invalidEmails) {
        await expect(
          service.requestAccess({ email })
        ).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
      }

      expect(runner.executedQueries.length).toBe(0);
    });

    it('Scenario 1: creates a new beta access request and returns neutral confirmation', async () => {
      const runner = new MockTransactionRunner();
      runner.mockRows = []; // No existing request
      const service = new BetaAccessRequestService(runner);

      const result = await service.requestAccess({
        email: '  Applicant@Example.Com ',
        notes: 'Interested in beta testing for weddings',
        clientIp: '192.168.1.100'
      });

      expect(result.outcome).toBe('REQUEST_RECEIVED');
      expect(result.requestId).toBeDefined();
      expect(result.message).toContain('recibida para revisión');

      // Check query and insert
      const insertQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO beta_access_request')
      );
      expect(insertQuery).toBeDefined();
      expect(insertQuery?.params).toContain('applicant@example.com');
      expect(insertQuery?.sql).toContain('PENDING_REVIEW');
      expect(insertQuery?.sql).toContain('ON CONFLICT (email_normalized) DO NOTHING');

      // Check audit emission (target_identifier must be requestId, no email in audit params)
      const auditQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO admin_audit_event')
      );
      expect(auditQuery).toBeDefined();
      expect(auditQuery?.params).toContain('BETA_ACCESS_REQUEST_SUBMITTED');
      expect(auditQuery?.params).toContain(result.requestId);
      expect(auditQuery?.params.some((p) => typeof p === 'string' && p.includes('@'))).toBe(false);
    });

    it('deduplicates existing requests idempotently without leaking existence or accounts', async () => {
      const runner = new MockTransactionRunner();
      const existingId = randomUUID();
      runner.mockRows = [
        {
          id: existingId,
          email: 'repeat@example.com',
          email_normalized: 'repeat@example.com',
          status: 'PENDING_REVIEW',
          notes: 'Old notes',
          ip_hash: 'hash',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      const service = new BetaAccessRequestService(runner);
      const result = await service.requestAccess({
        email: 'repeat@example.com',
        notes: 'Updated notes'
      });

      expect(result.outcome).toBe('REQUEST_RECEIVED');
      expect(result.requestId).toBe(existingId);

      // Verify no UPDATE was executed (zero modification of existing row)
      const updateQuery = runner.executedQueries.find((q) =>
        q.sql.includes('UPDATE beta_access_request')
      );
      expect(updateQuery).toBeUndefined();

      // Verify insert was attempted
      const insertQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO beta_access_request')
      );
      expect(insertQuery).toBeDefined();
      expect(insertQuery?.sql).toContain('ON CONFLICT (email_normalized) DO NOTHING');

      // Verify select fallback was executed
      const selectQuery = runner.executedQueries.find((q) =>
        q.sql.includes('SELECT id FROM beta_access_request WHERE email_normalized = $1')
      );
      expect(selectQuery).toBeDefined();

      // Check audit emission: target_identifier is existingId, no email
      const auditQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO admin_audit_event')
      );
      expect(auditQuery).toBeDefined();
      expect(auditQuery?.params).toContain(existingId);
      expect(auditQuery?.params.some((p) => typeof p === 'string' && p.includes('@'))).toBe(false);
    });

    it('enforces rate limiting when request limit is reached', async () => {
      const runner = new MockTransactionRunner();
      runner.mockRows = [];
      const service = new BetaAccessRequestService(runner, {
        maxRequestsPerWindow: 2,
        rateLimitWindowMs: 60000
      });

      // 1st request
      await service.requestAccess({ email: 'rate@example.com', clientIp: '10.0.0.1' });
      // 2nd request
      await service.requestAccess({ email: 'rate@example.com', clientIp: '10.0.0.1' });

      // 3rd request should exceed limit
      await expect(
        service.requestAccess({ email: 'rate@example.com', clientIp: '10.0.0.1' })
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    });
  });

  describe('EL-TK-009: Revisar solicitudes de acceso BETA (inspección administrativa)', () => {
    it('rejects listing when actor context is missing or not ADMIN_HUMAN', async () => {
      const runner = new MockTransactionRunner();
      const service = new BetaAccessRequestService(runner);

      await expect(
        service.listAccessRequests({ actorContext: null as any })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

      await expect(
        service.getAccessRequest({
          actorContext: { ...adminActor, actorType: 'ORGANIZER_HUMAN' as any },
          requestId: randomUUID()
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });

    it('Scenario 1: lists access requests with administrative details (read-only)', async () => {
      const runner = new MockTransactionRunner();
      const reqId = randomUUID();
      const reqRow = {
        id: reqId,
        email: 'candidate@example.com',
        email_normalized: 'candidate@example.com',
        status: 'PENDING_REVIEW',
        notes: 'Interested',
        ip_hash: 'hash',
        created_at: new Date(),
        updated_at: new Date()
      };

      runner.run = async (fn) => {
        const tx: SqlTransaction = {
          query: async <R extends object>(sql: string): Promise<R[]> => {
            if (sql.includes('COUNT(*)')) {
              return [{ total: 1 }] as any;
            }
            return [reqRow] as any;
          },
          execute: async () => 1
        };
        return fn(tx);
      };

      const service = new BetaAccessRequestService(runner);
      const result = await service.listAccessRequests({
        actorContext: adminActor,
        limit: 10,
        offset: 0
      });

      expect(result.total).toBe(1);
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(reqId);
      expect(result.items[0].email).toBe('candidate@example.com');
      expect(result.items[0].status).toBe('PENDING_REVIEW');
    });

    it('Scenario 2: returns empty list when no requests exist without error', async () => {
      const runner = new MockTransactionRunner();
      runner.run = async (fn) => {
        const tx: SqlTransaction = {
          query: async <R extends object>(sql: string): Promise<R[]> => {
            if (sql.includes('COUNT(*)')) {
              return [{ total: 0 }] as any;
            }
            return [] as any;
          },
          execute: async () => 1
        };
        return fn(tx);
      };

      const service = new BetaAccessRequestService(runner);
      const result = await service.listAccessRequests({
        actorContext: adminActor
      });

      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('inspects details of a single request or returns null if nonexistent', async () => {
      const runner = new MockTransactionRunner();
      const reqId = randomUUID();
      runner.mockRows = [
        {
          id: reqId,
          email: 'detail@example.com',
          email_normalized: 'detail@example.com',
          status: 'PENDING_REVIEW',
          notes: 'Wedding in May',
          ip_hash: 'hash',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      const service = new BetaAccessRequestService(runner);
      const found = await service.getAccessRequest({
        actorContext: adminActor,
        requestId: reqId
      });

      expect(found.request).not.toBeNull();
      expect(found.request?.id).toBe(reqId);
      expect(found.request?.notes).toBe('Wedding in May');

      const auditQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO admin_audit_event')
      );
      expect(auditQuery).toBeDefined();
      expect(auditQuery?.params).toContain('BETA_ACCESS_REQUEST_DETAIL_VIEWED');
      expect(auditQuery?.params).toContain(reqId);
      expect(auditQuery?.params.some((p) => typeof p === 'string' && p.includes('@') && p !== adminActor.identifier)).toBe(false);

      runner.mockRows = [];
      const notFound = await service.getAccessRequest({
        actorContext: adminActor,
        requestId: randomUUID()
      });
      expect(notFound.request).toBeNull();
    });
  });
});
