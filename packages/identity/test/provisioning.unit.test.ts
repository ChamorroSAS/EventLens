import { describe, it, expect } from 'vitest';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminProvisioningService,
  AuditEventRecord,
  AuditSink,
  ProvisioningError,
  assertPublicRegistrationSafe
} from '../src/index.js';

interface InMemoryDb {
  principals: Map<string, {
    id: string;
    identifier: string;
    status: string;
    auth_revision: bigint;
    provision_procedure: string;
    provisioned_by: string;
    created_at: Date;
    updated_at: Date;
  }>;
  bootstrapState: {
    id: string;
    is_consumed: boolean;
    consumed_at: Date | null;
    consumed_by: string | null;
  };
  auditEvents: AuditEventRecord[];
}

function createMockTransactionRunner(db: InMemoryDb): TransactionRunner {
  const runner: TransactionRunner = {
    async run<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
      const tx: SqlTransaction = {
        async query<R extends object>(sql: string, ...params: unknown[]): Promise<R[]> {
          const norm = sql.replace(/\s+/g, ' ');
          if (norm.includes('SELECT is_consumed FROM operational_bootstrap_state')) {
            return [{ is_consumed: db.bootstrapState.is_consumed }] as unknown as R[];
          }
          if (norm.includes('SELECT id, is_consumed FROM operational_bootstrap_state')) {
            return [{ id: db.bootstrapState.id, is_consumed: db.bootstrapState.is_consumed }] as unknown as R[];
          }
          if (norm.includes('SELECT COUNT(*) as count FROM admin_principal WHERE status = \'ACTIVE\'')) {
            const count = [...db.principals.values()].filter((p) => p.status === 'ACTIVE').length;
            return [{ count }] as unknown as R[];
          }
          if (norm.includes('SELECT id, status FROM admin_principal WHERE id = $1')) {
            const id = params[0] as string;
            const found = db.principals.get(id);
            if (found && found.status === 'ACTIVE') {
              return [{ id: found.id, status: found.status }] as unknown as R[];
            }
            return [] as unknown as R[];
          }
          if (norm.includes('FROM admin_principal WHERE id = $1 FOR UPDATE') || norm.includes('FROM admin_principal WHERE id = $1')) {
            const id = params[0] as string;
            const found = db.principals.get(id);
            if (found) {
              return [found] as unknown as R[];
            }
            return [] as unknown as R[];
          }
          if (norm.includes('UPDATE admin_principal') && norm.includes('RETURNING *')) {
            const newRevision = BigInt(params[0] as string);
            const updatedAt = params[1] as Date;
            const id = params[2] as string;
            const found = db.principals.get(id);
            if (found) {
              found.status = 'REVOKED';
              found.auth_revision = newRevision;
              found.updated_at = updatedAt;
              return [found] as unknown as R[];
            }
            return [] as unknown as R[];
          }
          if (norm.includes('SELECT id FROM admin_principal WHERE identifier = $1')) {
            const identifier = params[0] as string;
            const found = [...db.principals.values()].find((p) => p.identifier === identifier);
            if (found) {
              return [{ id: found.id }] as unknown as R[];
            }
            return [] as unknown as R[];
          }
          if (norm.includes('INSERT INTO admin_principal')) {
            const isInitial = norm.includes('INITIAL_BOOTSTRAP');
            const id = params[0] as string;
            const identifier = params[1] as string;
            const provisionedBy = isInitial ? 'SYSTEM_BOOTSTRAP' : (params[2] as string);
            const createdAt = isInitial ? (params[2] as Date) : (params[3] as Date);
            const row = {
              id,
              identifier,
              status: 'ACTIVE',
              auth_revision: 1n,
              provision_procedure: isInitial ? 'INITIAL_BOOTSTRAP' : 'AUTHORIZED_PROVISION',
              provisioned_by: provisionedBy,
              created_at: createdAt,
              updated_at: createdAt
            };
            db.principals.set(id, row);
            return [row] as unknown as R[];
          }
          return [] as unknown as R[];
        },
        async execute(sql: string, ...params: unknown[]): Promise<number> {
          if (sql.includes('UPDATE admin_credential')) {
            return 1;
          }
          if (sql.includes('UPDATE admin_session')) {
            return 2;
          }
          if (sql.includes('UPDATE operational_bootstrap_state')) {
            const [consumedAt] = params as [Date];
            db.bootstrapState.is_consumed = true;
            db.bootstrapState.consumed_at = consumedAt;
            db.bootstrapState.consumed_by = 'INITIAL_BOOTSTRAP';
            return 1;
          }
          if (sql.includes('INSERT INTO operational_bootstrap_state')) {
            return 1;
          }
          if (sql.includes('INSERT INTO admin_audit_event')) {
            const [id, procedure, actorId, targetIdentifier, targetPrincipalId, result, details, timestamp] = params as [
              string, any, string, string, string | null, any, string | null, Date
            ];
            db.auditEvents.push({
              id,
              procedure,
              actorId,
              targetIdentifier,
              targetPrincipalId: targetPrincipalId ?? undefined,
              result,
              details: details ?? undefined,
              timestamp
            });
            return 1;
          }
          return 0;
        }
      };
      return work(tx);
    }
  };
  return runner;
}

