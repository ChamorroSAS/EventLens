import {
  type EmailNotificationSpec,
  type NotificationIntentRecord,
  NotificationError
} from './contracts.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Standard email template renderer for EventLens notifications (EL-TK-157).
 * Renders both accessible HTML and accessible plain text.
 * Strictly sanitizes output: never leaks raw credentials, secrets, or internal stack traces.
 */
export class EmailRenderer {
  public render(intent: NotificationIntentRecord): EmailNotificationSpec {
    const to = intent.recipientEmail;
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      throw new NotificationError(
        'INVALID_RECIPIENT',
        `Notification intent ${intent.id} does not contain a valid recipientEmail`
      );
    }

    const payload = intent.payload || {};
    let subject = 'Notificación del sistema — EventLens';
    let heading = 'Notificación de EventLens';
    let message = 'Has recibido una actualización relevante en tu cuenta o evento.';
    let actionUrl = typeof payload.actionUrl === 'string' ? payload.actionUrl : '';
    let actionLabel = 'Ir a EventLens';

    switch (intent.notificationType) {
      case 'ACCOUNT_SECURITY':
        subject = 'Alerta de seguridad en tu cuenta EventLens';
        heading = 'Actividad de seguridad en tu cuenta';
        message =
          'Hemos detectado un evento de seguridad relevante en tu cuenta (ej. nuevo inicio de sesión o cambio de credenciales). Si no reconoces esta acción, protege tu cuenta de inmediato.';
        actionLabel = 'Revisar mi cuenta';
        break;

      case 'ACCOUNT_RECOVERY':
        subject = 'Recuperación de acceso a tu cuenta EventLens';
        heading = 'Solicitud de recuperación de cuenta';
        message =
          'Has solicitado recuperar el acceso a tu cuenta. Sigue las instrucciones seguras en la plataforma para restablecer tu acceso.';
        actionLabel = 'Restablecer acceso';
        break;

      case 'EVENT_UPCOMING': {
        const eventName = typeof payload.eventName === 'string' ? payload.eventName : 'tu evento';
        subject = `Tu evento "${eventName}" está próximo a comenzar — EventLens`;
        heading = 'Tu evento está por iniciar';
        message = `Faltan pocas horas para que comience "${escapeHtml(
          eventName
        )}". Los participantes podrán compartir recuerdos según las configuraciones activas.`;
        actionLabel = 'Ver panel del evento';
        break;
      }

      case 'EVENT_SUSPENDED': {
        subject = 'Notificación importante sobre el estado de tu evento — EventLens';
        heading = 'Tu evento ha sido suspendido temporalmente';
        message =
          'Tu evento se encuentra en estado de suspensión administrativa. Las cargas y accesos públicos han sido pausados mientras se revisa la situación.';
        actionLabel = 'Contactar soporte';
        break;
      }

      case 'EVENT_REACTIVATED': {
        subject = 'Tu evento ha sido reactivado — EventLens';
        heading = 'Tu evento está activo nuevamente';
        message =
          'La revisión de tu evento ha concluido y el acceso normal ha sido restablecido.';
        actionLabel = 'Ver mi evento';
        break;
      }

      case 'CAPACITY_WARNING_80': {
        subject = 'Aviso de capacidad: tu evento ha alcanzado el 80% del límite';
        heading = 'Tu evento ha alcanzado el 80% de su capacidad';
        message =
          'Has utilizado el 80% del almacenamiento disponible para tu evento. Puedes solicitar una ampliación de capacidad desde tu panel antes de que se agote.';
        actionLabel = 'Gestionar capacidad';
        break;
      }

      case 'CAPACITY_EXCEEDED_100': {
        subject = 'Límite de capacidad alcanzado (100%) — EventLens';
        heading = 'Límite de almacenamiento alcanzado';
        message =
          'Tu evento ha alcanzado el 100% de la capacidad contratada. Las nuevas cargas de fotos y videos han sido pausadas hasta que se amplíe la cuota.';
        actionLabel = 'Solicitar ampliación';
        break;
      }

      case 'EXPORT_AVAILABLE': {
        subject = 'Tu exportación de recuerdos está lista para descargar — EventLens';
        heading = 'Descarga de recuerdos disponible';
        message =
          'El archivo comprimido con los recuerdos originales de tu evento está listo. El enlace privado estará disponible durante 48 horas.';
        actionLabel = 'Descargar recuerdos';
        break;
      }

      case 'EXPORT_EXPIRED': {
        subject = 'El enlace de descarga de tu exportación ha caducado — EventLens';
        heading = 'Enlace de exportación caducado';
        message =
          'La ventana de 48 horas para descargar tu paquete de exportación ha expirado por motivos de seguridad. Puedes generar una nueva solicitud desde tu biblioteca.';
        actionLabel = 'Solicitar nueva exportación';
        break;
      }

      case 'REPORT_RESOLVED': {
        subject = 'Actualización sobre una moderación o reporte — EventLens';
        heading = 'Resolución de caso';
        message =
          'Se ha registrado una resolución sobre una solicitud o reporte en tu evento.';
        actionLabel = 'Ver detalles';
        break;
      }

      case 'ADMIN_INTERVENTION': {
        subject = 'Aviso de intervención administrativa en tu evento — EventLens';
        heading = 'Acción administrativa registrada';
        message =
          'El equipo de administración de EventLens ha aplicado una actualización operativa sobre tu evento de acuerdo con las políticas del servicio.';
        actionLabel = 'Ver panel';
        break;
      }

      case 'TEAM_INVITATION': {
        const inviterName = typeof payload.inviterName === 'string' ? payload.inviterName : 'Un organizador';
        subject = `Invitación para colaborar en EventLens — ${inviterName}`;
        heading = 'Has recibido una invitación de equipo';
        message = `${escapeHtml(inviterName)} te ha invitado a unirte como colaborador en EventLens.`;
        actionLabel = 'Ver invitación';
        break;
      }

      default:
        if (typeof payload.title === 'string') {
          heading = payload.title;
        }
        if (typeof payload.message === 'string') {
          message = payload.message;
        }
        break;
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; color: #1f2937; margin: 0; padding: 24px; background-color: #f3f4f6; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; font-weight: 700; color: #111827; margin-top: 0; }
    p { margin-bottom: 24px; color: #4b5563; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; }
    .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    ${
      actionUrl
        ? `<p><a class="btn" href="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel)}</a></p>`
        : ''
    }
    <div class="footer">
      <p>EventLens — Preservando recuerdos auténticos y compartidos.</p>
    </div>
  </div>
</body>
</html>`;

    const text = `${heading.toUpperCase()}

${message}

${actionUrl ? `${actionLabel}: ${actionUrl}\n\n` : ''}EventLens — Preservando recuerdos auténticos y compartidos.`;

    return {
      to,
      subject,
      html,
      text
    };
  }
}
