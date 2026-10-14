import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  EventDraftService,
  EventManagementError,
  EventPublicAccessService,
  type AuthorizedEventConfiguration,
  type CommandReceipt,
  type OrganizerEventSummary,
  type ShareAccessSnapshotResult
} from '@eventlens/event-management';
import type { PlatformConfig } from '../platform/config/config.js';
import { resolveAuthoritativeShareBaseUrl } from '../platform/config/public-entry-serving.js';
import { DatabaseService } from '../platform/database/database.service.js';
import { errorSchema } from '../platform/health/health.controller.js';
import {
  ORGANIZER_SESSION_CONFIG,
  OrganizerSessionService,
  extractOrganizerSessionCookie
} from '../identity/organizer-session.service.js';

type HttpRequest = { headers?: Record<string, string | string[] | undefined> };
type HttpResponse = { setHeader(name: string, value: string | string[]): void };

export interface SerializedOrganizerEventSummary {
  id: string;
  organizerId: string;
  name: string;
  status: OrganizerEventSummary['status'];
  timezone: string;
  startsAtLocal: string | null;
  scheduledAt: string | null;
  utcOffsetMinutes: number | null;
  expiresAt: string | null;
  graceEndsAt: string | null;
  uploadsEnabled: boolean;
  guestGalleryEnabled: boolean;
  moderationMode: OrganizerEventSummary['moderationMode'];
  pinEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedAuthorizedEventConfiguration {
  event: SerializedOrganizerEventSummary;
  revision: string;
  capabilities: AuthorizedEventConfiguration['capabilities'];
}

export interface SerializedSetEventScheduleResult {
  event: SerializedOrganizerEventSummary;
  outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
  receipt?: CommandReceipt;
}

function serializeOrganizerEventSummary(summary: OrganizerEventSummary): SerializedOrganizerEventSummary {
  return {
    id: summary.id,
    organizerId: summary.organizerId,
    name: summary.name,
    status: summary.status,
    timezone: summary.timezone,
    startsAtLocal: summary.startsAtLocal ?? null,
    scheduledAt: summary.scheduledAt ? summary.scheduledAt.toISOString() : null,
    utcOffsetMinutes: summary.utcOffsetMinutes ?? null,
    expiresAt: summary.expiresAt ? summary.expiresAt.toISOString() : null,
    graceEndsAt: summary.graceEndsAt ? summary.graceEndsAt.toISOString() : null,
    uploadsEnabled: summary.uploadsEnabled,
    guestGalleryEnabled: summary.guestGalleryEnabled,
    moderationMode: summary.moderationMode,
    pinEnabled: summary.pinEnabled,
    createdAt: summary.createdAt.toISOString(),
    updatedAt: summary.updatedAt.toISOString()
  };
}

@Injectable()
export class OrganizerEventsService {
  private readonly eventDraftService: EventDraftService;
  private readonly publicAccessService: EventPublicAccessService;

  constructor(
    @Inject(ORGANIZER_SESSION_CONFIG) private readonly config: PlatformConfig,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(OrganizerSessionService) private readonly sessionService: OrganizerSessionService
  ) {
    this.eventDraftService = new EventDraftService(this.database.transactions);
    this.publicAccessService = new EventPublicAccessService(this.database.transactions);
  }

