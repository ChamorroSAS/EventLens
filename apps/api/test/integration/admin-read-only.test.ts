import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { assertTestConnectionUrl, assertTestDatabase, IsolatedTestTransactions } from '@eventlens/database/testing';
import type { TransactionRunner } from '@eventlens/database';
import type { RecoveryAuthorityPort } from '@eventlens/identity';
import { AdminSessionService } from '../../src/identity/admin-session.service.js';
import { AdminReadOnlyService } from '../../src/admin/admin-read-only.service.js';
import { AdminReadOnlyController } from '../../src/admin/admin-read-only.controller.js';
import { DatabaseService } from '../../src/platform/database/database.service.js';
import { readConfig } from '../../src/platform/config/config.js';

// SQL durability/schema evidence only. This laboratory DI port is not an accredited operational RecoveryAuthority.
const labAuthority: RecoveryAuthorityPort = { getRecoveryEpoch: async () => 1n, getCredentialRevision: async () => 1n, getAdminAuthWatermark: async () => 1n };
const principalId = randomUUID();
const eventId = randomUUID();
const organizerId = randomUUID();
const token = randomBytes(32).toString('hex');
const cookie = `__Host-el_admin_session=${token}`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let database: DatabaseService;
let transactions: TransactionRunner;
let controller: AdminReadOnlyController;
let config: ReturnType<typeof readConfig>;

beforeAll(async () => {
  config = readConfig(process.env);
  // Reject unissued/unsafe URL before creating a client; verify the effective database before any fixture writes.
  assertTestConnectionUrl(config.databaseUrl);
  database = new DatabaseService(config);
  await database.transactions.run(tx => assertTestDatabase(tx));
  transactions = new IsolatedTestTransactions(database.transactions);
  const isolatedDatabase = { transactions } as DatabaseService;
  const sessions = new AdminSessionService(isolatedDatabase, config, labAuthority);
  controller = new AdminReadOnlyController(new AdminReadOnlyService(isolatedDatabase, sessions));
  await transactions.run(async tx => {
    const invitationId = randomUUID();
    await tx.execute(`INSERT INTO admin_principal (id,identifier,status,auth_revision,provision_procedure,provisioned_by) VALUES ($1,$2,'ACTIVE',1,'AUTHORIZED_PROVISION','laboratory')`, principalId, `${principalId}@admin.test`);
    await tx.execute(`INSERT INTO admin_credential (id,principal_id,secret_digest,revision,status) VALUES ($1,$2,$3,1,'ACTIVE')`, randomUUID(), principalId, digest(randomBytes(32).toString('hex')));
    await tx.execute(`INSERT INTO admin_session (id,principal_id,token_digest,csrf_token_digest,auth_time,expires_at,last_active_at,idle_expires_at,session_watermark) VALUES ($1,$2,$3,$4,NOW(),NOW()+INTERVAL '1 hour',NOW(),NOW()+INTERVAL '20 minutes',1)`, randomUUID(), principalId, digest(token), digest(randomBytes(32).toString('hex')));
    await tx.execute(`INSERT INTO beta_invitation (id,email,email_normalized,token_digest,status,issued_by,expires_at) VALUES ($1,$2,$2,$3,'CONSUMED',$4,NOW()+INTERVAL '1 day')`, invitationId, `${organizerId}@owner.test`, digest(randomBytes(32).toString('hex')), principalId);
    await tx.execute(`INSERT INTO organizer_account (id,email,email_normalized,status,declared_adult,invitation_id) VALUES ($1,$2,$2,'ACTIVE',true,$3)`, organizerId, `${organizerId}@owner.test`, invitationId);
    await tx.execute(`INSERT INTO event (id,organizer_id,name,status,timezone) VALUES ($1,$2,'Laboratory event','DRAFT','America/Bogota')`, eventId, organizerId);
  });
});

afterAll(async () => { await database?.onModuleDestroy(); });
const response = { setHeader() {} };

it('persists one real SQL owner audit before returning search/detail on the migrated schema', async () => {
  const result = await controller.search({ query: eventId, entityType: 'EVENT' }, { headers: { cookie } }, response);
  expect(result.pagination.total).toBe(1);
  expect(result.items[0].id).toBe(eventId);
  const detail = await controller.detail(eventId, { headers: { cookie } }, response);
  expect(detail.capacity).toEqual({ availability: 'UNAVAILABLE' });
  expect(detail.overallAvailability).toBe('PARTIAL');
  const audits = await transactions.run(tx => tx.query<{ procedure: string; details: string }>(`SELECT procedure,details FROM admin_audit_event WHERE actor_id=$1 ORDER BY timestamp`, principalId));
  expect(audits.map(audit => audit.procedure).sort()).toEqual(['ADMIN_EVENT_DETAIL_VIEWED', 'ADMIN_SEARCH_PERFORMED']);
  expect(JSON.stringify(audits)).not.toContain(token);
  expect(audits.find(audit => audit.procedure === 'ADMIN_SEARCH_PERFORMED')!.details).not.toContain(eventId);
});

it('does not return data when a SQL audit acknowledgement fails, and commits no audit row', async () => {
  const failing: TransactionRunner = { run: action => transactions.run(tx => action({
    query: tx.query.bind(tx),
    execute: (sql, ...args) => {
      if (sql.includes('INSERT INTO admin_audit_event')) return Promise.reject(new Error('laboratory audit failure'));
      return tx.execute(sql, ...args);
    }
  })) };
  const isolatedDatabase = { transactions: failing } as DatabaseService;
  const service = new AdminReadOnlyService(isolatedDatabase, new AdminSessionService(isolatedDatabase, config, labAuthority));
  const before = await transactions.run(tx => tx.query<{ total: bigint }>(`SELECT COUNT(*) AS total FROM admin_audit_event WHERE actor_id=$1`, principalId));
  await expect(service.search(cookie, { entityType: 'EVENT' })).rejects.toMatchObject({ response: { code: 'TEMPORARY_FAILURE', message: 'Administrative service unavailable' } });
  const after = await transactions.run(tx => tx.query<{ total: bigint }>(`SELECT COUNT(*) AS total FROM admin_audit_event WHERE actor_id=$1`, principalId));
  expect(after).toEqual(before);
});
