import { randomUUID } from 'node:crypto';
import {
  NotificationError,
  type CaseNotificationFact,
  type GenerateNoticeResult,
  type NotificationAuditSink
} from './contracts.js';
import type { NotificationIntentService } from './notification-intent.js';

/**
 * Service for generating moderation, case reports, and administrative intervention notices (EL-TK-163).
 * Integrates confirmed domain facts from Media Inspection (EL-EP-009) and Audit Contracts (EL-EP-014).
 * Strictly guarantees:
 *  - Priority alerts for critical cases: Authorized administrators receive immediate critical alerts without auto-hiding media (Escenario 1).
 *  - Minimal authorized copy for owners: When case resolution communicates with the organizer, copy is minimal and strictly non-exposing (Escenario 2).
 *  - Legal and security suppression: Suppresses notices when legally or security-mandated without leaking reasons to recipients (Escenario 3).
 *  - Zero leak of reporter identity or media preview: Reporter information and media files are never exposed in payloads or external logs (Reglas de negocio).
 *  - Deduplication: Idempotent processing prevents duplicate communications upon retries or replays.
 */
export class CaseNoticeService {
  constructor(
    private readonly intentService: NotificationIntentService,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Generates a notification intent for case alerts, resolutions, or interventions (EL-TK-163).
   */
  public async generateCaseNotification(fact: CaseNotificationFact): Promise<GenerateNoticeResult> {
    if (!fact.caseRef || typeof fact.caseRef !== 'string' || !fact.caseRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'caseRef is required for case notice');
    }
    if (!fact.eventRef || typeof fact.eventRef !== 'string' || !fact.eventRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required for case notice');
    }
    if (!fact.recipientRef || typeof fact.recipientRef !== 'string' || !fact.recipientRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'recipientRef is required for case notice');
    }
    if (fact.recipientRole !== 'ADMIN' && fact.recipientRole !== 'ORGANIZER') {
      throw new NotificationError(
        'INVALID_ARGUMENT',
        `recipientRole must be ADMIN or ORGANIZER, received: ${String(fact.recipientRole)}`
      );
    }
    if (!fact.actorContext || typeof fact.actorContext !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'actorContext is required for case notice');
    }

    const now = fact.occurredAt || new Date();

    // 1. Legal or security notice suppression (Escenario 3)
    if (fact.suppressNotice || fact.isRestrictedLegalOrSecurity) {
      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          dedupKey: `case-suppress:${fact.caseRef}:${fact.recipientRef}`,
          action: 'CASE_NOTICE_SUPPRESSED',
          recipientRef: fact.recipientRef,
          notificationType: 'CASE_SUPPRESSION',
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

    // 2. Determine notification semantics based on recipient role and case action
    let notificationType = 'CASE_NOTIFICATION';
    let title = 'Notificación sobre reporte';
    let factDescription = 'Se ha registrado una actualización respecto a un caso en tu evento.';
    let consequence = 'Revisa los detalles en el panel correspondiente.';
    let actionLabel = 'Ver detalles';
    let actionDestination = `/events/${fact.eventRef}/moderation`;
    let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO';

    if (fact.recipientRole === 'ADMIN') {
      // Escenario 1: Admin priority alerts
      if (fact.severity === 'CRITICAL') {
        notificationType = 'CASE_CRITICAL_ALERT';
        title = 'Alerta prioritaria de moderación';
        factDescription = 'Se ha registrado un reporte de severidad crítica que requiere atención prioritaria.';
        consequence = 'El caso debe ser evaluado por el equipo de administración.';
        actionLabel = 'Revisar caso';
        actionDestination = `/admin/cases/${fact.caseRef}`;
        severity = 'CRITICAL';
      } else {
        notificationType = 'CASE_ADMIN_ALERT';
        title = 'Aviso de moderación de contenido';
        factDescription = 'Se ha registrado un nuevo caso para revisión administrativa.';
        consequence = 'Evalúa el caso conforme a las directrices de la plataforma.';
        actionLabel = 'Revisar caso';
        actionDestination = `/admin/cases/${fact.caseRef}`;
        severity = 'WARNING';
      }
    } else {
      // Escenario 2: Organizer communications with minimal authorized copy
      if (fact.actionType === 'CASE_RESOLVED') {
        notificationType = 'CASE_RESOLUTION_NOTICE';
        title = 'Resolución de revisión en tu evento';
        factDescription = 'Se ha completado la revisión de un reporte sobre contenido en tu evento.';
        consequence = 'La moderación ha sido aplicada de conformidad con los términos y políticas.';
        actionLabel = 'Ver detalles de moderación';
        actionDestination = `/events/${fact.eventRef}/moderation`;
        severity = 'INFO';
      } else if (fact.actionType === 'ADMIN_INTERVENTION') {
        notificationType = 'ADMIN_INTERVENTION';
        title = 'Acción administrativa registrada';
        factDescription = 'El equipo administrativo aplicó una intervención operativa en tu evento.';
        consequence = 'Revisa las políticas del servicio y el estado actual de tu evento.';
        actionLabel = 'Ver panel del evento';
        actionDestination = `/events/${fact.eventRef}`;
        severity = 'WARNING';
      } else {
        notificationType = 'CASE_NOTIFICATION';
        title = 'Aviso sobre contenido reportado';
        factDescription = 'Se ha recibido un reporte sobre contenido en tu evento y está en revisión.';
        consequence = 'El equipo de moderación evaluará el caso conforme a las directrices.';
        actionLabel = 'Ver moderación';
        actionDestination = `/events/${fact.eventRef}/moderation`;
        severity = 'WARNING';
      }
    }

    // Dedup key: includes caseRef, actionType, recipientRole, and recipientRef
    const dedupKey =
      fact.dedupKey ||
      `case:${fact.caseRef}:${fact.actionType}:${fact.recipientRole}:${fact.recipientRef}`;

    // Sanitized payload: NEVER leaks reporter identity, emails, or multimedia content (Reglas de negocio)
    const payload: Record<string, unknown> = {
      title,
      fact: factDescription,
      consequence,
      severity,
      actionLabel,
      actionDestination,
      actionUrl: actionDestination,
      caseRef: fact.caseRef,
      eventRef: fact.eventRef,
      recipientRole: fact.recipientRole,
      severityCategory: fact.severity,
      actionType: fact.actionType
    };

    if (fact.summary) {
      // Truncate and sanitize custom summary to avoid unbounded or script payloads
      payload.summary = fact.summary.slice(0, 200).replace(/[\r\n\t]/g, ' ').trim();
    }

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.recipientRef,
      recipientEmail: fact.recipientEmail,
      notificationType,
      resourceRef: fact.eventRef,
      payload,
      effectiveAt: now
    });

    if (this.auditSink) {
      await this.auditSink.record({
        id: randomUUID(),
        intentId: result.intent.id,
        dedupKey,
        action: `CASE_NOTICE_${fact.actionType}`,
        recipientRef: fact.recipientRef,
        notificationType,
        result: result.outcome,
        details: `Case notification for case ${fact.caseRef} (role ${fact.recipientRole}) recorded with outcome ${result.outcome}`,
        timestamp: now
      });
    }

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }
}
