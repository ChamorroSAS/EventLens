import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
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

/**
 * Verify that a port is strictly available for binding before test server listen.
 * Rejects occupied ports without fallback.
 */
export async function assertPortAvailable(port: number, host = '127.0.0.1'): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('TEST_PORT_INVALID: port must be an integer between 1 and 65535');
  }
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`TEST_PORT_IN_USE: port ${port} is occupied`));
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port, host);
  });
}

export interface TestServerStartupOptions {
  env?: NodeJS.ProcessEnv;
  port?: number;
  host?: string;
  checkPort?: boolean;
  requireAuthority?: boolean;
  authority?: unknown;
}

/**
 * Validate test isolation before HTTP listen and before executing any mutating callback.
 * Early rejection of development URLs, missing policy, occupied ports, or invalid environment.
 * Fails closed without fallback.
 */
export async function assertTestServerStartup(options: TestServerStartupOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const isTestEnv = env.NODE_ENV === 'test' || env.VITEST !== undefined;
  if (!isTestEnv) {
    throw new Error('TEST_ENVIRONMENT_REQUIRED: NODE_ENV=test or VITEST required before server startup');
  }

  // Validate declared policy shape
  readTestIsolationPolicy(env);

  // Validate DATABASE_URL against declared policy without connecting
  if (env.DATABASE_URL) {
    assertTestConnectionUrl(env.DATABASE_URL, env);
  }

  // Validate port availability if requested
  if (options.port !== undefined && options.checkPort !== false) {
    await assertPortAvailable(options.port, options.host ?? '127.0.0.1');
  }

  // Validate laboratory authority if required
  if (options.requireAuthority) {
    if (!options.authority || typeof options.authority !== 'object') {
      throw new Error('TEST_AUTHORITY_REQUIRED: durable laboratory authority required');
    }
    const auth = options.authority as Record<string, unknown>;
    if (typeof auth['getRecoveryEpoch'] !== 'function' || typeof auth['getCredentialRevision'] !== 'function') {
      throw new Error('TEST_AUTHORITY_INVALID: authority must implement laboratory protocol');
    }
  }
}

/**
 * In-memory durable laboratory authority for EL-EP-019 mutant tests.
 * Decoupled from ephemeral PostgreSQL timeline and rollbacks.
 */
export class LaboratoryTestAuthority {
  private epoch: bigint;
  private readonly credentialRevisions = new Map<string, bigint>();
  private readonly watermarks = new Map<string, bigint>();
  private readonly barriers = new Map<string, bigint>();
  private readonly preparedReceipts = new Map<string, { command: unknown; dbRevision?: bigint }>();
  private readonly facts: Array<{ sequence: bigint; type: string; data: unknown }> = [];
  private factSequence = 0n;

  constructor(initialState?: { epoch?: bigint }) {
    this.epoch = initialState?.epoch ?? 1n;
  }

  async getRecoveryEpoch(): Promise<bigint> {
    return this.epoch;
  }

  async getCredentialRevision(principalId: string): Promise<bigint | null> {
    return this.credentialRevisions.get(principalId) ?? 1n;
  }

  async getAdminAuthWatermark(principalId: string): Promise<bigint> {
    return this.watermarks.get(principalId) ?? 0n;
  }

  async prepare(command: { operationId: string; subjectRef: string; fact?: { type: string; data: unknown } }): Promise<{ receipt: string; expiresAt: Date }> {
    const barrier = this.barriers.get('MOD-001');
    if (barrier !== undefined && barrier >= this.epoch) {
      throw new Error('RECOVERY_BARRIER_ACTIVE: sensitive operations blocked');
    }
    const receipt = `lab-receipt-${command.operationId}`;
    this.preparedReceipts.set(receipt, { command });
    return { receipt, expiresAt: new Date(Date.now() + 60000) };
  }

  async ackCommit(receipt: string, dbRevision: bigint): Promise<void> {
    const prepared = this.preparedReceipts.get(receipt);
    if (!prepared) {
      throw new Error('UNKNOWN_RECOVERY_RECEIPT');
    }
    prepared.dbRevision = dbRevision;
    const cmd = prepared.command as { fact?: { type: string; data: unknown } };
    if (cmd?.fact) {
      this.factSequence += 1n;
      this.facts.push({
        sequence: this.factSequence,
        type: cmd.fact.type,
        data: cmd.fact.data
      });
    }
  }

  async resolveAbort(receipt: string, _reason: string): Promise<void> {
    this.preparedReceipts.delete(receipt);
  }

  async setRecoveryBarrier(epoch: bigint, scope: string): Promise<void> {
    this.barriers.set(scope, epoch);
  }

  async isRecoveryBarrierActive(epoch: bigint, scope: string): Promise<boolean> {
    const barrier = this.barriers.get(scope);
    return barrier !== undefined && barrier >= epoch;
  }

  advanceEpoch(): bigint {
    this.epoch += 1n;
    return this.epoch;
  }

  setCredentialRevision(principalId: string, revision: bigint): void {
    this.credentialRevisions.set(principalId, revision);
  }

  setAdminAuthWatermark(principalId: string, watermark: bigint): void {
    this.watermarks.set(principalId, watermark);
  }

  getFactHistory(): readonly { sequence: bigint; type: string; data: unknown }[] {
    return Object.freeze([...this.facts]);
  }
}

/**
 * Creates redacted audit log payload free of secrets, credentials, tokens, cookies, or raw DATABASE_URL.
 */
export function createRedactedIsolationAudit(
  executionId: string,
  details: {
    status: 'PASS' | 'FAIL';
    database?: string;
    role?: string;
    ports?: Record<string, number>;
    cases?: string[];
    [key: string]: unknown;
  }
): Record<string, unknown> {
  const audit: Record<string, unknown> = {
    executionId,
    status: details.status,
    timestamp: new Date().toISOString()
  };

  if (details.database) audit['database'] = details.database;
  if (details.role) audit['role'] = details.role;
  if (details.ports) audit['ports'] = details.ports;
  if (details.cases) audit['cases'] = details.cases;

  for (const [key, val] of Object.entries(details)) {
    if (['status', 'database', 'role', 'ports', 'cases'].includes(key)) continue;
    // Sanitize any potential secret-bearing fields
    if (/token|secret|password|credential|database_url|cookie|session/i.test(key)) {
      continue;
    }
    if (typeof val === 'string' && /postgres:\/\/|postgresql:\/\//i.test(val)) {
      continue;
    }
    audit[key] = val;
  }

  return audit;
}
