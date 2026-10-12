import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AdminActorContext } from '@eventlens/identity';
import {
  AdminInterventionOrchestrator,
  AdminSupportError,
  type AdminAccessPort,
  type AdminCapacityOverridePort,
  type AdminLifecyclePort,
  type AdminSupportAuditSink
} from '../src/index.js';

describe('AdminInterventionOrchestrator (Unit Tests — EL-TK-151)', () => {
  let lifecyclePort: AdminLifecyclePort;
  let accessPort: AdminAccessPort;
  let capacityPort: AdminCapacityOverridePort;
  let auditSink: AdminSupportAuditSink;
  let orchestrator: AdminInterventionOrchestrator;
  let adminContext: AdminActorContext;

  const eventId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    lifecyclePort = {
      suspendEvent: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'SUSPENDED',
        suspendedAt: new Date().toISOString()
      })),
      reactivateEvent: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        previousStatus: 'SUSPENDED',
        newStatus: 'ACTIVE',
        reactivatedAt: new Date().toISOString()
      })),
      extendEventValidity: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'ACTIVE',
        newExpiresAt: new Date(Date.now() + 86400000 * params.extensionDays).toISOString(),
        extendedAt: new Date().toISOString()
      })),
      closeEvent: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        previousStatus: 'ACTIVE',
        newStatus: 'CLOSED',
        closedAt: new Date().toISOString()
      }))
    };

    accessPort = {
      revokeAllGuestSessions: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        eventId: params.eventId,
        revokedSessionsCount: 42,
        revokedAt: new Date().toISOString()
      }))
    };

    capacityPort = {
      applyCapacityOverride: vi.fn(async (params) => ({
        outcome: 'EXECUTED',
        eventId: params.eventId,
        overrideId: randomUUID(),
        appliedAt: new Date().toISOString()
      }))
    };

    auditSink = {
      record: vi.fn(async () => {})
    };

    orchestrator = new AdminInterventionOrchestrator(
      lifecyclePort,
      accessPort,
      capacityPort,
      auditSink
    );

    adminContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin_usr_007',
      identifier: 'admin@eventlens.test',
      sessionId: 'session_007',
      authTime: new Date(),
      credentialRevision: 1n,
      adminAuthRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
  });

  it('delega SUSPEND_EVENT al puerto de lifecycle con motivo y registra auditoria (Escenario 1)', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'SUSPEND_EVENT',
      reason: 'Denuncia por contenido ilegal en revision por soporte legal'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(result.interventionType).toBe('SUSPEND_EVENT');
    expect(result.eventId).toBe(eventId);
    expect(lifecyclePort.suspendEvent).toHaveBeenCalledWith({
      actorContext: adminContext,
      eventId,
      reason: 'Denuncia por contenido ilegal en revision por soporte legal',
      idempotencyKey: undefined
    });

    expect(auditSink.record).toHaveBeenCalledTimes(1);
    const auditCall = vi.mocked(auditSink.record).mock.calls[0]![0];
    expect(auditCall.procedure).toBe('ADMIN_INTERVENTION_ORCHESTRATED');
    expect(auditCall.principalId).toBe('admin_usr_007');
    const details = JSON.parse(auditCall.details);
    expect(details.interventionType).toBe('SUSPEND_EVENT');
    expect(details.eventId).toBe(eventId);
  });

  it('delega REACTIVATE_EVENT al puerto de lifecycle', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'REACTIVATE_EVENT',
      reason: 'Subsanacion de reclamo confirmada por soporte legal'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(lifecyclePort.reactivateEvent).toHaveBeenCalledTimes(1);
  });

  it('delega EXTEND_EVENT_VALIDITY validando el parametro extensionDays', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'EXTEND_EVENT_VALIDITY',
      reason: 'Extension autorizada por cortesía de atencion a cliente',
      params: { extensionDays: 7 }
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(lifecyclePort.extendEventValidity).toHaveBeenCalledWith(
      expect.objectContaining({ extensionDays: 7 })
    );

    // Falla si extensionDays es invalido
    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'EXTEND_EVENT_VALIDITY',
        reason: 'Extension con dias invalidos',
        params: { extensionDays: 0 }
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });
  });

  it('delega CLOSE_EVENT al puerto de lifecycle', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'CLOSE_EVENT',
      reason: 'Cierre anticipado solicitado por el organizador verificado'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(lifecyclePort.closeEvent).toHaveBeenCalledTimes(1);
  });

  it('delega REVOKE_GUEST_ACCESS al puerto de acceso', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'REVOKE_GUEST_ACCESS',
      reason: 'Compromiso de enlace QR compartido en redes sociales publicas'
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(accessPort.revokeAllGuestSessions).toHaveBeenCalledTimes(1);
    expect(result.downstreamResult.revokedSessionsCount).toBe(42);
  });

  it('delega APPLY_CAPACITY_OVERRIDE al puerto de capacidad', async () => {
    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'APPLY_CAPACITY_OVERRIDE',
      reason: 'Ampliacion de almacenamiento para evento VIP',
      params: { storageBytes: '5368709120', maxFiles: 500 }
    });

    expect(result.outcome).toBe('EXECUTED');
    expect(capacityPort.applyCapacityOverride).toHaveBeenCalledTimes(1);
  });

  it('deniega si el actor no es ADMIN_HUMAN', async () => {
    const invalidActor = { ...adminContext, actorType: 'ORGANIZER' as any };

    await expect(
      orchestrator.executeIntervention({
        actorContext: invalidActor,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Motivo valido'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'UNAUTHORIZED'
    });
  });

  it('deniega si el motivo es menor a 5 caracteres o excede 500', async () => {
    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'abc'
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });

    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'x'.repeat(501)
      })
    ).rejects.toMatchObject({
      name: 'AdminSupportError',
      code: 'INVALID_ARGUMENT'
    });
  });

  it('no fuerza cambios ni realiza bypass si el dominio downstream deniega la accion (Escenario 2)', async () => {
    vi.mocked(lifecyclePort.suspendEvent).mockRejectedValueOnce(
      new Error('EVENT_ALREADY_SUSPENDED: Event is already in suspended state')
    );

    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'SUSPEND_EVENT',
        reason: 'Intento de suspension redundante'
      })
    ).rejects.toThrow('EVENT_ALREADY_SUSPENDED');

    // La auditoria del orquestador no se emite si downstream rechaza
    expect(auditSink.record).not.toHaveBeenCalled();
  });

  it('propaga conflicto si downstream detecta concurrencia (Escenario 3)', async () => {
    vi.mocked(lifecyclePort.reactivateEvent).mockRejectedValueOnce(
      new Error('CONCURRENCY_CONFLICT: Event state has changed concurrently')
    );

    await expect(
      orchestrator.executeIntervention({
        actorContext: adminContext,
        eventId,
        interventionType: 'REACTIVATE_EVENT',
        reason: 'Reactivacion bajo carrera concurrente'
      })
    ).rejects.toThrow('CONCURRENCY_CONFLICT');
  });

  it('maneja y propaga IDEMPOTENT_REPLAY cuando downstream confirma resultado idempotente', async () => {
    vi.mocked(lifecyclePort.suspendEvent).mockResolvedValueOnce({
      outcome: 'IDEMPOTENT_REPLAY',
      previousStatus: 'SUSPENDED',
      newStatus: 'SUSPENDED',
      suspendedAt: '2026-10-11T12:00:00Z'
    });

    const result = await orchestrator.executeIntervention({
      actorContext: adminContext,
      eventId,
      interventionType: 'SUSPEND_EVENT',
      reason: 'Replay de comando de suspension previo',
      idempotencyKey: 'idem-key-999'
    });

    expect(result.outcome).toBe('IDEMPOTENT_REPLAY');
  });
});
