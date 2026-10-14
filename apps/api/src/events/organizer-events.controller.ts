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
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  EventDraftService,
  EventManagementError,
  EventPublicAccessService,
  type AuthorizedEventConfiguration,
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
type HttpResponse = {
  setHeader(name: string, value: string | string[]): void;
  status?(code: number): any;
  statusCode?: number;
};

export interface SerializedCommandReceipt {
  operationId: string;
  eventId: string;
  operation: string;
  appliedRevision: string;
  outcome: string;
}

export interface SerializedCreateEventResponse {
  receipt: SerializedCommandReceipt;
  outcome: 'APPLIED' | 'REPLAYED';
  event: {
    id: string;
  };
}

export interface SerializedUpdateEventNameResponse {
  receipt: SerializedCommandReceipt;
  outcome: 'APPLIED' | 'REPLAYED';
  revision: string;
  event: {
    id: string;
    name: string;
    revision: string;
  };
}

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

  async createEvent(params: {
    cookieHeader?: string;
    originHeader?: string;
    csrfToken?: string;
    idempotencyKey?: string;
    body: unknown;
  }): Promise<{ httpStatus: number; data: SerializedCreateEventResponse }> {
    const rawKey = params.idempotencyKey?.trim();
    if (!rawKey || !/^[A-Za-z0-9_-]{1,128}$/.test(rawKey)) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must match ^[A-Za-z0-9_-]{1,128}$'
      );
    }

    if (!params.body || typeof params.body !== 'object' || typeof (params.body as any).name !== 'string') {
      throw new BadRequestException('Request body must contain a name string');
    }

    const trimmedName = (params.body as any).name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 120) {
      throw new UnprocessableEntityException('Event name must be between 1 and 120 characters');
    }

    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    try {
      const result = await this.eventDraftService.createDraft({
        actorContext: validated.actorContext,
        name: trimmedName,
        idempotencyKey: rawKey
      });

      const outcome = result.outcome === 'IDEMPOTENT_REPLAY' ? 'REPLAYED' : 'APPLIED';
      const httpStatus = outcome === 'REPLAYED' ? 200 : 201;

      return {
        httpStatus,
        data: {
          receipt: {
            operationId: result.receipt!.operationId,
            eventId: result.receipt!.eventId,
            operation: result.receipt!.operation,
            appliedRevision: result.receipt!.appliedRevision,
            outcome: result.receipt!.outcome
          },
          outcome,
          event: {
            id: result.event.id
          }
        }
      };
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  async updateEventName(params: {
    eventId: string;
    cookieHeader?: string;
    originHeader?: string;
    csrfToken?: string;
    idempotencyKey?: string;
    body: unknown;
  }): Promise<SerializedUpdateEventNameResponse> {
    const rawKey = params.idempotencyKey?.trim();
    if (!rawKey || !/^[A-Za-z0-9_-]{1,128}$/.test(rawKey)) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must match ^[A-Za-z0-9_-]{1,128}$'
      );
    }

    if (!params.body || typeof params.body !== 'object') {
      throw new BadRequestException('Request body must be an object');
    }

    const { name, expectedRevision } = params.body as Record<string, unknown>;

    if (typeof name !== 'string') {
      throw new BadRequestException('Request body must contain a name string');
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 120) {
      throw new UnprocessableEntityException('Event name must be between 1 and 120 characters');
    }

    if (typeof expectedRevision !== 'string' || expectedRevision.trim().length === 0) {
      throw new BadRequestException('Request body must contain an expectedRevision string');
    }

    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    try {
      const result = await this.eventDraftService.updateDraftName({
        actorContext: validated.actorContext,
        eventId: params.eventId,
        name: trimmedName,
        expectedRevision: expectedRevision.trim(),
        idempotencyKey: rawKey
      });

      const outcome = result.outcome === 'IDEMPOTENT_REPLAY' ? 'REPLAYED' : 'APPLIED';
      const eventRevision = String(result.event.revision);

      return {
        receipt: {
          operationId: result.receipt?.operationId ?? '',
          eventId: result.receipt?.eventId ?? result.event.id,
          operation: result.receipt?.operation ?? 'UPDATE_NAME',
          appliedRevision: result.receipt?.appliedRevision ?? eventRevision,
          outcome: result.receipt?.outcome ?? (outcome === 'REPLAYED' ? 'REPLAYED' : 'UPDATED')
        },
        outcome,
        revision: eventRevision,
        event: {
          id: result.event.id,
          name: result.event.name,
          revision: eventRevision
        }
      };
    } catch (error) {
      this.rethrowEventError(error, true);
    }
  }

  private rethrowEventError(error: unknown, hideExistence = false): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof EventManagementError) {
      if (
        error.code === 'EVENT_NOT_FOUND' ||
        error.code === 'CREDENTIAL_NOT_FOUND' ||
        error.code === 'EVENT_NOT_IN_DRAFT'
      ) {
        throw new NotFoundException();
      }
      if (error.code === 'UNAUTHORIZED') {
        if (hideExistence) {
          throw new NotFoundException();
        }
        throw new ForbiddenException();
      }
      if (error.code === 'INVALID_NAME') {
        throw new UnprocessableEntityException(error.message);
      }
      if (error.code === 'INVALID_ARGUMENT') {
        throw new BadRequestException(error.message);
      }
      if (error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'CONCURRENCY_CONFLICT') {
        throw new ConflictException(error.message);
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
        'canEditName'
      ],
      properties: {
        canEditSchedule: { type: 'boolean' },
        canEditSettings: { type: 'boolean' },
        canManageAccess: { type: 'boolean' },
        canViewLifecycle: { type: 'boolean' },
        canViewCapacity: { type: 'boolean' },
        canPublishOrActivate: { type: 'boolean' },
        canEditName: { type: 'boolean' }
      }
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

const CommandReceiptSchema = {
  type: 'object',
  required: ['operationId', 'eventId', 'operation', 'appliedRevision', 'outcome'],
  properties: {
    operationId: { type: 'string', format: 'uuid' },
    eventId: { type: 'string', format: 'uuid' },
    operation: { type: 'string' },
    appliedRevision: { type: 'string' },
    outcome: { type: 'string' }
  }
};

const CreateEventRequestSchema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 }
  }
};

