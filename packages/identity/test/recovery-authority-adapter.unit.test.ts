import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DurableRecoveryAuthorityAdapter,
  RecoveryError,
  type PrepareSensitiveOperationCommand
} from '../src/index.js';

describe('DurableRecoveryAuthorityAdapter (Laboratory & Unit Tests - DEC-112)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlens-recovery-lab-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('never decreases organizer revisions when an older commit ACK arrives after a newer one', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({storageDir:tempDir}); await authority.initialize();
    const older = await authority.prepare({operationId:'older-operation',subjectRef:'managed-organizer',fact:{type:'CREDENTIAL_ROTATED',data:{cause:'DISABLE'}}});
    const newer = await authority.prepare({operationId:'newer-operation',subjectRef:'managed-organizer',fact:{type:'CREDENTIAL_ROTATED',data:{cause:'ENABLE'}}});
    await authority.ackCommit(newer.preparedReceipt,3n);
    await expect(authority.getCredentialRevision('managed-organizer')).rejects.toMatchObject({code:'AUTHORITY_UNAVAILABLE'});
    await authority.ackCommit(older.preparedReceipt,2n);
    expect(await authority.getCredentialRevision('managed-organizer')).toBe(3n);
    expect(await authority.getAdminAuthWatermark('managed-organizer')).toBe(3n);
    const restored = new DurableRecoveryAuthorityAdapter({storageDir:tempDir});await restored.initialize();
    expect(await restored.getCredentialRevision('managed-organizer')).toBe(3n);
    expect(await restored.getAdminAuthWatermark('managed-organizer')).toBe(3n);
  });

  it('1. Durabilidad: persiste registros y restaura estado exacto tras reinicio del proceso', async () => {
    // Instancia 1
    const authority1 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority1.initialize();

    const cmd: PrepareSensitiveOperationCommand = {
      operationId: 'op-durability-001',
      subjectRef: 'admin-principal-99',
      fact: {
        type: 'ADMIN_PRINCIPAL_REVOKED',
        data: { reason: 'TEST_REVOCATION' }
      }
    };

    const prep = await authority1.prepare(cmd);
    expect(prep.sequence).toBe(1n);

    await authority1.ackCommit(prep.preparedReceipt, 5n);

    expect(await authority1.getAdminAuthWatermark('admin-principal-99')).toBe(5n);

    // Reinicio del proceso: Instancia 2 apuntando al mismo directorio
    const authority2 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority2.initialize();

    // Comprobar que el estado de revocación sobrevive al reinicio
    expect(await authority2.getAdminAuthWatermark('admin-principal-99')).toBe(5n);
    expect(await authority2.getRecoveryEpoch()).toBe(1n);

    const checkpoint = await authority2.readCheckpoint();
    expect(checkpoint.checkpointSequence).toBe(2n); // 1 prepare + 1 commit

    const facts = await authority2.readFacts(0n, 2n);
    expect(facts.length).toBe(1);
    expect(facts[0].subjectRef).toBe('admin-principal-99');
    expect(facts[0].type).toBe('ADMIN_PRINCIPAL_REVOKED');
  });

  it('2. Recuperación desde journal y checkpoint consistentes', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    for (let i = 1; i <= 3; i++) {
      const p = await authority.prepare({
        operationId: `op-seq-${i}`,
        subjectRef: `user-${i}`,
        fact: { type: 'CREDENTIAL_ROTATED', data: { rot: i } }
      });
      await authority.ackCommit(p.preparedReceipt, BigInt(i * 10));
    }

    const cp = await authority.readCheckpoint();
    expect(cp.checkpointSequence).toBe(6n); // 3 pairs of PREPARE + COMMIT
    expect(await authority.getCredentialRevision('user-2')).toBe(20n);
    expect(await authority.getCredentialRevision('user-3')).toBe(30n);
  });

  it('3. Integridad: detecta alteraciones en el journal y falla cerrado (CORRUPTED_ARTIFACT)', async () => {
    const authority1 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority1.initialize();

    const prep = await authority1.prepare({
      operationId: 'op-tamper-01',
      subjectRef: 'admin-target',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: { legit: true } }
    });
    await authority1.ackCommit(prep.preparedReceipt, 2n);

    // Alterar maliciosamente el archivo journal en disco
    const journalPath = path.join(tempDir, 'recovery-journal.ndjson');
    let content = fs.readFileSync(journalPath, 'utf8');
    // Reemplazar parte del payload
    content = content.replace('admin-target', 'hacked-target');
    fs.writeFileSync(journalPath, content, 'utf8');

    // Nueva instancia debe rechazar el journal adulterado
    const authority2 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await expect(authority2.initialize()).rejects.toThrowError(
      expect.objectContaining({ code: 'CORRUPTED_ARTIFACT' })
    );

    // Y todas las operaciones fallan cerradas
    await expect(authority2.getRecoveryEpoch()).rejects.toThrowError(RecoveryError);
  });

  it('4. Detección de gaps: detecta secuencias omitidas o registros borrados (GAP_DETECTED)', async () => {
    const authority1 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority1.initialize();

    await authority1.prepare({
      operationId: 'op-gap-1',
      subjectRef: 'admin-1',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
    });

    await authority1.prepare({
      operationId: 'op-gap-2',
      subjectRef: 'admin-2',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
    });

    // Eliminar la primera línea para crear un salto de secuencia (iniciando en 2)
    const journalPath = path.join(tempDir, 'recovery-journal.ndjson');
    const lines = fs.readFileSync(journalPath, 'utf8').split('\n').filter(Boolean);
    fs.writeFileSync(journalPath, lines[1] + '\n', 'utf8');

    const authority2 = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await expect(authority2.initialize()).rejects.toThrowError(
      expect.objectContaining({ code: 'GAP_DETECTED' })
    );
  });

  it('5. Resistencia a replay e idempotencia: rechaza parámetros conflictivos para el mismo operationId', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    const cmd: PrepareSensitiveOperationCommand = {
      operationId: 'op-idem-001',
      subjectRef: 'principal-x',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: { attempt: 1 } }
    };

    const prep1 = await authority.prepare(cmd);

    // Mismo comando -> respuesta idempotente
    const prep2 = await authority.prepare(cmd);
    expect(prep2.preparedReceipt).toBe(prep1.preparedReceipt);
    expect(prep2.sequence).toBe(prep1.sequence);

    // Mismo operationId pero distinto subjectRef -> rechazo de conflicto
    await expect(
      authority.prepare({
        ...cmd,
        subjectRef: 'other-principal'
      })
    ).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
  });

  it('6. Barreras de recuperación: setRecoveryBarrier bloquea mutaciones sensibles en MOD-001', async () => {
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: tempDir });
    await authority.initialize();

    await authority.setRecoveryBarrier(1n, 'MOD-001');
    expect(await authority.isRecoveryBarrierActive(1n, 'MOD-001')).toBe(true);

    await expect(
      authority.prepare({
        operationId: 'op-blocked-barrier',
        subjectRef: 'user-barr',
        fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
      })
    ).rejects.toThrowError(expect.objectContaining({ code: 'BARRIER_ACTIVE' }));

    // Reconciliación exitosa levanta la barrera
    await authority.ackReconciled('MOD-001', 1n, 0n, 'digest-ok');
    expect(await authority.isRecoveryBarrierActive(1n, 'MOD-001')).toBe(false);

    // Ahora sí permite mutaciones
    const prep = await authority.prepare({
      operationId: 'op-unblocked',
      subjectRef: 'user-barr',
      fact: { type: 'ADMIN_PRINCIPAL_REVOKED', data: {} }
    });
    expect(prep).toBeTruthy();
  });

  it('8. Comportamiento ante indisponibilidad de persistencia (fail-closed)', async () => {
    // Apuntar a una ruta inválida o sin permisos
    const invalidPath = path.join(tempDir, 'subfolder-file-conflict');
    fs.writeFileSync(invalidPath, 'blocking-file'); // un archivo donde se espera un directorio

    const brokenPath = path.join(invalidPath, 'sub');
    const authority = new DurableRecoveryAuthorityAdapter({ storageDir: brokenPath });

    await expect(authority.initialize()).rejects.toThrowError(
      expect.objectContaining({ code: 'AUTHORITY_UNAVAILABLE' })
    );

    // Cualquier llamada falla cerrada
    await expect(authority.getRecoveryEpoch()).rejects.toThrowError(
      expect.objectContaining({ code: 'AUTHORITY_UNAVAILABLE' })
    );
  });
});
