import { randomUUID } from 'node:crypto';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
const publicErrors:Record<number,{code:string;message:string}> = {
  400:{code:'INVALID_REQUEST',message:'La solicitud no es válida.'},
  401:{code:'UNAUTHENTICATED',message:'Se requiere autenticación.'},
  403:{code:'FORBIDDEN',message:'No tienes permiso para realizar esta acción.'},
  404:{code:'NOT_FOUND',message:'El recurso solicitado no existe.'},
  409:{code:'CONFLICT',message:'La solicitud entra en conflicto con el estado actual.'},
  413:{code:'PAYLOAD_TOO_LARGE',message:'La solicitud supera el tamaño permitido.'},
  422:{code:'VALIDATION_ERROR',message:'No se puede procesar la solicitud.'},
  429:{code:'RATE_LIMITED',message:'Hay demasiadas solicitudes. Inténtalo nuevamente más tarde.'},
  503:{code:'DEPENDENCY_UNAVAILABLE',message:'El servicio no está disponible temporalmente.'}
};
@Catch()
export class PublicErrorFilter implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost):void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const correlationId = request.correlationId ?? randomUUID();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const publicError = publicErrors[status] ?? {code:'INTERNAL_ERROR',message:'No se pudo completar la solicitud.'};
    response.status(status).json({...publicError,correlationId});
  }
}
