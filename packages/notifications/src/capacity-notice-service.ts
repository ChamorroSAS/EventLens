import { randomUUID } from 'node:crypto';
import {
  NotificationError,
  type CapacityThresholdFact,
  type GenerateNoticeResult,
  type NotificationAuditSink
} from './contracts.js';
import type { NotificationIntentService } from './notification-intent.js';

/**
 * Service for generating storage and guest capacity threshold notices (EL-TK-160).
 * Consumes verified domain signals from Capacity Management (EL-EP-011 / EL-TK-138).
 * Strictly guarantees:
 *  - Single communication per threshold: 80% and 100% signals generate intents only once (Escenario 1 & Escenario 2).
 *  - Authorized action: 100% threshold links directly to authorized extension workflow (Escenario 2).
 *  - Strict idempotency: Replays or re-evaluations do not duplicate communications (Escenario 3).
 *  - Domain authority: Does not calculate quotas or inspect media; honors upstream signals as sole authority.
 *  - Auditability: Audits actions without exposing media or sensitive metadata.
 */
export class CapacityNoticeService {
  constructor(
    private readonly intentService: NotificationIntentService,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Generates a capacity warning (80%) or capacity exceeded (100%) notification intent (EL-TK-160).
   */
  public async generateCapacityThresholdNotice(
    fact: CapacityThresholdFact
  ): Promise<GenerateNoticeResult> {
    if (!fact.eventId || typeof fact.eventId !== 'string' || !fact.eventId.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'eventId is required for capacity threshold notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string' || !fact.organizerRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for capacity threshold notice');
    }
    if (fact.thresholdType !== 'USAGE_80' && fact.thresholdType !== 'USAGE_100') {
      throw new NotificationError(
        'INVALID_ARGUMENT',
        `thresholdType must be USAGE_80 or USAGE_100, received: ${String(fact.thresholdType)}`
      );
    }
    if (!fact.actorContext || typeof fact.actorContext !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'actorContext is required for capacity threshold notice');
    }

    const now = fact.occurredAt || new Date();
    const isFull = fact.thresholdType === 'USAGE_100';

    const notificationType = isFull ? 'CAPACITY_EXCEEDED_100' : 'CAPACITY_WARNING_80';
    const title = isFull ? 'Capacidad máxima alcanzada (100%)' : 'Capacidad al 80%';
    const storagePct = fact.currentStoragePercent ?? (isFull ? 100 : 80);
    const factDescription = isFull
      ? 'Se ha alcanzado el límite total de almacenamiento contratado para el evento.'
      : `El almacenamiento de tu evento ha alcanzado el ${storagePct}% de su capacidad disponible.`;
    const consequence = isFull
      ? 'Las nuevas cargas de recuerdos han sido pausadas hasta que se amplíe la cuota.'
      : 'Si se alcanza el 100%, las cargas de fotos y videos se pausarán automáticamente.';
    const actionLabel = isFull ? 'Ampliar capacidad' : 'Gestionar capacidad';
    const actionDestination = isFull
      ? `/events/${fact.eventId}/capacity/extension`
      : `/events/${fact.eventId}/capacity`;
    const severity = isFull ? 'CRITICAL' : 'WARNING';

    // Canonical dedupKey: use fact.dedupKey from EL-TK-138 if supplied, otherwise deterministic key
    const dedupKey = fact.dedupKey || `capacity-threshold:${fact.eventId}:${fact.thresholdType}`;

    const payload: Record<string, unknown> = {
      title,
      fact: factDescription,
      consequence,
      severity,
      actionLabel,
      actionDestination,
      actionUrl: actionDestination,
      thresholdType: fact.thresholdType,
      currentStoragePercent: storagePct,
      eventId: fact.eventId
    };

    if (fact.currentFilesPercent !== undefined) {
      payload.currentFilesPercent = fact.currentFilesPercent;
    }
    if (fact.consumedBytes !== undefined) {
      payload.consumedBytes = fact.consumedBytes.toString();
    }
    if (fact.limitBytes !== undefined) {
      payload.limitBytes = fact.limitBytes.toString();
    }
    if (fact.consumedFiles !== undefined) {
      payload.consumedFiles = fact.consumedFiles;
    }
    if (fact.limitFiles !== undefined) {
      payload.limitFiles = fact.limitFiles;
    }

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType,
      resourceRef: fact.eventId,
      payload,
      effectiveAt: now
    });

    if (this.auditSink) {
      await this.auditSink.record({
        id: randomUUID(),
        intentId: result.intent.id,
        dedupKey,
        action: `CAPACITY_NOTICE_${fact.thresholdType}`,
        recipientRef: fact.organizerRef,
        notificationType,
        result: result.outcome,
        details: `Capacity threshold ${fact.thresholdType} evaluated with outcome ${result.outcome} for event ${fact.eventId}`,
        timestamp: now
      });
    }

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent
    };
  }
}
