import { createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from './index.js';

export interface TestIsolationPolicy { database: string; role: string; marker: string; }
/** Only the ephemeral runner may issue a test policy. A database name alone is insufficient. */
export function readTestIsolationPolicy(env: NodeJS.ProcessEnv = process.env): TestIsolationPolicy {
  const database = env.EVENTLENS_TEST_DATABASE;
  const role = env.EVENTLENS_TEST_ROLE;
  const token = env.EVENTLENS_TEST_TOKEN;
  if (!database || !/^el_test_[a-f0-9]{32}$/.test(database) || !role ||
      !/^el_test_role_[a-f0-9]{32}$/.test(role) || !token || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error('TEST_ISOLATION_REQUIRED: use the isolated test runner');
  }
  return { database, role, marker: `eventlens-test-v1:${createHash('sha256').update(token).digest('hex')}` };
}
export function assertTestConnectionUrl(url: string, env: NodeJS.ProcessEnv = process.env): void {
  const policy = readTestIsolationPolicy(env);
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('TEST_ISOLATION_CONNECTION_REJECTED'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      decodeURIComponent(parsed.pathname.slice(1)) !== policy.database ||
      decodeURIComponent(parsed.username) !== policy.role) throw new Error('TEST_ISOLATION_CONNECTION_REJECTED');
}
/** Read the effective server identity and database ownership before permitting writes. */
export async function assertTestDatabase(tx: Pick<SqlTransaction, 'query'>, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const policy = readTestIsolationPolicy(env);
  const rows = await tx.query<{ database: string; role: string; owner: string; marker: string | null; privileged: boolean }>(`
    SELECT current_database() AS database, current_user AS role,
      pg_get_userbyid(d.datdba) AS owner, shobj_description(d.oid, 'pg_database') AS marker,
      (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls) AS privileged
    FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
    WHERE d.datname = current_database()`);
  const row = rows[0];
  if (rows.length !== 1 || !row || row.database !== policy.database || row.role !== policy.role ||
      row.owner !== policy.role || row.marker !== policy.marker || row.privileged !== false) {
    throw new Error('TEST_ISOLATION_EFFECTIVE_DATABASE_REJECTED');
  }
}
/** Guard every transaction, including cleanup and domain service writes. */
export class IsolatedTestTransactions implements TransactionRunner {
  constructor(private readonly delegate: TransactionRunner, private readonly env: NodeJS.ProcessEnv = process.env) {
    readTestIsolationPolicy(env);
  }
  run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    return this.delegate.run(async tx => { await assertTestDatabase(tx, this.env); return work(tx); });
  }
}