const CreateEventResponseSchema = {
  type: 'object',
  required: ['receipt', 'outcome', 'event'],
  properties: {
    receipt: CommandReceiptSchema,
    outcome: { type: 'string', enum: ['APPLIED', 'REPLAYED'] },
    event: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', format: 'uuid' }
      }
    }
  }
};

const UpdateEventNameRequestSchema = {
  type: 'object',
  required: ['name', 'expectedRevision'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    expectedRevision: { type: 'string' }
  }
};

const UpdateEventNameResponseSchema = {
  type: 'object',
  required: ['receipt', 'outcome', 'revision', 'event'],
  properties: {
    receipt: CommandReceiptSchema,
    outcome: { type: 'string', enum: ['APPLIED', 'REPLAYED'] },
    revision: { type: 'string' },
    event: {
      type: 'object',
      required: ['id', 'name', 'revision'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        revision: { type: 'string' }
      }
    }
  }
};

@ApiTags('organizer-events')
@Controller('events')
export class OrganizerEventsController {
  constructor(
    @Inject(OrganizerEventsService) private readonly eventsService: OrganizerEventsService
  ) {}

  @Post()
  @ApiOperation({
    operationId: 'createOrganizerEvent',
    summary: 'Crear un nuevo borrador de evento de forma idempotente (EL-TK-224)'
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave de idempotencia única para la operación'
  })
  @ApiBody({ schema: CreateEventRequestSchema })
  @ApiResponse({ status: 201, schema: CreateEventResponseSchema })
  @ApiResponse({ status: 200, schema: CreateEventResponseSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async createEvent(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ): Promise<SerializedCreateEventResponse> {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;
    const rawIdempotencyKey = request.headers?.['idempotency-key'];
    const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey : undefined;

    const res = await this.eventsService.createEvent({
      cookieHeader,
      originHeader,
      csrfToken,
      idempotencyKey,
      body
    });

    if (typeof response.status === 'function') {
      response.status(res.httpStatus);
    } else {
      response.statusCode = res.httpStatus;
    }

    return res.data;
  }

  @Patch(':eventId/configuration/name')
  @ApiOperation({
    operationId: 'updateOrganizerEventName',
    summary: 'Actualizar nombre de un borrador de evento con control de revisión e idempotencia (EL-TK-225)'
  })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Clave de idempotencia única para la operación'
  })
  @ApiBody({ schema: UpdateEventNameRequestSchema })
  @ApiResponse({ status: 200, schema: UpdateEventNameResponseSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async updateEventName(
    @Param('eventId') eventId: string,
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ): Promise<SerializedUpdateEventNameResponse> {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;
    const rawIdempotencyKey = request.headers?.['idempotency-key'];
    const idempotencyKey = typeof rawIdempotencyKey === 'string' ? rawIdempotencyKey : undefined;

    return this.eventsService.updateEventName({
      eventId,
      cookieHeader,
      originHeader,
      csrfToken,
      idempotencyKey,
      body
    });
  }

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
}
