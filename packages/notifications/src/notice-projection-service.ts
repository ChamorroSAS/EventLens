import { randomUUID } from 'node:crypto';
import type { TransactionRunner } from '@eventlens/database';
import {
  NotificationError,
  type InAppNotice,
  type InAppNoticeAction,
  type InAppNoticeProjection,
  type InAppNoticeSeverity,
  type NotificationAuditSink,
  type NotificationIntentRecord
} from './contracts.js';

interface NotificationIntentRow {
  id: string;
  dedup_key: string;
  recipient_ref: string;
  recipient_email?: string | null;
  notification_type: string;
  resource_ref: string;
  status: string;
  payload: any;
  effective_at: Date | string;
  expires_at?: Date | string | null;
  superseded_at?: Date | string | null;
  superseded_by?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProjectNoticesOptions {
  recipientRef: string;
  resourceRef?: string;
  asOf?: Date;
}

/**
 * Service for projecting contextual in-app notices for the organizer dashboard (EL-TK-158).
 * Reuses existing canonical UI components without introducing an intrusive or mandatory NotificationCenter.
 * Strictly guarantees:
 *  - Deduplication: only active, non-duplicate notices are returned (Escenario 1).
 *  - Clean empty state: returns an empty projection without requiring a heavy EmptyState banner (Escenario 2).
 *  - Obsolescence filtering: excludes superseded and expired notices from active risks (Escenario 3).
 *  - Navigation safety: destinations require reauthorization upon navigation; notices never grant permissions.
 */
export class NoticeProjectionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: NotificationAuditSink
  ) {}

  /**
   * Projects contextual notices for an authenticated organizer/recipient.
   */
  public async projectNoticesForOrganizer(options: ProjectNoticesOptions): Promise<InAppNoticeProjection> {
    const { recipientRef, resourceRef, asOf = new Date() } = options;

    if (!recipientRef || typeof recipientRef !== 'string' || recipientRef.trim().length === 0) {
      throw new NotificationError('INVALID_RECIPIENT', 'recipientRef is required for notice projection');
    }

    const rows = await this.runner.run(async (tx) => {
      let sql = `
        SELECT id, dedup_key, recipient_ref, recipient_email, notification_type,
               resource_ref, status, payload, effective_at, expires_at,
               superseded_at, superseded_by, created_at, updated_at
        FROM notification_intent
        WHERE recipient_ref = $1
          AND status NOT IN ('SUPERSEDED', 'CANCELLED')
          AND (expires_at IS NULL OR expires_at > $2)
          AND effective_at <= $2
      `;
      const params: unknown[] = [recipientRef, asOf];

      if (resourceRef) {
        sql += ` AND resource_ref = $3`;
        params.push(resourceRef);
      }

      sql += ` ORDER BY effective_at DESC, created_at DESC`;

      return tx.query<NotificationIntentRow>(sql, ...params);
    });

    // Deduplication logic (Escenario 1 & Escenario 3):
    // For identical notificationType + resourceRef, keep only the latest intent.
    const seenDedupeKeys = new Set<string>();
    const deduplicatedRows: NotificationIntentRow[] = [];

    for (const row of rows) {
      const dedupeKey = `${row.notification_type}:${row.resource_ref}`;
      if (seenDedupeKeys.has(dedupeKey)) {
        continue;
      }
      seenDedupeKeys.add(dedupeKey);
      deduplicatedRows.push(row);
    }

    const notices: InAppNotice[] = deduplicatedRows.map((row) => {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload ?? {});
      const intentRecord: NotificationIntentRecord = {
        id: row.id,
        dedupKey: row.dedup_key,
        recipientRef: row.recipient_ref,
        recipientEmail: row.recipient_email ?? null,
        notificationType: row.notification_type,
        resourceRef: row.resource_ref,
        status: row.status as any,
        payload,
        effectiveAt: new Date(row.effective_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : null,
        supersededAt: row.superseded_at ? new Date(row.superseded_at) : null,
        supersededBy: row.superseded_by ?? null,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      };

      return this.mapIntentToNotice(intentRecord);
    });

    return {
      recipientRef,
      resourceRef,
      notices,
      totalCount: notices.length,
      hasActiveNotices: notices.length > 0,
      projectedAt: asOf
    };
  }

  /**
   * Maps a NotificationIntentRecord into an InAppNotice projection with semantic fields:
   * title, fact, date, validUntil, consequence, action, and severity.
   */
  public mapIntentToNotice(intent: NotificationIntentRecord): InAppNotice {
    const payload = intent.payload || {};
    const resourceRef = intent.resourceRef;

    let title = 'Notificación contextual';
    let fact = 'Se ha registrado una actualización en tu cuenta o evento.';
    let consequence = 'Revisa los detalles en el panel correspondiente.';
    let severity: InAppNoticeSeverity = 'INFO';
    let action: InAppNoticeAction = {
      label: 'Ver detalles',
      destination: resourceRef ? `/events/${resourceRef}` : '/dashboard'
    };

    switch (intent.notificationType) {
      case 'CAPACITY_WARNING_80': {
        const usage = payload.current ?? payload.usage ?? 80;
        const limit = payload.limit ?? 100;
        title = 'Capacidad al 80%';
        fact = `El almacenamiento del evento ha alcanzado el 80% (${usage}/${limit}).`;
        consequence =
          'Si se alcanza el 100%, las cargas de fotos y videos se pausarán automáticamente.';
        severity = 'WARNING';
        action = {
          label: 'Gestionar capacidad',
          destination: `/events/${resourceRef}/capacity`
        };
        break;
      }

      case 'CAPACITY_EXCEEDED_100': {
        title = 'Capacidad máxima alcanzada (100%)';
        fact = 'Se ha alcanzado el límite total de almacenamiento contratado para el evento.';
        consequence =
          'Las nuevas cargas de recuerdos han sido pausadas hasta que se amplíe la cuota.';
        severity = 'CRITICAL';
        action = {
          label: 'Ampliar capacidad',
          destination: `/events/${resourceRef}/capacity`
        };
        break;
      }

      case 'EVENT_SUSPENDED': {
        title = 'Evento suspendido administrativamente';
        fact = 'El evento se encuentra en estado de suspensión temporal.';
        consequence =
          'El acceso público y la subida de contenido están temporalmente inhabilitados.';
        severity = 'CRITICAL';
        action = {
          label: 'Contactar soporte',
          destination: `/support?resource=${resourceRef}`
        };
        break;
      }

      case 'EVENT_REACTIVATED': {
        title = 'Evento reactivado';
        fact = 'La revisión del evento ha concluido y el estado normal fue restablecido.';
        consequence =
          'Los participantes pueden volver a ingresar y compartir fotos sin restricciones.';
        severity = 'INFO';
        action = {
          label: 'Ver panel del evento',
          destination: `/events/${resourceRef}`
        };
        break;
      }

      case 'EVENT_UPCOMING': {
        const eventName = typeof payload.eventName === 'string' ? payload.eventName : 'tu evento';
        title = 'Evento próximo a iniciar';
        fact = `El evento "${eventName}" comenzará en las próximas horas.`;
        consequence =
          'Verifica los accesos, configuraciones activas y códigos QR antes de la llegada de invitados.';
        severity = 'INFO';
        action = {
          label: 'Ver panel del evento',
          destination: `/events/${resourceRef}`
        };
        break;
      }

      case 'EVENT_GRACE_PERIOD': {
        title = 'Periodo de gracia activo';
        fact = 'El evento ha finalizado y ha comenzado el periodo de gracia para descarga.';
        consequence =
          'Los recuerdos originales estarán disponibles para descarga hasta el fin del periodo de retención.';
        severity = 'WARNING';
        action = {
          label: 'Revisar retención',
          destination: `/events/${resourceRef}/retention`
        };
        break;
      }

      case 'EXPORT_AVAILABLE': {
        title = 'Descarga de recuerdos disponible';
        fact = 'El archivo comprimido con los recuerdos originales está listo.';
        consequence =
          'El enlace privado de descarga permanecerá activo durante 48 horas antes de expirar.';
        severity = 'INFO';
        action = {
          label: 'Descargar recuerdos',
          destination: `/events/${resourceRef}/exports`
        };
        break;
      }

      case 'EXPORT_EXPIRED': {
        title = 'Enlace de exportación caducado';
        fact = 'El enlace de descarga anterior ha expirado por motivos de seguridad.';
        consequence =
          'Debes solicitar una nueva exportación desde la biblioteca para descargar tus fotos y videos.';
        severity = 'WARNING';
        action = {
          label: 'Solicitar nueva exportación',
          destination: `/events/${resourceRef}/exports`
        };
        break;
      }

      case 'ACCOUNT_SECURITY': {
        title = 'Actividad de seguridad en tu cuenta';
        fact = 'Se ha registrado un evento relevante de seguridad en tu cuenta.';
        consequence =
          'Si no reconoces esta acción, cambia tu contraseña y verifica las sesiones activas.';
        severity = 'WARNING';
        action = {
          label: 'Revisar seguridad',
          destination: '/account/security'
        };
        break;
      }

      case 'ADMIN_INTERVENTION': {
        title = 'Acción administrativa registrada';
        fact = 'El equipo administrativo aplicó una intervención operativa en tu evento.';
        consequence =
          'Revisa las políticas del servicio y el estado actual de tu evento.';
        severity = 'WARNING';
        action = {
          label: 'Ver detalles',
          destination: `/events/${resourceRef}`
        };
        break;
      }

      case 'TEAM_INVITATION': {
        const inviter = typeof payload.inviterName === 'string' ? payload.inviterName : 'Un organizador';
        title = 'Invitación de equipo recibida';
        fact = `${inviter} te ha invitado a colaborar en un evento.`;
        consequence =
          'Acepta la invitación para acceder al panel de administración del evento.';
        severity = 'INFO';
        action = {
          label: 'Ver invitación',
          destination: '/team/invitations'
        };
        break;
      }

      default: {
        if (typeof payload.title === 'string') {
          title = payload.title;
        }
        if (typeof payload.fact === 'string') {
          fact = payload.fact;
        } else if (typeof payload.message === 'string') {
          fact = payload.message;
        }
        if (typeof payload.consequence === 'string') {
          consequence = payload.consequence;
        }
        if (typeof payload.actionLabel === 'string' && typeof payload.actionDestination === 'string') {
          action = {
            label: payload.actionLabel,
            destination: payload.actionDestination
          };
        }
        if (payload.severity === 'WARNING' || payload.severity === 'CRITICAL' || payload.severity === 'INFO') {
          severity = payload.severity;
        }
        break;
      }
    }

    return {
      id: `notice-${intent.id}`,
      intentId: intent.id,
      notificationType: intent.notificationType,
      title,
      fact,
      date: intent.effectiveAt,
      validUntil: intent.expiresAt ?? null,
      consequence,
      action,
      severity,
      resourceRef: intent.resourceRef,
      recipientRef: intent.recipientRef
    };
  }
}
