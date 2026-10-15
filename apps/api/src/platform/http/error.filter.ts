import { randomUUID } from 'node:crypto';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { redactLookupKeyInText } from '../config/public-entry-serving.js';

const publicErrors: Record<number, { code: string; message: string }> = {
  400: { code: 'INVALID_REQUEST', message: 'La solicitud no es válida.' },
  401: { code: 'UNAUTHENTICATED', message: 'Se requiere autenticación.' },
  403: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' },
  404: { code: 'NOT_FOUND', message: 'El recurso solicitado no existe.' },
  409: { code: 'CONFLICT', message: 'La solicitud entra en conflicto con el estado actual.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud supera el tamaño permitido.' },
  422: { code: 'VALIDATION_ERROR', message: 'No se puede procesar la solicitud.' },
  429: { code: 'RATE_LIMITED', message: 'Hay demasiadas solicitudes. Inténtalo nuevamente más tarde.' },
  503: { code: 'DEPENDENCY_UNAVAILABLE', message: 'El servicio no está disponible temporalmente.' }
};

/**
 * Explicit allowlist of domain error codes that may cross the public boundary
 * (EL-TK-242, BLOCKER-1), each paired with a fixed public message. Sanitization stays
 * intact: the client only ever receives the `code`/`message` declared here, never the
 * message carried by the exception. Any code absent from this map keeps the
 * status-derived behavior in `publicErrors`, so an exception body can never inject an
 * unvetted code (for example `UNTRUSTED_CODE`) or leak internal detail. The vocabulary
 * distinguishes optimistic revision/replay/binding conflicts as required by
 * `.codex/context/api-conventions.md`.
 */
const publicDomainErrors: Record<string, { code: string; message: string }> = {
  INSUFFICIENT_FILE_CAPACITY: { code: 'INSUFFICIENT_FILE_CAPACITY', message: 'El evento alcanzó su límite de archivos.' },
  INSUFFICIENT_STORAGE_CAPACITY: { code: 'INSUFFICIENT_STORAGE_CAPACITY', message: 'El evento no tiene espacio disponible para este archivo.' },
  FILE_SIZE_EXCEEDS_LIMIT: { code: 'FILE_SIZE_EXCEEDS_LIMIT', message: 'El archivo supera el tamaño permitido.' },
  UPLOAD_ATTEMPT_EXPIRED: { code: 'UPLOAD_ATTEMPT_EXPIRED', message: 'El plazo de este intento de carga terminó.' },
  UPLOAD_ATTEMPT_CANCELLED: { code: 'UPLOAD_ATTEMPT_CANCELLED', message: 'Este intento de carga fue cancelado.' },
  UPLOADS_DISABLED: { code: 'UPLOADS_DISABLED', message: 'El evento no permite subidas en este momento.' },
  SIZE_MISMATCH: { code: 'SIZE_MISMATCH', message: 'El tamaño o tipo transferido no coincide con el archivo autorizado.' },
  CORRUPTED_OR_UNREADABLE_FILE: { code: 'CORRUPTED_OR_UNREADABLE_FILE', message: 'No se pudo comprobar la integridad del archivo.' },
  CONSENT_REQUIRED: { code: 'CONSENT_REQUIRED', message: 'Acepta los consentimientos antes de subir archivos.' },
  INVALID_CONTRIBUTOR_NICKNAME: { code: 'INVALID_CONTRIBUTOR_NICKNAME', message: 'Completa tu nombre o apodo antes de subir archivos.' },
  EMAIL_EXISTS: { code: 'EMAIL_EXISTS', message: 'Ya existe una cuenta con ese correo.' },
  IDEMPOTENCY_CONFLICT: { code: 'IDEMPOTENCY_CONFLICT', message: 'La operación ya estaba registrada con otros datos.' },
  STALE_REVISION: { code: 'STALE_REVISION', message: 'La cuenta cambió desde que se abrió el formulario. Recarga antes de continuar.' },
  CONCURRENCY_CONFLICT: { code: 'CONCURRENCY_CONFLICT', message: 'La operación entra en conflicto con un cambio concurrente. Recarga antes de continuar.' },
  INVALID_STATE: { code: 'INVALID_STATE', message: 'La cuenta no permite esa operación en su estado actual.' },
  INVALID_ARGUMENT: { code: 'INVALID_ARGUMENT', message: 'La solicitud contiene datos no válidos.' },
  AUTHORITY_UNAVAILABLE: { code: 'AUTHORITY_UNAVAILABLE', message: 'No se confirmó la operación. Consulta el estado antes de reintentar.' }
};

/** Returns the allowlisted public error for a domain `code` carried by an exception, if any. */
function allowlistedDomainError(error: unknown): { code: string; message: string } | undefined {
  if (!(error instanceof HttpException)) {
    return undefined;
  }
  const body = error.getResponse();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return undefined;
  }
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(publicDomainErrors, code)
    ? publicDomainErrors[code]
    : undefined;
}

@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  constructor(private readonly operationalLogSink?: (redactedLine: string) => void) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const correlationId = request.correlationId ?? randomUUID();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const publicError = allowlistedDomainError(error) ??
      publicErrors[status] ?? {
        code: 'INTERNAL_ERROR',
        message: 'No se pudo completar la solicitud.'
      };

    if (this.operationalLogSink) {
      const rawUrl = String(request?.originalUrl ?? request?.url ?? '');
      const rawErrMsg = error instanceof Error ? error.message : String(error ?? '');
      const lookupParam =
        typeof request?.params?.lookupKey === 'string' ? [request.params.lookupKey] : [];
      const redactedLine = redactLookupKeyInText(
        `[HTTP_${status}] correlationId=${correlationId} path=${rawUrl} code=${publicError.code} detail=${rawErrMsg}`,
        lookupParam
      );
      this.operationalLogSink(redactedLine);
    }

    response.status(status).json({ ...publicError, correlationId });
  }
}
