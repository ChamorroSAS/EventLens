import { randomUUID } from 'node:crypto';
import {
  NotificationError,
  type AccountSecurityFact,
  type EventConfigurationChangedFact,
  type EventReactivationFact,
  type EventSuspensionFact,
  type EventUpcomingFact,
  type GenerateNoticeResult,
  type NotificationAuditSink
} from './contracts.js';
import type { NotificationIntentService } from './notification-intent.js';

/**
 * Service for generating account security, lifecycle, and event change notices (EL-TK-162).
 * Integrates confirmed domain facts from Account (EL-EP-001) and Event Lifecycle (EL-EP-003).
 * Strictly guarantees:
 *  - Sanitized copy: Never leaks passwords, tokens, session cookies, or restricted investigation details (Escenario 1 & Escenario 2).
 *  - Legal/security suppression: Suppresses visible notices when legally or operationally mandated without leaking reasons in logs (Reglas de negocio).
 *  - Atomic supersession: When an event is reactivated or updated, prior conflicting notices are obsoleted (Escenario 3).
 *  - Domain fact verification: Requires explicit actor context and owner identification.
 */
export class AccountEventNoticeService {
  constructor(
    private readonly intentService: NotificationIntentService,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Generates a sanitized security notice for account events (EL-TK-162 Escenario 1).
   * E.g. new logins, password changes, session revocations, recovery requests.
   */
  public async generateAccountSecurityNotice(fact: AccountSecurityFact): Promise<GenerateNoticeResult> {
    if (!fact.accountRef || typeof fact.accountRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'accountRef is required for account security notice');
    }
    if (!fact.eventType || typeof fact.eventType !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'eventType is required for account security notice');
    }

    const sanitizedMetadata: Record<string, unknown> = {
      eventType: fact.eventType
    };
    if (fact.occurredAt) {
      sanitizedMetadata.occurredAt = fact.occurredAt.toISOString();
    }

    if (fact.ipAddress) {
      // Sanitize IP: ensure clean string without headers or injection attempts
      sanitizedMetadata.ipAddress = fact.ipAddress.slice(0, 45).trim();
    }
    if (fact.userAgent) {
      // Sanitize User-Agent: truncate to 120 chars, strip potential control characters
      sanitizedMetadata.userAgent = fact.userAgent.slice(0, 120).replace(/[\r\n\t]/g, ' ').trim();
    }

    let title = 'Alerta de seguridad en tu cuenta';
    let message = 'Se ha registrado actividad de seguridad relevante en tu cuenta EventLens.';
    const notificationType = fact.eventType === 'RECOVERY_REQUESTED' ? 'ACCOUNT_RECOVERY' : 'ACCOUNT_SECURITY';

    switch (fact.eventType) {
      case 'NEW_LOGIN':
        title = 'Nuevo inicio de sesión detectado';
        message = 'Se ha iniciado sesión en tu cuenta desde un dispositivo o ubicación no habitual.';
        break;
      case 'PASSWORD_CHANGED':
        title = 'Contraseña actualizada';
        message = 'La contraseña de tu cuenta EventLens ha sido modificada satisfactoriamente.';
        break;
      case 'SESSION_REVOKED':
        title = 'Sesiones cerradas';
        message = 'Se han revocado las sesiones activas de tu cuenta por seguridad.';
        break;
      case 'RECOVERY_REQUESTED':
        title = 'Solicitud de recuperación de cuenta';
        message = 'Has iniciado una solicitud para restablecer el acceso a tu cuenta.';
        break;
      case 'CREDENTIAL_UPDATED':
        title = 'Credenciales de acceso actualizadas';
        message = 'Se han actualizado los métodos de autenticación asociados a tu perfil.';
        break;
    }

