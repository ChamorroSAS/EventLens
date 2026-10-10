import { PrismaClient, Prisma } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { isIP } from 'node:net';
/** Build one connection URI without interpreting reserved characters in credentials. */
export function readDatabaseUrl(env:NodeJS.ProcessEnv):string {
  if (env.DATABASE_URL !== undefined) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:','postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 ||
        (url.port && (!Number.isInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535))) throw new Error();
      return env.DATABASE_URL;
    } catch { throw new Error('INVALID_CONFIG:DATABASE_URL'); }
  }
  for (const field of ['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'] as const) {
    if (!env[field]) throw new Error(`INVALID_CONFIG:${field}`);
  }
  const host = env.PGHOST!;
  const port = Number(env.PGPORT);
  if (!/^\d+$/.test(env.PGPORT!) || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_CONFIG:PGPORT');
  const address = host.startsWith('[') && host.endsWith(']') ? host.slice(1,-1) : host;
  if (!isIP(address) && !/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) throw new Error('INVALID_CONFIG:PGHOST');
  const uriHost = isIP(address) === 6 ? `[${address}]` : host;
  return `postgresql://${encodeURIComponent(env.PGUSER!)}:${encodeURIComponent(env.PGPASSWORD!)}@${uriHost}:${port}/${encodeURIComponent(env.PGDATABASE!)}`;
}
/** Infrastructure-only SQL capabilities. Generated ORM models stay inside adapters. */
export interface SqlTransaction {
  query<T extends object>(sql: string, ...parameters: unknown[]): Promise<T[]>;
  execute(sql: string, ...parameters: unknown[]): Promise<number>;
}
export interface TransactionRunner { run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T>; }
export interface ConnectionLimits { connectionTimeoutMillis?: number; query_timeout?: number; max?: number; }
export function createPrismaClient(connectionString: string, limits: ConnectionLimits = {}): PrismaClient {
  return new PrismaClient({adapter: new PrismaPg({connectionString, ...limits})});
}
export class PrismaTransactions implements TransactionRunner {
  constructor(private readonly client: PrismaClient, private readonly timeoutMs: number) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('INVALID_TRANSACTION_TIMEOUT');
  }
  run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    return this.client.$transaction(p => work({
      query: <R extends object>(sql: string, ...args: unknown[]) => p.$queryRawUnsafe<R[]>(sql, ...args),
      execute: (sql: string, ...args: unknown[]) => p.$executeRawUnsafe(sql, ...args)
    }), {isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: this.timeoutMs, maxWait: this.timeoutMs});
  }
}
