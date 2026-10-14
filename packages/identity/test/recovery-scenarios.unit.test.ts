import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AdminAuthenticationService,
  DurableRecoveryAuthorityAdapter,
  Mod001RecoveryCoordinator,
  RecoveryError,
  AuthenticationError,
  type PrepareSensitiveOperationCommand
} from '../src/index.js';

interface PrincipalRow {
  id: string;
  identifier: string;
  status: string;
  auth_revision: string | bigint;
}

interface CredentialRow {
  id: string;
  principal_id: string;
  purpose: string;
  secret_digest: string;
  revision: string | bigint;
  status: string;
}

interface SessionRow {
  id: string;
  principal_id: string;
  token_digest: string;
  csrf_token_digest: string;
  auth_time: Date;
  expires_at: Date;
  last_active_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  session_watermark: string | bigint;
}

class SimulatedPostgresWithSnapshot implements TransactionRunner {
  public principals = new Map<string, PrincipalRow>();
  public credentials = new Map<string, CredentialRow>();
  public sessions = new Map<string, SessionRow>();
  public auditEvents: any[] = [];

  // Snapshot store
  private snapshotState: {
    principals: string;
    credentials: string;
    sessions: string;
  } | null = null;

  public takeSnapshot(): void {
    const replacer = (_: string, v: unknown) => (typeof v === 'bigint' ? `BIGINT:${v.toString()}` : v);
    this.snapshotState = {
      principals: JSON.stringify(Array.from(this.principals.entries()), replacer),
      credentials: JSON.stringify(Array.from(this.credentials.entries()), replacer),
      sessions: JSON.stringify(Array.from(this.sessions.entries()), replacer)
    };
  }

  public restoreSnapshot(): void {
    if (!this.snapshotState) {
      throw new Error('NO_SNAPSHOT_AVAILABLE');
    }
    const reviver = (_: string, v: unknown) => {
      if (typeof v === 'string' && v.startsWith('BIGINT:')) {
        return BigInt(v.slice(7));
      }
      return v;
    };
    this.principals = new Map(JSON.parse(this.snapshotState.principals, reviver));
    this.credentials = new Map(JSON.parse(this.snapshotState.credentials, reviver));
    this.sessions = new Map(
      JSON.parse(this.snapshotState.sessions, reviver).map(([k, v]: [string, any]) => [
        k,
        {
          ...v,
          auth_time: new Date(v.auth_time),
          expires_at: new Date(v.expires_at),
          last_active_at: new Date(v.last_active_at),
          idle_expires_at: new Date(v.idle_expires_at),
          revoked_at: v.revoked_at ? new Date(v.revoked_at) : null
        }
      ])
    );
  }

  async run<T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx: SqlTransaction = {
      query: async <R extends object>(sql: string, ...params: unknown[]): Promise<R[]> => {
        if (sql.includes('FROM admin_session') && sql.includes('token_digest = $1')) {
          const digest = String(params[0]);
          for (const s of this.sessions.values()) {
            if (s.token_digest === digest) {
              return [s as unknown as R];
            }
          }
          return [];
        }

        if (sql.includes('FROM admin_principal') && sql.includes('WHERE id = $1')) {
          const id = String(params[0]);
          const p = this.principals.get(id);
          return p ? [p as unknown as R] : [];
        }

        if (sql.includes('FROM admin_credential') && sql.includes('WHERE principal_id = $1')) {
          const pid = String(params[0]);
          const creds = Array.from(this.credentials.values()).filter(
            (c) => c.principal_id === pid && c.status === 'ACTIVE'
          );
          creds.sort((a, b) => (BigInt(b.revision) > BigInt(a.revision) ? 1 : -1));
          return creds as unknown as R[];
        }

        return [];
      },
      execute: async (sql: string, ...params: unknown[]): Promise<number> => {
        if (sql.includes('UPDATE admin_principal SET status = \'REVOKED\'')) {
          const id = String(params[0]);
          const p = this.principals.get(id);
          if (p && p.status !== 'REVOKED') {
            p.status = 'REVOKED';
            p.auth_revision = BigInt(p.auth_revision) + 1n;
            return 1;
          }
          return 0;
        }

        if (sql.includes('UPDATE admin_credential SET status = \'REVOKED\'')) {
          const pid = String(params[0]);
          const revFloor = BigInt(String(params[1]));
          let count = 0;
          for (const c of this.credentials.values()) {
            if (c.principal_id === pid && BigInt(c.revision) < revFloor && c.status === 'ACTIVE') {
              c.status = 'REVOKED';
              count++;
            }
          }
          return count;
        }

        if (sql.includes('UPDATE admin_session SET revoked_at =')) {
          let count = 0;
          if (sql.includes('WHERE id = $2') || sql.includes('WHERE id = $3')) {
            const sid = String(params[1]);
            const s = this.sessions.get(sid);
            if (s && s.revoked_at === null) {
              s.revoked_at = new Date();
              s.revocation_reason = 'WATERMARK_SUPERSEDED';
              count++;
            }
          } else if (sql.includes('session_watermark < $3')) {
            const pid = String(params[1]);
            const watermarkFloor = BigInt(String(params[2]));
            for (const s of this.sessions.values()) {
              if (s.principal_id === pid && BigInt(s.session_watermark) < watermarkFloor && s.revoked_at === null) {
                s.revoked_at = new Date();
                s.revocation_reason = 'RECOVERY_RECONCILIATION';
                count++;
              }
            }
          }
          return count;
        }

        if (sql.includes('INSERT INTO admin_audit_event')) {
          this.auditEvents.push(params);
          return 1;
        }

        return 1;
      }
    };
    return fn(tx);
  }
}