  async listEvents(cookieHeader?: string): Promise<SerializedOrganizerEventSummary[]> {
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    try {
      const summaries = await this.eventDraftService.listOrganizerEvents({
        actorContext: validated.actorContext
      });
      return summaries.map(serializeOrganizerEventSummary);
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  async getEventConfiguration(
    eventId: string,
    cookieHeader?: string
  ): Promise<SerializedAuthorizedEventConfiguration> {
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    try {
      const config = await this.eventDraftService.getAuthorizedConfiguration({
        actorContext: validated.actorContext,
        eventId
      });
      return {
        event: serializeOrganizerEventSummary(config.event),
        revision: config.revision,
        capabilities: config.capabilities
      };
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  async getShareAccessSnapshot(params: {
    eventId: string;
    cookieHeader?: string;
    untrustedBaseUrlOverride?: unknown;
    untrustedHostOverride?: unknown;
  }): Promise<ShareAccessSnapshotResult> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    let authoritativeBaseUrl: string;
    try {
      authoritativeBaseUrl = resolveAuthoritativeShareBaseUrl({
        trustedPublicEntryBaseUrl: this.config.publicEntryBaseUrl,
        untrustedBaseUrlOverride: params.untrustedBaseUrlOverride,
        untrustedHostOverride: params.untrustedHostOverride
      });
    } catch {
      throw new BadRequestException('Invalid or untrusted share base URL configuration');
    }

    try {
      return await this.publicAccessService.getShareAccessSnapshot({
        actorContext: validated.actorContext,
        eventId: params.eventId,
        baseUrl: authoritativeBaseUrl
      });
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  async setEventSchedule(params: {
    eventId: string;
    startsAtLocal?: unknown;
    utcOffsetMinutes?: unknown;
    expectedRevision?: unknown;
    idempotencyKey?: unknown;
    cookieHeader?: string;
  }): Promise<SerializedSetEventScheduleResult> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    if (!params.startsAtLocal || typeof params.startsAtLocal !== 'string') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Valid startsAtLocal string is required in format YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss'
      });
    }

    const utcOffset =
      typeof params.utcOffsetMinutes === 'number' ? params.utcOffsetMinutes : undefined;
    const expectedRevision =
      typeof params.expectedRevision === 'string'
        ? params.expectedRevision
        : typeof params.expectedRevision === 'number'
        ? String(params.expectedRevision)
        : undefined;
    const idempotencyKey =
      typeof params.idempotencyKey === 'string' && params.idempotencyKey.trim()
        ? params.idempotencyKey.trim()
        : undefined;

    try {
      const result = await this.eventDraftService.setSchedule({
        actorContext: validated.actorContext,
        eventId: params.eventId,
        startsAtLocal: params.startsAtLocal.trim(),
        utcOffsetMinutes: utcOffset,
        expectedRevision,
        idempotencyKey
      });

      return {
        event: serializeOrganizerEventSummary(result.event),
        outcome: result.outcome,
        receipt: result.receipt
      };
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  private rethrowEventError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof EventManagementError) {
      if (error.code === 'EVENT_NOT_FOUND' || error.code === 'CREDENTIAL_NOT_FOUND') {
        throw new NotFoundException(error.message);
      }
      if (error.code === 'UNAUTHORIZED') {
        throw new ForbiddenException(error.message);
      }
      if (
        error.code === 'INVALID_ARGUMENT' ||
        error.code === 'DST_GAP_TIME' ||
        error.code === 'AMBIGUOUS_LOCAL_TIME' ||
        error.code === 'INVALID_OFFSET' ||
        error.code === 'INVALID_DATE_TIME'
      ) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: error.message,
          code: error.code,
          details: error.details
        });
      }
      if (
        error.code === 'CONCURRENCY_CONFLICT' ||
        error.code === 'IDEMPOTENCY_CONFLICT' ||
        error.code === 'EVENT_NOT_IN_DRAFT' ||
        error.code === 'INVALID_STATE'
      ) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: error.message,
          code: error.code
        });
      }
    }
    throw new ServiceUnavailableException();
  }
}

const EventSummarySchema = {
  type: 'object',
  required: [
    'id',
    'organizerId',
    'name',
    'status',
    'timezone',
    'startsAtLocal',
    'scheduledAt',
    'utcOffsetMinutes',
    'expiresAt',
    'graceEndsAt',
    'uploadsEnabled',
    'guestGalleryEnabled',
    'moderationMode',
    'pinEnabled',
    'createdAt',
    'updatedAt'
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    organizerId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: {
      type: 'string',
      enum: [
        'DRAFT',
        'SCHEDULED',
        'ACTIVE',
        'CLOSED',
        'GRACE_PERIOD',
        'SUSPENDED',
        'PENDING_DELETION',
        'ARCHIVED'
      ]
    },
    timezone: { type: 'string' },
    startsAtLocal: { type: 'string', nullable: true },
    scheduledAt: { type: 'string', nullable: true },
    utcOffsetMinutes: { type: 'number', nullable: true },
    expiresAt: { type: 'string', nullable: true },
    graceEndsAt: { type: 'string', nullable: true },
    uploadsEnabled: { type: 'boolean' },
    guestGalleryEnabled: { type: 'boolean' },
    moderationMode: { type: 'string', enum: ['AUTO_PUBLISH', 'MANUAL_REVIEW'] },
    pinEnabled: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
};

const EventConfigurationSchema = {
  type: 'object',
  required: ['event', 'revision', 'capabilities'],
  properties: {
    event: EventSummarySchema,
    revision: { type: 'string' },
    capabilities: {
      type: 'object',
      required: [
        'canEditSchedule',
        'canEditSettings',
        'canManageAccess',
        'canViewLifecycle',
        'canViewCapacity',
        'canPublishOrActivate',
        'canEditName',
        'canSetLocalSchedule',
        'canChangeTimezone'
      ],
      properties: {
        canEditSchedule: { type: 'boolean' },
        canEditSettings: { type: 'boolean' },
        canManageAccess: { type: 'boolean' },
        canViewLifecycle: { type: 'boolean' },
        canViewCapacity: { type: 'boolean' },
        canPublishOrActivate: { type: 'boolean' },
        canEditName: { type: 'boolean' },
        canSetLocalSchedule: { type: 'boolean' },
        canChangeTimezone: { type: 'boolean' }
      }
    }
  }
};

const CommandReceiptSchema = {
  type: 'object',
  required: ['operationId', 'eventId', 'operation', 'appliedRevision', 'outcome'],
  properties: {
    operationId: { type: 'string' },
    eventId: { type: 'string' },
    operation: { type: 'string' },
    appliedRevision: { type: 'string' },
    outcome: { type: 'string' }
  }
};

const SetEventScheduleBodySchema = {
  type: 'object',
  required: ['startsAtLocal'],
  properties: {
    startsAtLocal: {
      type: 'string',
      description: "Fecha y hora local en formato 'YYYY-MM-DDTHH:mm' o 'YYYY-MM-DDTHH:mm:ss'"
    },
    utcOffsetMinutes: {
      type: 'number',
      nullable: true,
      description: 'Offset UTC explícito en minutos para desambiguar transiciones DST (fall-back)'
    },
    expectedRevision: {
      type: 'string',
      nullable: true,
      description: 'Revisión esperada para control de concurrencia optimista (CAS monotónico)'
    },
    idempotencyKey: {
      type: 'string',
      nullable: true,
      description: 'Clave de idempotencia para prevención de ejecuciones duplicadas'
    }
  }
};

const SetEventScheduleResponseSchema = {
  type: 'object',
  required: ['event', 'outcome'],
  properties: {
    event: EventSummarySchema,
    outcome: { type: 'string', enum: ['UPDATED', 'IDEMPOTENT_REPLAY'] },
    receipt: {
      ...CommandReceiptSchema,
      nullable: true
    }
  }
};

const ShareAccessSnapshotSchema = {
  type: 'object',
  required: [
    'eventId',
    'lookupKey',
    'sharePath',
    'shareUrl',
    'generation',
    'pinRequired',
    'qrPayload',
    'qrSvg'
  ],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    lookupKey: { type: 'string' },
    sharePath: { type: 'string' },
    shareUrl: { type: 'string' },
    generation: { type: 'number' },
    pinRequired: { type: 'boolean' },
    qrPayload: { type: 'string' },
    qrSvg: { type: 'string' }
  }
};

