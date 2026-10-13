import { randomUUID } from 'node:crypto';
import {
  NotificationError,
  type ExportLifecycleFact,
  type GenerateNoticeResult,
  type NotificationAuditSink
} from './contracts.js';
import type { NotificationIntentService } from './notification-intent.js';

/**
 * Service for generating export availability, expiration and invalidation notices (EL-TK-161).
 * Consumes verified domain signals from Export Management (EL-EP-010 / EL-TK-127..131).
 * Strictly guarantees:
 *  - Fixed 48h availability awareness per DEC-048: captures real expiresAt in copy.
 *  - Single consolidated communication for multi-part exports: no per-part spam (Escenario 3).
 *  - Reauthorized destination: links to authorized library endpoint without assuming permissions (Escenario 2).
 *  - Immediate obsolescence: invalidation or expiration supersedes prior availability notices per DEC-090.
 *  - Strict privacy: never exposes presigned URLs or storage keys in payloads or audit logs.
 */
export class ExportNoticeService {
  constructor(
    private readonly intentService: NotificationIntentService,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Generates an export notification intent based on export lifecycle fact (EL-TK-161).
   */
  public async generateExportNotice(
    fact: ExportLifecycleFact
  ): Promise<GenerateNoticeResult> {
    if (!fact.eventId || typeof fact.eventId !== 'string' || !fact.eventId.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'eventId is required for export notice');
    }
    if (!fact.exportId || typeof fact.exportId !== 'string' || !fact.exportId.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'exportId is required for export notice');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string' || !fact.organizerRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required for export notice');
    }
    if (!['EXPORT_AVAILABLE', 'EXPORT_EXPIRED', 'EXPORT_INVALIDATED'].includes(fact.noticeType)) {
      throw new NotificationError(
        'INVALID_ARGUMENT',
        `noticeType must be EXPORT_AVAILABLE, EXPORT_EXPIRED or EXPORT_INVALIDATED, received: ${String(fact.noticeType)}`
      );
    }
    if (!fact.actorContext || typeof fact.actorContext !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'actorContext is required for export notice');
    }

    const gen = fact.generation !== undefined ? BigInt(fact.generation) : 1n;
    const now = fact.occurredAt || new Date();
    const partsCount = fact.partCount && fact.partCount > 0 ? fact.partCount : 1;

    let title: string;
    let factDescription: string;
    let consequence: string;
    let severity: 'NORMAL' | 'WARNING' | 'CRITICAL';
    let actionLabel: string;
    const actionDestination = `/events/${fact.eventId}/media`;
    let supersedesDedupKeys: string[] = [];

    const availableDedupKey = `export-available:${fact.exportId}:gen:${gen.toString()}`;
    const expiredDedupKey = `export-expired:${fact.exportId}:gen:${gen.toString()}`;
    const invalidatedDedupKey = `export-invalidated:${fact.exportId}:gen:${gen.toString()}`;

    let dedupKey: string;
    let intentExpiresAt: Date | undefined;

    switch (fact.noticeType) {
      case 'EXPORT_AVAILABLE': {
        if (!fact.expiresAt || !(fact.expiresAt instanceof Date) || isNaN(fact.expiresAt.getTime())) {
          throw new NotificationError(
            'INVALID_ARGUMENT',
            'expiresAt date is required for EXPORT_AVAILABLE notice'
          );
        }

        title = 'Exportación de recuerdos lista para descargar';
        const partsText = partsCount === 1 ? '1 parte descargable' : `${partsCount} partes descargables`;
        factDescription = `La exportación solicitada para tu evento está preparada (${partsText}).`;
        consequence = `Disponible durante 48 horas (hasta ${fact.expiresAt.toISOString()}). Tras este plazo caducará por seguridad.`;
        severity = 'NORMAL';
        actionLabel = 'Ver y descargar partes';
        dedupKey = fact.dedupKey || availableDedupKey;
        intentExpiresAt = fact.expiresAt;

        // If this is a retry/regenerated export (gen > 1), supersede prior expired/invalidated notices
        if (gen > 1n) {
          const prevGen = (gen - 1n).toString();
          supersedesDedupKeys = [
            `export-expired:${fact.exportId}:gen:${prevGen}`,
            `export-available:${fact.exportId}:gen:${prevGen}`,
            `export-invalidated:${fact.exportId}:gen:${prevGen}`
          ];
        }
        break;
      }

      case 'EXPORT_EXPIRED': {
        title = 'Exportación de recuerdos caducada';
        factDescription = 'La ventana de disponibilidad de 48 horas para descargar la exportación ha finalizado.';
        consequence = 'Los enlaces de descarga han caducado. Puedes regenerar una nueva exportación cuando lo desees.';
        severity = 'WARNING';
        actionLabel = 'Regenerar exportación';
        dedupKey = fact.dedupKey || expiredDedupKey;
        // Expiration notice supersedes active availability notice for this generation
        supersedesDedupKeys = [availableDedupKey];
        break;
      }

      case 'EXPORT_INVALIDATED': {
        title = 'Exportación no disponible por cambios de privacidad o permisos';
        const reasonText = fact.invalidationReason ? ` (${fact.invalidationReason})` : '';
        factDescription = `Se actualizaron permisos o se retiró contenido incluido en la exportación${reasonText}.`;
        consequence = 'Por motivos de privacidad y seguridad (DEC-090), la exportación anterior ha sido invalidada. Puedes solicitar una nueva exportación con el contenido vigente.';
        severity = 'WARNING';
        actionLabel = 'Ir a la biblioteca';
        dedupKey = fact.dedupKey || invalidatedDedupKey;
        // Invalidation immediately supersedes availability for this generation
        supersedesDedupKeys = [availableDedupKey];
        break;
      }
    }

    const payload: Record<string, unknown> = {
      title,
      fact: factDescription,
      consequence,
      severity,
      actionLabel,
      actionDestination,
      actionUrl: actionDestination,
      exportId: fact.exportId,
      eventId: fact.eventId,
      generation: gen.toString(),
      partCount: partsCount,
      noticeType: fact.noticeType
    };

    if (fact.totalSizeBytes !== undefined) {
      payload.totalSizeBytes = fact.totalSizeBytes.toString();
    }
    if (fact.expiresAt) {
      payload.expiresAt = fact.expiresAt.toISOString();
    }
    if (fact.invalidationReason) {
      payload.invalidationReason = fact.invalidationReason;
    }

    const result = await this.intentService.recordDomainFact({
      actorContext: fact.actorContext,
      dedupKey,
      recipientRef: fact.organizerRef,
      recipientEmail: fact.recipientEmail,
      notificationType: fact.noticeType,
      resourceRef: `export:${fact.exportId}`,
      payload,
      effectiveAt: now,
      expiresAt: intentExpiresAt,
      supersedesDedupKeys
    });

    if (this.auditSink) {
      await this.auditSink.record({
        id: randomUUID(),
        intentId: result.intent.id,
        dedupKey,
        action: 'EXPORT_NOTICE_GENERATED',
        recipientRef: fact.organizerRef,
        notificationType: fact.noticeType,
        result: result.outcome,
        details: JSON.stringify({
          exportId: fact.exportId,
          eventId: fact.eventId,
          generation: gen.toString(),
          partCount: partsCount,
          supersededCount: result.supersededCount || 0
        }),
        timestamp: now
      });
    }

    return {
      outcome: result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY',
      intent: result.intent,
      supersededCount: result.supersededCount
    };
  }
}