function setup() {
  const db: InMemoryDb = {
    principals: new Map(),
    bootstrapState: {
      id: 'SYSTEM_BOOTSTRAP',
      is_consumed: false,
      consumed_at: null,
      consumed_by: null
    },
    auditEvents: []
  };

  const externalAudit: AuditEventRecord[] = [];
  const externalSink: AuditSink = {
    async record(event: AuditEventRecord) {
      externalAudit.push(event);
    }
  };

  const secret = 'super-secure-bootstrap-token-12345';
  const runner = createMockTransactionRunner(db);
  const service = new AdminProvisioningService(runner, secret, externalSink);

  return { db, service, secret, externalAudit };
}

describe('AdminProvisioningService (Unit Tests)', () => {
  describe('Configuration validation', () => {
    it('rejects empty or whitespace-only bootstrap secrets', () => {
      const runner = createMockTransactionRunner({
        principals: new Map(),
        bootstrapState: { id: 'SYSTEM_BOOTSTRAP', is_consumed: false, consumed_at: null, consumed_by: null },
        auditEvents: []
      });
      expect(() => new AdminProvisioningService(runner, '')).toThrow(ProvisioningError);
      expect(() => new AdminProvisioningService(runner, '   ')).toThrow(ProvisioningError);
    });
  });

  describe('Controlled Initial Bootstrap (Variant A)', () => {
    it('successfully provisions initial admin principal and consumes bootstrap permanently', async () => {
      const { service, secret, db } = setup();

      expect(await service.isBootstrapConsumed()).toBe(false);

      const principal = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      expect(principal.id).toBeTruthy();
      expect(principal.identifier).toBe('initial-admin@eventlens.local');
      expect(principal.status).toBe('ACTIVE');
      expect(principal.authRevision).toBe(1n);
      expect(principal.provisionProcedure).toBe('INITIAL_BOOTSTRAP');
      expect(principal.provisionedBy).toBe('SYSTEM_BOOTSTRAP');

      // Bootstrap state must be permanently consumed
      expect(db.bootstrapState.is_consumed).toBe(true);
      expect(db.bootstrapState.consumed_by).toBe('INITIAL_BOOTSTRAP');
      expect(await service.isBootstrapConsumed()).toBe(true);

      // Audit event recorded without secrets
      const successAudit = db.auditEvents.find((e) => e.result === 'SUCCESS');
      expect(successAudit).toBeDefined();
      expect(successAudit?.procedure).toBe('INITIAL_BOOTSTRAP');
      expect(successAudit?.actorId).toBe('SYSTEM_BOOTSTRAP');
      expect(successAudit?.targetIdentifier).toBe('initial-admin@eventlens.local');
      expect(successAudit?.targetPrincipalId).toBe(principal.id);
    });

    it('rejects replay of consumed bootstrap (single-use invariant)', async () => {
      const { service, secret, db } = setup();

      // First execution succeeds
      await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'admin1@eventlens.local'
      });

      // Second execution must be rejected
      await expect(
        service.provisionInitialBootstrap({
          operatorToken: secret,
          identifier: 'admin2@eventlens.local'
        })
      ).rejects.toMatchObject({
        code: 'BOOTSTRAP_ALREADY_CONSUMED'
      });

      // Exactly 1 principal exists
      expect(db.principals.size).toBe(1);

      // Audit event records consumed rejection
      const rejection = db.auditEvents.find((e) => e.result === 'REJECTED_BOOTSTRAP_CONSUMED');
      expect(rejection).toBeDefined();
      expect(rejection?.targetIdentifier).toBe('admin2@eventlens.local');
    });

    it('rejects invalid bootstrap operator token without disclosing secret', async () => {
      const { service, db } = setup();

      await expect(
        service.provisionInitialBootstrap({
          operatorToken: 'wrong-token',
          identifier: 'attacker@eventlens.local'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_PROVISIONER'
      });

      // No principal created, bootstrap still unconsumed
      expect(db.principals.size).toBe(0);
      expect(db.bootstrapState.is_consumed).toBe(false);

      // Audit recorded without any secret leakage
      const audit = db.auditEvents.find((e) => e.result === 'REJECTED_UNAUTHORIZED');
      expect(audit).toBeDefined();
      expect(audit?.details).not.toContain('wrong-token');
      expect(audit?.details).not.toContain('super-secure');
    });

    it('rejects empty or invalid arguments', async () => {
      const { service, secret } = setup();

      await expect(
        service.provisionInitialBootstrap({ operatorToken: secret, identifier: '' })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

      await expect(
        service.provisionInitialBootstrap({ operatorToken: '', identifier: 'admin@eventlens.local' })
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    });
  });

  describe('Subsequent Controlled Provisioning (Variant B)', () => {
    it('provisions a second admin principal when invoked by an authorized active admin', async () => {
      const { service, secret, db } = setup();

      // Setup initial admin
      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      // Subsequent provision by authorized actor
      const subsequentAdmin = await service.provisionSubsequent({
        authorizingActor: {
          id: initialAdmin.id,
          isAuthorizedProvisioner: true
        },
        identifier: 'subsequent-admin@eventlens.local'
      });

      expect(subsequentAdmin.id).toBeTruthy();
      expect(subsequentAdmin.identifier).toBe('subsequent-admin@eventlens.local');
      expect(subsequentAdmin.status).toBe('ACTIVE');
      expect(subsequentAdmin.authRevision).toBe(1n);
      expect(subsequentAdmin.provisionProcedure).toBe('AUTHORIZED_PROVISION');
      expect(subsequentAdmin.provisionedBy).toBe(initialAdmin.id);

      // Verify bootstrap was NOT reopened
      expect(db.bootstrapState.is_consumed).toBe(true);

      // Total 2 principals in db
      expect(db.principals.size).toBe(2);

      // Audit event recorded
      const audit = db.auditEvents.find(
        (e) => e.procedure === 'AUTHORIZED_PROVISION' && e.result === 'SUCCESS'
      );
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(initialAdmin.id);
      expect(audit?.targetIdentifier).toBe('subsequent-admin@eventlens.local');
      expect(audit?.targetPrincipalId).toBe(subsequentAdmin.id);
    });

    it('rejects unauthorized caller attempting subsequent provision', async () => {
      const { service, secret, db } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      // Actor with isAuthorizedProvisioner = false
      await expect(
        service.provisionSubsequent({
          authorizingActor: {
            id: initialAdmin.id,
            isAuthorizedProvisioner: false
          },
          identifier: 'unauthorized-target@eventlens.local'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_PROVISIONER'
      });

      // Unknown actor not in DB
      await expect(
        service.provisionSubsequent({
          authorizingActor: {
            id: 'non-existent-admin-id',
            isAuthorizedProvisioner: true
          },
          identifier: 'unauthorized-target@eventlens.local'
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_PROVISIONER'
      });

      // No new principal created
      expect(db.principals.size).toBe(1);

      // Audit recorded without secrets
      const unauthorizedAudits = db.auditEvents.filter((e) => e.result === 'REJECTED_UNAUTHORIZED');
      expect(unauthorizedAudits.length).toBeGreaterThan(0);
    });

    it('rejects duplicate principal identifier on subsequent provisioning', async () => {
      const { service, secret, db } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      await expect(
        service.provisionSubsequent({
          authorizingActor: {
            id: initialAdmin.id,
            isAuthorizedProvisioner: true
          },
          identifier: 'initial-admin@eventlens.local'
        })
      ).rejects.toMatchObject({
        code: 'DUPLICATE_PRINCIPAL'
      });

      expect(db.principals.size).toBe(1);
    });
  });

  describe('Public Registration Auto-Elevation Prevention', () => {
    it('rejects public registration payload attempting role injection', async () => {
      const { service, db } = setup();

      const injectionPayloads = [
        { email: 'user@example.com', role: 'admin' },
        { email: 'user@example.com', roles: ['admin'] },
        { email: 'user@example.com', isAdmin: true },
        { email: 'user@example.com', is_admin: true },
        { email: 'user@example.com', administrative: true },
        { email: 'user@example.com', permissions: ['ALL'] },
        { email: 'user@example.com', privilege: 'root' },
        { email: 'user@example.com', isSuperuser: true }
      ];

      for (const payload of injectionPayloads) {
        await expect(service.guardPublicRegistration(payload)).rejects.toMatchObject({
          code: 'PUBLIC_ELEVATION_DENIED'
        });
      }

      // No administrative principals ever created from public payloads
      expect(db.principals.size).toBe(0);

      // Audits recorded for each rejection
      const elevationAudits = db.auditEvents.filter((e) => e.result === 'REJECTED_PUBLIC_ELEVATION');
      expect(elevationAudits.length).toBe(injectionPayloads.length);
      for (const audit of elevationAudits) {
        expect(audit.procedure).toBe('PUBLIC_ENTRY_REJECTED');
        expect(audit.actorId).toBe('PUBLIC_BETA_USER');
      }
    });

    it('allows normal public registration payloads without elevation keys', async () => {
      const { service, db } = setup();

      const legitimatePayloads = [
        { email: 'guest@example.com', name: 'Guest User' },
        { email: 'organizer@example.com', phone: '+123456789' }
      ];

      for (const payload of legitimatePayloads) {
        await expect(service.guardPublicRegistration(payload)).resolves.toBeUndefined();
      }

      expect(db.auditEvents.filter((e) => e.result === 'REJECTED_PUBLIC_ELEVATION')).toHaveLength(0);
    });

    it('standalone assertPublicRegistrationSafe helper validates clean input', () => {
      expect(() => assertPublicRegistrationSafe({ email: 'test@example.com' })).not.toThrow();
      expect(() => assertPublicRegistrationSafe({ role: 'admin' })).toThrow(ProvisioningError);
    });
  });

  describe('Admin Principal Revocation (EL-TK-045)', () => {
    it('revokes an active admin principal and invalidates credentials/sessions', async () => {
      const { service, secret, db } = setup();

      // Bootstrap initial admin
      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      // Provision a second admin
      const secondAdmin = await service.provisionSubsequent({
        authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
        identifier: 'second-admin@eventlens.local'
      });

      // Initial admin revokes the second admin
      const result = await service.revokeAdminPrincipal({
        authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
        targetPrincipalId: secondAdmin.id,
        reason: 'Security rotation test'
      });

      expect(result.outcome).toBe('REVOKED');
      expect(result.principal.status).toBe('REVOKED');
      expect(result.principal.authRevision).toBe(2n);
      expect(result.revokedSessionsCount).toBe(2);

      // Verify db state
      const targetInDb = db.principals.get(secondAdmin.id);
      expect(targetInDb?.status).toBe('REVOKED');

      // Verify audit trail
      const revokeAudit = db.auditEvents.find((e) => e.procedure === 'ADMIN_PRINCIPAL_REVOKED' && e.result === 'PRINCIPAL_REVOKED');
      expect(revokeAudit).toBeDefined();
      expect(revokeAudit?.targetPrincipalId).toBe(secondAdmin.id);
      expect(revokeAudit?.actorId).toBe(initialAdmin.id);
    });

    it('is idempotent when revoking an already revoked principal', async () => {
      const { service, secret, db } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      const secondAdmin = await service.provisionSubsequent({
        authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
        identifier: 'second-admin@eventlens.local'
      });

      // First revocation
      await service.revokeAdminPrincipal({
        authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
        targetPrincipalId: secondAdmin.id
      });

      // Second revocation (idempotent retry)
      const retryResult = await service.revokeAdminPrincipal({
        authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
        targetPrincipalId: secondAdmin.id
      });

      expect(retryResult.outcome).toBe('ALREADY_REVOKED');
      expect(retryResult.revokedSessionsCount).toBe(0);

      const idempotentAudit = db.auditEvents.find((e) => e.result === 'ALREADY_REVOKED');
      expect(idempotentAudit).toBeDefined();
    });

    it('rejects revocation attempt by unauthorized caller', async () => {
      const { service, secret } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      await expect(
        service.revokeAdminPrincipal({
          authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: false },
          targetPrincipalId: initialAdmin.id
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED_PROVISIONER'
      });
    });

    it('rejects revocation when target principal does not exist', async () => {
      const { service, secret } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'initial-admin@eventlens.local'
      });

      await expect(
        service.revokeAdminPrincipal({
          authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
          targetPrincipalId: '00000000-0000-0000-0000-000000000000'
        })
      ).rejects.toMatchObject({
        code: 'PRINCIPAL_NOT_FOUND'
      });
    });

    it('guards against revoking the sole active administrator', async () => {
      const { service, secret } = setup();

      const initialAdmin = await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'only-admin@eventlens.local'
      });

      // Only 1 admin in the system: cannot revoke
      await expect(
        service.revokeAdminPrincipal({
          authorizingActor: { id: initialAdmin.id, isAuthorizedProvisioner: true },
          targetPrincipalId: initialAdmin.id
        })
      ).rejects.toMatchObject({
        code: 'CANNOT_REVOKE_SOLE_ACTIVE_ADMIN'
      });
    });
  });

  describe('Observability and Zero-Secrets Invariant', () => {
    it('ensures no audit events leak tokens, passwords, or grants', async () => {
      const { service, secret, db } = setup();

      await service.provisionInitialBootstrap({
        operatorToken: secret,
        identifier: 'audit-test-admin@eventlens.local'
      });

      for (const audit of db.auditEvents) {
        const serialized = JSON.stringify(audit);
        expect(serialized).not.toContain(secret);
        expect(serialized).not.toContain('password');
        expect(serialized).not.toContain('token');
        expect(serialized).not.toContain('grant');
      }
    });
  });
});
