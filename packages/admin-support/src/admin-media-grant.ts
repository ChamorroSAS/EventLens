import { randomUUID } from 'node:crypto';
import {
  AdminSupportError,
  type AdministrativeSupportMediaGrant,
  type AdminMediaPurpose,
  type AdminSupportAuditSink,
  type MediaGrantSigner,
  type RequestMediaGrantCommand,
  type TransactionRunner
} from './contracts.js';

interface RawMediaCatalogRow {
  media_ref: string;
  event_ref: string;
  status: string;
  original: unknown;
}

interface RawDerivativeRow {
  role: string;
  reference: unknown;
}

export class AdminMediaGrantService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly signer: MediaGrantSigner,
    private readonly auditSink?: AdminSupportAuditSink
  ) {
    if (!runner) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
    if (!signer) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'MediaGrantSigner is required');
    }
  }

  public async requestGrant(
    command: RequestMediaGrantCommand
  ): Promise<AdministrativeSupportMediaGrant> {
    if (!command || typeof command !== 'object') {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Command is required');
    }

    const { actorContext, eventId, mediaId, purpose, reason, preferredTarget, ttlSeconds } = command;

    // 1. Verificación de ActorContext administrativo (EL-TK-044)
    if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN' || !actorContext.principalId) {
      throw new AdminSupportError('UNAUTHORIZED', 'Authorized administrative human actor required');
    }

    // 2. Validación de eventId y mediaId
    if (!eventId || typeof eventId !== 'string' || !eventId.trim()) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid event identifier is required');
    }
    if (!mediaId || typeof mediaId !== 'string' || !mediaId.trim()) {
      throw new AdminSupportError('INVALID_ARGUMENT', 'Valid media identifier is required');
    }

    const cleanEventId = eventId.trim();
    const cleanMediaId = mediaId.trim();

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

    // 4. Validación de propósito de acceso
    const validPurposes: readonly AdminMediaPurpose[] = [
      'INCIDENT_INVESTIGATION',
      'SUPPORT_REQUEST',
      'CORRUPTION_DIAGNOSIS',
      'LEGAL_OR_SAFETY'
    ];
    if (!purpose || !validPurposes.includes(purpose)) {
      throw new AdminSupportError(
        'INVALID_ARGUMENT',
        `Invalid access purpose. Must be one of: ${validPurposes.join(', ')}`
      );
    }

    // 5. TTL acotado (mínimo 60s, por defecto 900s / 15m, máximo 3600s / 1h)
    const effectiveTtl = Math.min(Math.max(Number(ttlSeconds) || 900, 60), 3600);
    const targetKind: 'PREVIEW' | 'DETAIL' = preferredTarget === 'DETAIL' ? 'DETAIL' : 'PREVIEW';

    // 6. Ejecución transaccional: validación en base de datos y registro de grant
    const grant = await this.runner.run(async (tx) => {
      // a. Consultar media_catalog
      const mediaRows = await tx.query<RawMediaCatalogRow>(
        `SELECT media_ref, event_ref, status, original 
         FROM media_catalog 
         WHERE media_ref = $1 OR media_ref = $2`,
        cleanMediaId,
        cleanMediaId.startsWith('media:') ? cleanMediaId.slice(6) : `media:${cleanMediaId}`
      );

      if (!mediaRows.length) {
        throw new AdminSupportError('MEDIA_NOT_FOUND', `Media '${cleanMediaId}' not found`);
      }

      const media = mediaRows[0]!;

      // b. Validar correspondencia con evento (Cross-event isolation guard)
      const eventRefs = [
        cleanEventId,
        cleanEventId.startsWith('event:') ? cleanEventId.slice(6) : `event:${cleanEventId}`
      ];
      if (!eventRefs.includes(media.event_ref)) {
        throw new AdminSupportError(
          'CROSS_EVENT_MISMATCH',
          `Media does not belong to specified event '${cleanEventId}'`
        );
      }

      // c. Validar disponibilidad de estado
      if (['DELETED', 'PURGED'].includes(media.status)) {
        throw new AdminSupportError(
          'MEDIA_UNAVAILABLE',
          `Media is currently in status '${media.status}' and cannot be inspected`
        );
      }

      if (media.status === 'QUARANTINED') {
        // En cuarentena, sólo se autoriza para incidentes o requerimiento legal
        if (purpose !== 'INCIDENT_INVESTIGATION' && purpose !== 'LEGAL_OR_SAFETY') {
          throw new AdminSupportError(
            'MEDIA_UNAVAILABLE',
            'Quarantined media requires INCIDENT_INVESTIGATION or LEGAL_OR_SAFETY purpose'
          );
        }
      }

      // d. Buscar derivado activo en media_active_derivative
      const derivativeRows = await tx.query<RawDerivativeRow>(
        `SELECT role, reference 
         FROM media_active_derivative 
         WHERE media_ref = $1`,
        media.media_ref
      );

      let storageKey: string | null = null;

      if (derivativeRows.length > 0) {
        let chosen: RawDerivativeRow | undefined;
        if (targetKind === 'DETAIL') {
          chosen =
            derivativeRows.find((d) => d.role === 'PLAYBACK') ||
            derivativeRows.find((d) => d.role === 'PREVIEW') ||
            derivativeRows[0];
        } else {
          chosen =
            derivativeRows.find((d) => d.role === 'PREVIEW') ||
            derivativeRows.find((d) => d.role === 'THUMBNAIL') ||
            derivativeRows.find((d) => d.role === 'PLAYBACK') ||
            derivativeRows[0];
        }

        if (chosen?.reference && typeof chosen.reference === 'object') {
          const ref = chosen.reference as { key?: string };
          if (ref.key && typeof ref.key === 'string') {
            storageKey = ref.key;
          }
        }
      }

      // Fallback para diagnóstico de corrupción: si no hay derivados activos, usar original si está disponible
      if (!storageKey && purpose === 'CORRUPTION_DIAGNOSIS' && media.original) {
        const orig = typeof media.original === 'string'
          ? JSON.parse(media.original)
          : media.original;
        if (orig && typeof orig === 'object' && typeof (orig as { key?: string }).key === 'string') {
          storageKey = (orig as { key: string }).key;
        }
      }

      if (!storageKey) {
        throw new AdminSupportError(
          'MEDIA_UNAVAILABLE',
          'No accessible visual derivative available for this media item'
        );
      }

      // e. Emitir URL firmada mediante MediaGrantSigner
      const downloadUrl = await this.signer.signDownloadUrl(storageKey, effectiveTtl);

      // f. Registrar recibo de grant en tabla durable
      const grantId = randomUUID();
      const grantedAtDate = new Date();
      const expiresAtDate = new Date(grantedAtDate.getTime() + effectiveTtl * 1000);

      await tx.execute(
        `INSERT INTO admin_media_grant (
          id, event_id, media_id, principal_id, purpose, reason, target_kind, storage_key, granted_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        grantId,
        media.event_ref,
        media.media_ref,
        actorContext.principalId,
        purpose,
        cleanReason,
        targetKind,
        storageKey,
        grantedAtDate,
        expiresAtDate
      );

      const resultGrant: AdministrativeSupportMediaGrant = {
        grantId,
        eventId: media.event_ref,
        mediaId: media.media_ref,
        purpose,
        targetKind,
        storageKey,
        downloadUrl,
        grantedAt: grantedAtDate.toISOString(),
        expiresAt: expiresAtDate.toISOString(),
        grantedTo: actorContext.principalId
      };

      return resultGrant;
    });

    // 7. Registro de auditoría sanitizado (NUNCA incluir la downloadUrl ni firmas)
    if (this.auditSink) {
      await this.auditSink.record({
        procedure: 'ADMIN_MEDIA_ACCESS_GRANTED',
        principalId: actorContext.principalId,
        timestamp: new Date(grant.grantedAt),
        details: JSON.stringify({
          grantId: grant.grantId,
          eventId: grant.eventId,
          mediaId: grant.mediaId,
          purpose: grant.purpose,
          reason: cleanReason,
          targetKind: grant.targetKind,
          expiresAt: grant.expiresAt
        })
      });
    }

    return grant;
  }
}
