import { EventManagementError } from '@eventlens/event-management';
import { PublicHttpException } from '../../platform/http/public-http.exception.js';

/**
 * Maps trusted domain error codes to stable HTTP boundaries with Spanish messages.
 * Unknown errors pass through untouched so they remain sanitized by the public error filter.
 */
export function mapEventError(error: unknown): unknown {
  if (!(error instanceof EventManagementError)) return error;
  switch (error.code) {
    case 'INVALID_NAME':
      return new PublicHttpException(422, 'VALIDATION_ERROR', 'El nombre del evento debe tener entre 1 y 120 caracteres.');
    case 'INVALID_ARGUMENT':
      return new PublicHttpException(422, 'VALIDATION_ERROR', 'No se puede procesar la solicitud.');
    case 'UNAUTHORIZED':
      return new PublicHttpException(401, 'UNAUTHENTICATED', 'Se requiere autenticación.');
    case 'EVENT_NOT_FOUND':
      return new PublicHttpException(404, 'NOT_FOUND', 'El recurso solicitado no existe.');
    case 'IDEMPOTENCY_CONFLICT':
    case 'INVALID_STATE':
      return new PublicHttpException(409, 'CONFLICT', 'La solicitud entra en conflicto con el estado actual.');
    default:
      return error;
  }
}