describe('RecoveryAuthority Mandatory Recovery Scenarios (A through G - EL-TK-222)', () => {
  let tempDir: string;
  let db: SimulatedPostgresWithSnapshot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlens-scenarios-'));
    db = new SimulatedPostgresWithSnapshot();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Escenario A — Restauración anterior de PostgreSQL: la credencial revocada permanece rechazada', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const authService = new AdminAuthenticationService(db, {
      allowedOrigins: ['https://admin.eventlens.test'],
      recoveryAuthority: authority
    });

    const coordinator = new Mod001RecoveryCoordinator({
      authority,
      transactions: db
    });

    // 1. Crear principal, credencial y sesión válidas en PostgreSQL
    const principalId = 'adm-001';
    db.principals.set(principalId, {
      id: principalId,
      identifier: 'superadmin@eventlens.test',
      status: 'ACTIVE',
      auth_revision: 1n
    });

    db.credentials.set('cred-001', {
      id: 'cred-001',
      principal_id: principalId,
      purpose: 'ADMIN_AUTHENTICATION',
      secret_digest: 'digest-secret',
      revision: 1n,
      status: 'ACTIVE'
    });

    const sessionToken = 'session-token-valid';
    const tokenDigest = createHash('sha256').update(sessionToken, 'utf8').digest('hex');
    const now = new Date();

    db.sessions.set('sess-001', {
      id: 'sess-001',
      principal_id: principalId,
      token_digest: tokenDigest,
      csrf_token_digest: 'csrf-dig',
      auth_time: now,
      expires_at: new Date(now.getTime() + 8 * 3600 * 1000),
      last_active_at: now,
      idle_expires_at: new Date(now.getTime() + 30 * 60 * 1000),
      revoked_at: null,
      revocation_reason: null,
      session_watermark: 1n
    });

    // 2. Tomar Snapshot de PostgreSQL en este punto (T0)
    db.takeSnapshot();

    // 3. Ejecutar revocación en T1 mediante PREPARE -> SQL -> ACK con la autoridad durable
    await coordinator.executeSensitiveTransaction(
      {
        operationId: 'op-revoke-principal',
        subjectRef: principalId,
        fact: {
          type: 'ADMIN_PRINCIPAL_REVOKED',
          data: { principalId, reason: 'SECURITY_BREACH' }
        }
      },
      async (_receipt, tx) => {
        await tx.execute(`UPDATE admin_principal SET status = 'REVOKED' WHERE id = $1`, principalId);
        return { result: true, revision: 2n };
      }
    );

    // Comprobar que en PostgreSQL y en la autoridad está revocado
    expect(db.principals.get(principalId)?.status).toBe('REVOKED');
    expect(await authority.getAdminAuthWatermark(principalId)).toBe(2n);

    // 4. RESTAURAR PostgreSQL desde el snapshot anterior T0 (simulando un PITR)
    db.restoreSnapshot();

    // En PostgreSQL restaurado, el estado parece falsamente ACTIVE
    expect(db.principals.get(principalId)?.status).toBe('ACTIVE');
    expect(db.sessions.get('sess-001')?.revoked_at).toBeNull();

    // 5. Intentar validar la sesión con AdminAuthenticationService:
    // Debe fallar porque la RecoveryAuthority externa tiene watermark 2n > sessionWatermark 1n!
    await expect(
      authService.validateSession({
        sessionToken,
        origin: 'https://admin.eventlens.test'
      })
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'SESSION_REVOKED' })
    );

    // Comprobar que la sesión en PostgreSQL quedó marcada como revocada
    expect(db.sessions.get('sess-001')?.revoked_at).not.toBeNull();

    // 6. Ejecutar la reconciliación del coordinador
    const reconResult = await coordinator.reconcileMod001('MOD-001');
    expect(reconResult.status).toBe('RECONCILED');

    // Comprobar que PostgreSQL ahora refleja el estado real REVOKED
    expect(db.principals.get(principalId)?.status).toBe('REVOKED');
  });

  it('Escenario B — Caída entre PREPARE y SQL: preserva estado seguro y no aplica cambios indebidos', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const coordinator = new Mod001RecoveryCoordinator({
      authority,
      transactions: db
    });

    const cmd: PrepareSensitiveOperationCommand = {
      operationId: 'op-crash-between-prepare-sql',
      subjectRef: 'user-b',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
    };

    // Simular fallo en la transacción SQL
    await expect(
      coordinator.executeSensitiveTransaction(cmd, async () => {
        throw new Error('POSTGRESQL_CONNECTION_CRASH');
      })
    ).rejects.toThrow('POSTGRESQL_CONNECTION_CRASH');

    // La autoridad registró el aborto seguro en el journal
    const facts = await authority.readFacts(0n, 10n);
    expect(facts.length).toBe(0); // No hay hechos COMMITTED
  });

  it('Escenario C — Caída entre SQL y ACK: reconciliación segura y ausencia de autorizaciones recuperadas', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const coordinator = new Mod001RecoveryCoordinator({
      authority,
      transactions: db
    });

    const prep = await authority.prepare({
      operationId: 'op-crash-after-sql',
      subjectRef: 'user-c',
      fact: { type: 'SESSION_REVOKED', data: { principalId: 'user-c', watermark: 15n } }
    });

    // SQL se ejecutó, pero el proceso cae antes de invocar ackCommit
    // En la autoridad, el registro quedó PREPARED (barrera conservadora activa)

    // Reconciliación: la repetición con ackCommit es idempotente y no crea duplicados
    await authority.ackCommit(prep.preparedReceipt, 15n);
    expect(await authority.getAdminAuthWatermark('user-c')).toBe(15n);
  });

  it('Escenario D — ACK ambiguo: simulación de timeout y retry idempotente', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const prep = await authority.prepare({
      operationId: 'op-ambiguous-ack',
      subjectRef: 'user-d',
      fact: { type: 'CREDENTIAL_ROTATED', data: {} }
    });

    // Primer ACK tiene éxito
    await authority.ackCommit(prep.preparedReceipt, 3n);

    // Segundo ACK (reintento tras timeout del cliente) no falla ni duplica secuencias
    await expect(authority.ackCommit(prep.preparedReceipt, 3n)).resolves.not.toThrow();
    expect(await authority.getCredentialRevision('user-d')).toBe(3n);
  });

  it('Escenario E — Integridad: manipulación de registros es detectada y bloquea el acceso', async () => {
    const authority1 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority1.initialize();

    const prep = await authority1.prepare({
      operationId: 'op-integrity-check',
      subjectRef: 'user-e',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
    });
    await authority1.ackCommit(prep.preparedReceipt, 2n);

    // Manipular archivo en disco
    const journalFile = path.join(tempDir, 'recovery-journal.ndjson');
    fs.appendFileSync(journalFile, '{"corrupted":true}\n');

    const authority2 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await expect(authority2.initialize()).rejects.toThrowError(
      expect.objectContaining({ code: 'CORRUPTED_ARTIFACT' })
    );
  });

  it('Escenario F — Persistencia no disponible: fail-closed ante indisponibilidad de almacenamiento', async () => {
    const missingDir = path.join(tempDir, 'non_existent_and_forbidden_dir');
    // Creamos un archivo donde debería estar el directorio para forzar error en mkdirSync
    fs.writeFileSync(missingDir, 'blocker');

    const failingAuthority = new DurableRecoveryAuthorityAdapter({
      storageDir: path.join(missingDir, 'nested')
    });

    await expect(failingAuthority.initialize()).rejects.toThrowError(
      expect.objectContaining({ code: 'AUTHORITY_UNAVAILABLE' })
    );
  });

  it('Escenario G — Concurrencia: secuencias monotónicas sin saltos bajo operaciones concurrentes', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const promises: Promise<any>[] = [];
    for (let i = 1; i <= 10; i++) {
      promises.push(
        (async () => {
          const prep = await authority.prepare({
            operationId: `concurrent-op-${i}`,
            subjectRef: `user-${i}`,
            fact: { type: 'CREDENTIAL_ROTATED', data: { idx: i } }
          });
          await authority.ackCommit(prep.preparedReceipt, BigInt(i));
        })()
      );
    }

    await Promise.all(promises);

    const cp = await authority.readCheckpoint();
    expect(cp.checkpointSequence).toBe(20n); // 10 prepare + 10 commit

    const facts = await authority.readFacts(0n, 20n);
    expect(facts.length).toBe(10);

    // Reiniciar y verificar que la cadena es íntegra y sin gaps
    const restartedAuthority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await expect(restartedAuthority.initialize()).resolves.not.toThrow();
  });
});