@ApiTags('organizer-events')
@Controller('events')
export class OrganizerEventsController {
  constructor(
    @Inject(OrganizerEventsService) private readonly eventsService: OrganizerEventsService
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'listOrganizerEvents',
    summary: 'Listar eventos pertenecientes al organizador autenticado (EL-TK-047)'
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'array',
      items: EventSummarySchema
    }
  })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  async listEvents(@Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    return this.eventsService.listEvents(cookieHeader);
  }

  @Get(':eventId/configuration')
  @ApiOperation({
    operationId: 'getAuthorizedEventConfiguration',
    summary: 'Obtener configuración autorizada y capacidades de un evento propio (EL-TK-047)'
  })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiResponse({ status: 200, schema: EventConfigurationSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  async getEventConfiguration(
    @Param('eventId') eventId: string,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    return this.eventsService.getEventConfiguration(eventId, cookieHeader);
  }

  @Get(':eventId/share-access')
  @ApiOperation({
    operationId: 'getEventShareAccessSnapshot',
    summary: 'Obtener enlace público /g/:lookupKey y QR SVG usando la base pública confiable del servidor (EL-TK-081, EL-TK-212)'
  })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiResponse({ status: 200, schema: ShareAccessSnapshotSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  async getShareAccessSnapshot(
    @Param('eventId') eventId: string,
    @Query('baseUrl') untrustedBaseUrlOverride: string | undefined,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const untrustedHostOverride = request.headers?.['x-public-base-override'];
    return this.eventsService.getShareAccessSnapshot({
      eventId,
      cookieHeader,
      untrustedBaseUrlOverride,
      untrustedHostOverride
    });
  }

  @Put(':eventId/configuration/schedule')
  @ApiOperation({
    operationId: 'setEventSchedule',
    summary: 'Definir fecha y hora local de inicio para un borrador de evento (EL-TK-226)'
  })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiBody({ schema: SetEventScheduleBodySchema })
  @ApiResponse({ status: 200, schema: SetEventScheduleResponseSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  async setEventSchedule(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      startsAtLocal: string;
      utcOffsetMinutes?: number;
      expectedRevision?: string;
      idempotencyKey?: string;
    },
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const idempotencyKey =
      (typeof request.headers?.['idempotency-key'] === 'string'
        ? request.headers['idempotency-key']
        : undefined) ?? body?.idempotencyKey;

    return this.eventsService.setEventSchedule({
      eventId,
      startsAtLocal: body?.startsAtLocal,
      utcOffsetMinutes: body?.utcOffsetMinutes,
      expectedRevision: body?.expectedRevision,
      idempotencyKey,
      cookieHeader
    });
  }
}
