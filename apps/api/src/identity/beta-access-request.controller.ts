import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AccessRequestError, BetaAccessRequestService } from '@eventlens/identity';
import { DatabaseService } from '../platform/database/database.service.js';
import { errorSchema } from '../platform/health/health.controller.js';

export const publicBetaAccessRequestBodySchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: { type: 'string', format: 'email' }
  }
};

export const publicBetaAccessRequestResponseSchema = {
  type: 'object',
  required: ['outcome', 'message'],
  properties: {
    outcome: {
      type: 'string',
      enum: ['REQUEST_RECEIVED']
    },
    message: { type: 'string' }
  }
};

@Injectable()
export class PublicBetaAccessRequestAdapterService {
  private readonly domainService: BetaAccessRequestService;

  constructor(@Inject(DatabaseService) database: DatabaseService) {
    this.domainService = new BetaAccessRequestService(database.transactions);
  }

  getDomainService(): BetaAccessRequestService {
    return this.domainService;
  }

  async submitPublicRequest(params: {
    email: unknown;
    clientIp?: string;
    setRetryAfterHeader?: (seconds: string) => void;
  }): Promise<{ outcome: 'REQUEST_RECEIVED'; message: string }> {
    if (typeof params.email !== 'string') {
      throw new UnprocessableEntityException();
    }

    try {
      await this.domainService.requestAccess({
        email: params.email,
        clientIp: params.clientIp
      });
      return {
        outcome: 'REQUEST_RECEIVED',
        message: 'Solicitud recibida.'
      };
    } catch (error) {
      if (error instanceof AccessRequestError) {
        if (error.code === 'INVALID_EMAIL' || error.code === 'INVALID_ARGUMENT') {
          throw new UnprocessableEntityException();
        }
        if (error.code === 'RATE_LIMITED') {
          params.setRetryAfterHeader?.('900');
          throw new HttpException('Too Many Requests', 429);
        }
      }
      throw new ServiceUnavailableException();
    }
  }
}

@ApiTags('identity')
@Controller('public/beta-access-requests')
export class BetaAccessRequestController {
  constructor(
    @Inject(PublicBetaAccessRequestAdapterService)
    private readonly adapterService: PublicBetaAccessRequestAdapterService
  ) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    operationId: 'submitPublicBetaAccessRequest',
    summary: 'Enviar solicitud pública de acceso a la Beta sin enumeración'
  })
  @ApiBody({ schema: publicBetaAccessRequestBodySchema })
  @ApiResponse({ status: 200, schema: publicBetaAccessRequestResponseSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 429, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async submitRequest(
    @Body() body: { email?: unknown } | undefined,
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ): Promise<{ outcome: 'REQUEST_RECEIVED'; message: string }> {
    response.setHeader('Cache-Control', 'no-store');
    const clientIp = request.ip ?? request.socket?.remoteAddress;
    return this.adapterService.submitPublicRequest({
      email: body?.email,
      clientIp,
      setRetryAfterHeader: (seconds) => response.setHeader('Retry-After', seconds)
    });
  }
}
