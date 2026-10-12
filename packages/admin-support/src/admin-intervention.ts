import {
  AdminSupportError,
  type AdminAccessPort,
  type AdminCapacityOverridePort,
  type AdminInterventionType,
  type AdminLifecyclePort,
  type AdminSupportAuditSink,
  type ExecuteInterventionCommand,
  type ExecuteInterventionResult
} from './contracts.js';

export class AdminInterventionOrchestrator {
  constructor(
    private readonly lifecyclePort: AdminLifecyclePort,
    private readonly accessPort?: AdminAccessPort,
    private readonly capacityPort?: AdminCapacityOverridePort,
    private readonly auditSink?: AdminSupportAuditSink
  ) {
    if (!lifecyclePort) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'AdminLifecyclePort is required');
    }
  }

  public async executeIntervention(
    command: ExecuteInterventionCommand
  ): Promise<ExecuteInterventionResult> {
    if (!command || typeof command !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, eventId, interventionType, reason, idempotencyKey, params } = command;

    // 1. Verificación de ActorContext administrativo (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative human actor required');
    }

    // 2. Validación de eventId
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid event identifier is required');
    }
    const cleanEventId = eventId.trim();

    // 3. Validación y sanitización de motivo operativo (DEC-019/020)
    if (!reason || typeof reason !== 'string') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Operational reason is mandatory');
    }
    const cleanReason = reason.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
    if (cleanReason.length < 5) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        'Operational reason must be at least 5 characters long'
      );
    }
    if (cleanReason.length > 500) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        'Operational reason exceeds maximum length of 500 characters'
      );
    }

    // 4. Delegación al puerto propietario correspondiente sin bypass de políticas
    let downstreamResult: Record<string, unknown>;
    let outcome: 'EXECUTED' | 'IDEMPOTENT_REPLAY' = 'EXECUTED';

    switch (interventionType) {
      case 'SUSPEND_EVENT': {
        const res = await this.lifecyclePort.suspendEvent({
          actorContext,
          eventId: cleanEventId,
          reason: cleanReason,
          idempotencyKey
        });
        if (res.outcome === 'IDEMPOTENT_REPLAY') outcome = 'IDEMPOTENT_REPLAY';
        downstreamResult = res;
        break;
      }

      case 'REACTIVATE_EVENT': {
        const res = await this.lifecyclePort.reactivateEvent({
          actorContext,
          eventId: cleanEventId,
          reason: cleanReason,
          idempotencyKey
        });
        if (res.outcome === 'IDEMPOTENT_REPLAY') outcome = 'IDEMPOTENT_REPLAY';
        downstreamResult = res;
        break;
      }

      case 'EXTEND_EVENT_VALIDITY': {
        const extensionDays = Number(params?.extensionDays);
        if (!extensionDays || !Number.isInteger(extensionDays) || extensionDays < 1 || extensionDays > 90) {
          throw new AdminSupportError(
            'INVALID_ARGUMENT',
            'Extension days must be an integer between 1 and 90'
          );
        }
        const res = await this.lifecyclePort.extendEventValidity({
          actorContext,
          eventId: cleanEventId,
          extensionDays,
          reason: cleanReason,
          idempotencyKey
        });
        if (res.outcome === 'IDEMPOTENT_REPLAY') outcome = 'IDEMPOTENT_REPLAY';
        downstreamResult = res;
        break;
      }

      case 'CLOSE_EVENT': {
        const res = await this.lifecyclePort.closeEvent({
          actorContext,
          eventId: cleanEventId,
          reason: cleanReason
        });
        downstreamResult = res;
        break;
      }

      case 'REVOKE_GUEST_ACCESS': {
        if (!this.accessPort) {
          throw new AdminSupportError('NOT_FOUND', 'Access port is not configured');
        }
        const res = await this.accessPort.revokeAllGuestSessions({
          actorContext,
          eventId: cleanEventId,
          reason: cleanReason
        });
        downstreamResult = res;
        break;
      }

      case 'APPLY_CAPACITY_OVERRIDE': {
        if (!this.capacityPort) {
          throw new AdminSupportError('NOT_FOUND', 'Capacity port is not configured');
        }
        const res = await this.capacityPort.applyCapacityOverride({
          actorContext,
          eventId: cleanEventId,
          storageBytes: params?.storageBytes,
          maxFiles: params?.maxFiles,
          retentionDays: params?.retentionDays,
          reason: cleanReason
        });
        downstreamResult = res;
        break;
      }

      default: {
        throw new AdminSupportError(
          'INVALID_ARGUMENT',
          `Unknown intervention type: ${String(interventionType)}`
        );
      }
    }

    const executedAt = new Date().toISOString();

    // 5. Auditoría de la intervención orquestada
    if (this.auditSink) {
      await this.auditSink.record({
        procedure: 'ADMIN_INTERVENTION_ORCHESTRATED',
        principalId: actorContext.principalId,
        timestamp: new Date(executedAt),
        details: JSON.stringify({
          interventionType,
          eventId: cleanEventId,
          reason: cleanReason,
          outcome,
          downstreamResult
        })
      });
    }

    return {
      outcome,
      interventionType,
      eventId: cleanEventId,
      executedAt,
      downstreamResult
    };
  }
}