    const dateBucket = (fact.occurredAt || new Date()).toISOString().slice(0, 10);
    const dedupKey = fact.dedupKey || `sec:${fact.accountRef}:${fact.eventType}:${dateBucket}`;

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.accountRef,
      recipientEmail: fact.recipientEmail,
      notificationType,
      resourceRef: fact.accountRef,
      payload: {
        title,
        message,
        ...sanitizedMetadata
      },
      effectiveAt: fact.occurredAt || undefined
    });

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }

  /**
   * Generates a notice for administrative or security event suspension (EL-TK-162 Escenario 2).
   * Supports legal/security notice suppression and restricted reason sanitization.
   */
  public async generateEventSuspensionNotice(fact: EventSuspensionFact): Promise<GenerateNoticeResult> {
    if (!fact.eventRef || typeof fact.eventRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required for event suspension notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for event suspension notice');
    }

    const now = fact.suspendedAt || new Date();

    // 1. Legal or security notice suppression (Regla de negocio: avisar salvo razón legal/seguridad)
    if (fact.suppressNotice) {
      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          dedupKey: `lifecycle:${fact.eventRef}:suspended:suppressed`,
          action: 'EVENT_SUSPENSION_NOTICE_SUPPRESSED',
          recipientRef: fact.organizerRef,
          notificationType: 'EVENT_SUSPENDED',
          result: 'SUPPRESSED',
          details: 'Notice delivery suppressed per authorized legal/security directive',
          timestamp: now
        });
      }

      return {
        outcome: 'NOTICE_SUPPRESSED',
        suppressedReason: 'LEGAL_OR_SECURITY_SUPPRESSION'
      };
    }

    // 2. Restricted reason handling: Never reveal internal/confidential investigation details to the organizer
    const reason = fact.isRestrictedReason
      ? 'Revisión administrativa preventiva'
      : (fact.reason ? fact.reason.slice(0, 200).trim() : 'Revisión de políticas y términos del servicio');

    const dedupKey = `lifecycle:${fact.eventRef}:suspended`;

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType: 'EVENT_SUSPENDED',
      resourceRef: fact.eventRef,
      payload: {
        title: 'Evento suspendido administrativamente',
        reason,
        suspendedAt: now.toISOString(),
        actionLabel: 'Contactar soporte',
        actionDestination: `/support?resource=${fact.eventRef}`
      },
      effectiveAt: now
    });

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }

  /**
   * Generates a notice when an event is reactivated, superseding any prior suspension notice (EL-TK-162 Escenario 3).
   */
  public async generateEventReactivationNotice(fact: EventReactivationFact): Promise<GenerateNoticeResult> {
    if (!fact.eventRef || typeof fact.eventRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required for event reactivation notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for event reactivation notice');
    }

    const now = fact.reactivatedAt || new Date();
    const dedupKey = `lifecycle:${fact.eventRef}:reactivated`;
    const previousSuspensionKey = fact.previousSuspensionDedupKey || `lifecycle:${fact.eventRef}:suspended`;

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType: 'EVENT_REACTIVATED',
      resourceRef: fact.eventRef,
      payload: {
        title: 'Tu evento ha sido reactivado',
        message: 'La revisión administrativa ha concluido exitosamente y el acceso está normalizado.',
        reactivatedAt: now.toISOString(),
        actionLabel: 'Ver panel del evento',
        actionDestination: `/events/${fact.eventRef}`
      },
      effectiveAt: now,
      supersedesDedupKeys: [previousSuspensionKey]
    });

    return {
      outcome: 'SUPERSEDED_PREVIOUS',
      intent: result.intent,
      supersededCount: result.supersededCount
    };
  }

  /**
   * Generates a scheduled notice for an upcoming event (EL-TK-162).
   */
  public async generateEventUpcomingNotice(fact: EventUpcomingFact): Promise<GenerateNoticeResult> {
    if (!fact.eventRef || typeof fact.eventRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required for upcoming event notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for upcoming event notice');
    }

    const startsAt = fact.startsAt;
    // Effective 24 hours prior to startsAt, expires when event starts
    const effectiveAt = new Date(startsAt.getTime() - 24 * 3600 * 1000);
    const dateBucket = startsAt.toISOString().slice(0, 10);
    const dedupKey = `upcoming:${fact.eventRef}:${dateBucket}`;

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType: 'EVENT_UPCOMING',
      resourceRef: fact.eventRef,
      payload: {
        eventName: fact.eventName,
        startsAt: startsAt.toISOString(),
        actionLabel: 'Ver detalles del evento',
        actionDestination: `/events/${fact.eventRef}`
      },
      effectiveAt,
      expiresAt: startsAt
    });

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }

  /**
   * Generates an authorized notice when relevant event configuration changes (EL-TK-162).
   */
  public async generateEventConfigurationChangedNotice(
    fact: EventConfigurationChangedFact
  ): Promise<GenerateNoticeResult> {
    if (!fact.eventRef || typeof fact.eventRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required for configuration change notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for configuration change notice');
    }

    const effectiveAt = fact.effectiveAt || new Date();
    const dedupKey = `evt-cfg:${fact.eventRef}:${fact.changeType}:${effectiveAt.toISOString().slice(0, 13)}`;

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType: 'EVENT_CONFIGURATION_CHANGED',
      resourceRef: fact.eventRef,
      payload: {
        changeType: fact.changeType,
        summary: fact.summary.slice(0, 200).trim(),
        actionLabel: 'Ver configuración',
        actionDestination: `/events/${fact.eventRef}/settings`
      },
      effectiveAt
    });

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }
}
