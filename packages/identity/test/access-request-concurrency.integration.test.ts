import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPrismaClient, PrismaTransactions, type TransactionRunner, type SqlTransaction } from '@eventlens/database';
import { BetaAccessRequestService } from '../src/index.js';

// Deliberately never fall back to DATABASE_URL. This fixture proves service behavior,
// not deployability of the migration chain (which has a separate characterization suite).
const verificationUrl = process.env.BETA_VERIFICATION_DATABASE_URL;
const integration = verificationUrl ? describe : describe.skip;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

integration('Beta access request: isolated PostgreSQL READ COMMITTED proof', () => {
  const schema = `beta_verification_${randomUUID().replaceAll('-', '')}`;
  let observer: Client;
  let prisma: ReturnType<typeof createPrismaClient>;
  let transactions: PrismaTransactions;
  let schemaCreated = false;

  beforeAll(async () => {
    const url = new URL(verificationUrl!);
    // Both adapter-pg and pg receive an explicit startup search_path, including
    // observer/DDL connections. No public schema is available as a fallback.
    url.searchParams.set('options', `-c search_path=${schema}`);
    observer = new Client({ connectionString: url.toString() });
    await observer.connect();
    await observer.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    // Focused service fixture only: no claim that this replaces migration testing.
    await observer.query(`
      CREATE TABLE beta_access_request (
        id UUID PRIMARY KEY, email TEXT NOT NULL, email_normalized TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (status IN ('PENDING_REVIEW', 'REVIEWED')),
        notes TEXT, ip_hash TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE admin_audit_event (
        id UUID PRIMARY KEY, procedure TEXT NOT NULL, actor_id TEXT NOT NULL,
        target_identifier TEXT NOT NULL, target_principal_id UUID, result TEXT NOT NULL,
        details TEXT, timestamp TIMESTAMPTZ NOT NULL
      );
    `);
    prisma = createPrismaClient(url.toString(), { max: 24 });
    transactions = new PrismaTransactions(prisma, 15000);
    await transactions.run(async (tx) => {
      expect(await tx.query('SHOW transaction_isolation')).toEqual([{ transaction_isolation: 'read committed' }]);
      expect(await tx.query('SHOW search_path')).toEqual([{ search_path: schema }]);
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    try {
      // schema is generated locally and contains only fixed prefix + UUID hex.
      if (schemaCreated) await observer.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await observer?.end();
    }
  });

  it('waits on an uncommitted conflicting insert and returns the committed identifier', async () => {
    const inserted = deferred();
    const release = deferred();
    const secondStarted = deferred();
    let firstPid = 0;
    let secondPid = 0;
    const firstRunner: TransactionRunner = {
      run: (work) => transactions.run(async (tx) => {
        firstPid = (await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))[0].pid;
        const gate: SqlTransaction = {
          execute: (sql, ...args) => tx.execute(sql, ...args),
          query: async <R extends object>(sql: string, ...args: unknown[]): Promise<R[]> => {
            const rows = await tx.query<R>(sql, ...args);
            if (sql.includes('INSERT INTO beta_access_request') && rows.length) {
              inserted.resolve();
              await release.promise;
            }
            return rows;
          }
        };
        return work(gate);
      })
    };
    const secondRunner: TransactionRunner = {
      run: (work) => transactions.run(async (tx) => {
        secondPid = (await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))[0].pid;
        secondStarted.resolve();
        return work(tx);
      })
    };
    const first = new BetaAccessRequestService(firstRunner).requestAccess({ email: 'held@example.com' });
    let second: ReturnType<BetaAccessRequestService['requestAccess']> | undefined;
    try {
      await inserted.promise;
      second = new BetaAccessRequestService(secondRunner).requestAccess({ email: 'HELD@example.com' });
      await secondStarted.promise;
      let blocked = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const { rows } = await observer.query<{ blockers: number[]; wait_event_type: string; query: string }>(
          'SELECT pg_blocking_pids(pid) AS blockers, wait_event_type, query FROM pg_stat_activity WHERE pid = $1', [secondPid]);
        blocked = Boolean(rows[0]?.blockers.includes(firstPid) && rows[0]?.wait_event_type === 'Lock'
          && rows[0]?.query.includes('INSERT INTO beta_access_request'));
        if (blocked) break;
        await new Promise((done) => setTimeout(done, 20));
      }
      expect(blocked, 'second INSERT must demonstrably wait for first transaction').toBe(true);
      release.resolve();
      const results = await Promise.all([first, second]);
      expect(results[1]).toEqual(results[0]);
      expect(results[0].outcome).toBe('REQUEST_RECEIVED');
      const { rows } = await observer.query('SELECT id FROM beta_access_request WHERE email_normalized = $1', ['held@example.com']);
      expect(rows).toEqual([{ id: results[0].requestId }]);
    } finally {
      release.resolve();
      await Promise.allSettled(second ? [first, second] : [first]);
    }
  }, 20000);

  it('deduplicates many valid simultaneous requests and preserves every business column on repeats', async () => {
    const service = new BetaAccessRequestService(transactions, { maxRequestsPerWindow: 100 });
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) => service.requestAccess({
      email: i % 2 ? 'MANY@example.com' : 'many@example.com', notes: `initial ${i}`, clientIp: `192.0.2.${i + 1}`
    })));
    expect(new Set(results.map((result) => result.requestId)).size).toBe(1);
    for (const result of results) expect(result).toEqual(results[0]);
    expect(results[0].outcome).toBe('REQUEST_RECEIVED');
    await observer.query("UPDATE beta_access_request SET status = 'REVIEWED', notes = 'reviewed original', updated_at = created_at + interval '1 second' WHERE id = $1", [results[0].requestId]);
    const before = await observer.query('SELECT * FROM beta_access_request WHERE email_normalized = $1', ['many@example.com']);
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].status).toBe('REVIEWED');
    await Promise.all(Array.from({ length: 8 }, () => service.requestAccess({ email: 'Many@Example.Com', notes: 'replacement', clientIp: '198.51.100.1' })));
    const after = await observer.query('SELECT * FROM beta_access_request WHERE email_normalized = $1', ['many@example.com']);
    expect(after.rows).toEqual(before.rows);
  }, 20000);

  it('persists only the minimal success audit without submitted private data', async () => {
    const email = 'privacy@example.com';
    const notes = 'submitted token=private-token secret=private-secret';
    const ip = '203.0.113.77';
    const result = await new BetaAccessRequestService(transactions).requestAccess({ email, notes, clientIp: ip });
    const { rows } = await observer.query('SELECT * FROM admin_audit_event WHERE target_identifier = $1', [result.requestId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ procedure: 'BETA_ACCESS_REQUEST_SUBMITTED', actor_id: 'PUBLIC_USER',
      target_identifier: result.requestId, target_principal_id: null, result: 'REQUEST_RECEIVED',
      details: 'Beta access request received for administrative review' });
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0].timestamp).toBeInstanceOf(Date);
    const audit = JSON.stringify(rows);
    for (const value of [email, notes, ip, 'private-token', 'private-secret']) expect(audit).not.toContain(value);
  });

  it('rolls back the request when persistence of its success audit fails', async () => {
    const before = await observer.query('SELECT count(*)::int AS count FROM admin_audit_event');
    // Force a real PostgreSQL constraint failure on this one request's audit.
    await observer.query("ALTER TABLE admin_audit_event ADD CONSTRAINT reject_rollback_audit CHECK (procedure <> 'BETA_ACCESS_REQUEST_SUBMITTED') NOT VALID");
    try {
      await expect(new BetaAccessRequestService(transactions).requestAccess({ email: 'rollback@example.com' })).rejects.toThrow();
      const requests = await observer.query('SELECT id FROM beta_access_request WHERE email_normalized = $1', ['rollback@example.com']);
      expect(requests.rows).toEqual([]);
      const after = await observer.query('SELECT count(*)::int AS count FROM admin_audit_event');
      expect(after.rows).toEqual(before.rows);
    } finally {
      await observer.query('ALTER TABLE admin_audit_event DROP CONSTRAINT reject_rollback_audit');
    }
  });
});
