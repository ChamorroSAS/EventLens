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

      // Check audit emission
      const auditQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO admin_audit_event')
      );
      expect(auditQuery).toBeDefined();
      expect(auditQuery?.params).toContain('BETA_ACCESS_REQUEST_SUBMITTED');
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

      // Verify update without inserting duplicate
      const updateQuery = runner.executedQueries.find((q) =>
        q.sql.includes('UPDATE beta_access_request')
      );
      expect(updateQuery).toBeDefined();
      const insertQuery = runner.executedQueries.find((q) =>
        q.sql.includes('INSERT INTO beta_access_request')
      );
      expect(insertQuery).toBeUndefined();
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

      runner.mockRows = [];
      const notFound = await service.getAccessRequest({
        actorContext: adminActor,
        requestId: randomUUID()
      });
      expect(notFound.request).toBeNull();
    });
  });
});
