import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
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
  type AuthorizedEventConfiguration,
  type CommandReceipt,
  type OrganizerEventSummary,
  type ShareAccessSnapshotResult
} from '@eventlens/event-management';
import type { PlatformConfig } from '../platform/config/config.js';
import { resolveAuthoritativeShareBaseUrl } from '../platform/config/public-entry-serving.js';
import { DatabaseService } from '../platform/database/database.service.js';
import { errorSchema } from '../platform/health/health.controller.js';
import { OrganizerEventLifecycleAdapter, type LifecycleRequest } from './organizer-event-lifecycle.js';
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

export interface SerializedSetEventScheduleResult {
  event: SerializedOrganizerEventSummary;
  outcome: 'UPDATED' | 'IDEMPOTENT_REPLAY';
  receipt?: CommandReceipt;
}

export interface SerializedChangePreparedEventTimezoneResult {
  event: SerializedOrganizerEventSummary;
  previousTimezone: string;
  warning?: 'RECALCULATED_SCHEDULE' | null;
  outcome: 'TIMEZONE_CHANGED' | 'IDEMPOTENT_REPLAY';
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
  private readonly lifecycle: OrganizerEventLifecycleAdapter;

  constructor(
    @Inject(ORGANIZER_SESSION_CONFIG) private readonly config: PlatformConfig,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(OrganizerSessionService) private readonly sessionService: OrganizerSessionService
  ) {
    this.eventDraftService = new EventDraftService(this.database.transactions);
    this.lifecycle = new OrganizerEventLifecycleAdapter(this.database.transactions, this.sessionService);
  }

  async getLifecycle(request: LifecycleRequest) {
    try { return await this.lifecycle.snapshot(request); }
    catch (error) { this.rethrowEventError(error, true); }
  }

  async executeLifecycle(action: 'schedule' | 'activate', request: LifecycleRequest) {
    try { return await this.lifecycle.command(action, request); }
    catch (error) {
      if (error instanceof EventManagementError && ['EVENT_NOT_IN_DRAFT', 'EVENT_NOT_IN_SCHEDULED', 'INVALID_STATE', 'CONCURRENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'].includes(error.code)) {
        throw new ConflictException({ code: error.code, message: 'Event lifecycle command cannot be applied' });
      }
      if (error instanceof EventManagementError && (error.code === 'SCHEDULE_NOT_CONFIGURED' || error.code === 'INCOMPLETE_CONFIGURATION')) {
        throw new UnprocessableEntityException({ code: error.code, message: 'Event configuration is incomplete' });
      }
      this.rethrowEventError(error, true);
    }
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
      return await this.lifecycle.shareSnapshot({ eventId: params.eventId, cookieHeader: params.cookieHeader }, authoritativeBaseUrl);
    } catch (error) {
      this.rethrowEventError(error, true);
    }
  }

  async prepareShareAccess(request: LifecycleRequest) {
    try { return await this.lifecycle.prepareShare(request); }
    catch (error) { this.rethrowEventError(error, true); }
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
      this.rethrowEventError(error, false, 400);
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
      this.rethrowEventError(error, true, 400);
    }
  }

  async setEventSchedule(request: LifecycleRequest): Promise<SerializedSetEventScheduleResult> {
    try {
      const result = await this.lifecycle.setSchedule(request);
      return { event: serializeOrganizerEventSummary(result.event), outcome: result.outcome, receipt: result.receipt };
    } catch (error) { this.rethrowEventError(error, true); }
  }

  async changeEventTimezone(params: {
    eventId: string;
    timezone?: unknown;
    utcOffsetMinutes?: unknown;
    expectedRevision?: unknown;
    idempotencyKey?: unknown;
    cookieHeader?: string;
  }): Promise<SerializedChangePreparedEventTimezoneResult> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    if (!params.timezone || typeof params.timezone !== 'string') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Valid IANA timezone string is required'
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
      const result = await this.eventDraftService.changeTimezone({
        actorContext: validated.actorContext,
        eventId: params.eventId,
        timezone: params.timezone.trim(),
        utcOffsetMinutes: utcOffset,
        expectedRevision,
        idempotencyKey
      });

      return {
        event: serializeOrganizerEventSummary(result.event),
        previousTimezone: result.previousTimezone,
        warning: result.warning,
        outcome: result.outcome,
        receipt: result.receipt
      };
    } catch (error) {
      this.rethrowEventError(error);
    }
  }

  private rethrowEventError(
    error: unknown,
    hideExistence = false,
    invalidArgumentStatus: 400 | 422 = 422
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof EventManagementError) {
      if (
        error.code === 'EVENT_NOT_FOUND' ||
        error.code === 'CREDENTIAL_NOT_FOUND' ||
        (hideExistence && error.code === 'EVENT_NOT_IN_DRAFT')
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
      if (error.code === 'INVALID_ARGUMENT' && invalidArgumentStatus === 400) {
        throw new BadRequestException(error.message);
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
    operationId: { type: 'string', format: 'uuid' },
    eventId: { type: 'string', format: 'uuid' },
    operation: { type: 'string' },
    appliedRevision: { type: 'string' },
    outcome: { type: 'string' }
  }
};

const SetEventScheduleBodySchema = {
  type: 'object',
  required: ['startsAtLocal', 'expectedRevision'],
  properties: {
    startsAtLocal: { type: 'string', description: 'Fecha y hora local YYYY-MM-DDTHH:mm o YYYY-MM-DDTHH:mm:ss' },
    utcOffsetMinutes: { type: 'integer', nullable: true, description: 'Offset UTC explícito en minutos para desambiguar DST' },
    expectedRevision: { type: 'string', pattern: '^[1-9]\\d{0,11}$', description: 'Revisión esperada para control de concurrencia optimista' },
    idempotencyKey: { type: 'string', nullable: true, description: 'Compatibilidad de cuerpo; se requiere cabecera Idempotency-Key' }
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

const ChangeEventTimezoneBodySchema = {
  type: 'object',
  required: ['timezone'],
  properties: {
    timezone: {
      type: 'string',
      description: 'Identificador IANA de la nueva zona horaria (ej. America/Bogota, UTC)'
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

const ChangeEventTimezoneResponseSchema = {
  type: 'object',
  required: ['event', 'previousTimezone', 'outcome'],
  properties: {
    event: EventSummarySchema,
    previousTimezone: { type: 'string' },
    warning: { type: 'string', enum: ['RECALCULATED_SCHEDULE'], nullable: true },
    outcome: { type: 'string', enum: ['TIMEZONE_CHANGED', 'IDEMPOTENT_REPLAY'] },
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

const LifecycleSnapshotSchema = {
  type: 'object',
  required: ['eventId', 'status', 'timezone', 'startsAtLocal', 'scheduledAt', 'expiresAt', 'graceEndsAt', 'revision', 'validityDurationDays', 'graceDays', 'capabilities'],
  properties: {
    eventId: { type: 'string' }, status: EventSummarySchema.properties.status,
    timezone: { type: 'string' }, startsAtLocal: { type: 'string', nullable: true },
    scheduledAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    graceEndsAt: { type: 'string', format: 'date-time', nullable: true },
    revision: { type: 'string' }, validityDurationDays: { type: 'number' }, graceDays: { type: 'number' },
    capabilities: { type: 'object', required: ['canSchedule', 'canActivateEarly'], properties: { canSchedule: { type: 'boolean' }, canActivateEarly: { type: 'boolean' } } }
  }
};
const LifecycleCommandBodySchema = { type: 'object', additionalProperties: false, required: ['expectedRevision'], properties: { expectedRevision: { type: 'string', pattern: '^[1-9]\\d*$' } } };
const LifecycleCommandResultSchema = { type: 'object', required: ['eventId', 'outcome'], properties: { eventId: { type: 'string' }, outcome: { type: 'string', enum: ['SCHEDULED', 'ACTIVATED', 'IDEMPOTENT_REPLAY'] } } };
const PrepareShareAccessResultSchema = { type: 'object', required: ['eventId', 'outcome'], properties: { eventId: { type: 'string' }, outcome: { type: 'string', enum: ['ISSUED', 'IDEMPOTENT_REPLAY'] } } };

@ApiTags('organizer-events')
@Controller('events')
export class OrganizerEventsController {
  constructor(
    @Inject(OrganizerEventsService) private readonly eventsService: OrganizerEventsService
  ) {}

  private lifecycleRequest(eventId: string, request: HttpRequest, response: HttpResponse, body?: unknown): LifecycleRequest {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const header = (name: string) => typeof request.headers?.[name] === 'string' ? request.headers[name] as string : undefined;
    return { eventId, body, cookieHeader: header('cookie'), originHeader: header('origin'), csrfToken: header('x-csrf-token'), idempotencyKey: header('idempotency-key') };
  }

  @Get(':eventId/lifecycle')
  @ApiOperation({ operationId: 'getOrganizerEventLifecycle', summary: 'Obtener ciclo de vida y capacidades del evento propio' })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiResponse({ status: 200, schema: LifecycleSnapshotSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  getLifecycle(@Param('eventId') eventId: string, @Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    return this.eventsService.getLifecycle(this.lifecycleRequest(eventId, request, response));
  }

  @Post(':eventId/lifecycle/schedule')
  @HttpCode(200)
  @ApiOperation({ operationId: 'scheduleOrganizerEvent', summary: 'Publicar el borrador con la fecha guardada' })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: LifecycleCommandBodySchema })
  @ApiResponse({ status: 200, schema: LifecycleCommandResultSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  scheduleLifecycle(@Param('eventId') eventId: string, @Body() body: unknown, @Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    return this.eventsService.executeLifecycle('schedule', this.lifecycleRequest(eventId, request, response, body));
  }

  @Post(':eventId/lifecycle/activate')
  @HttpCode(200)
  @ApiOperation({ operationId: 'activateOrganizerEvent', summary: 'Activar manualmente el evento programado' })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: LifecycleCommandBodySchema })
  @ApiResponse({ status: 200, schema: LifecycleCommandResultSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  activateLifecycle(@Param('eventId') eventId: string, @Body() body: unknown, @Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    return this.eventsService.executeLifecycle('activate', this.lifecycleRequest(eventId, request, response, body));
  }

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

  @Post(':eventId/share-access')
  @HttpCode(200)
  @ApiOperation({ operationId: 'prepareOrganizerEventShareAccess', summary: 'Preparar el enlace y QR inicial del evento programado o activo' })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: LifecycleCommandBodySchema })
  @ApiResponse({ status: 200, schema: PrepareShareAccessResultSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  prepareShareAccess(@Param('eventId') eventId: string, @Body() body: unknown, @Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    return this.eventsService.prepareShareAccess(this.lifecycleRequest(eventId, request, response, body));
  }

  @Put(':eventId/configuration/schedule')
  @ApiOperation({
    operationId: 'setEventSchedule',
    summary: 'Cambiar fecha y hora local de inicio antes de la primera activación (DRAFT o SCHEDULED)'
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
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
      expectedRevision: string;
      idempotencyKey?: string;
    },
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    return this.eventsService.setEventSchedule(this.lifecycleRequest(eventId, request, response, body));
  }

  @Put(':eventId/configuration/timezone')
  @ApiOperation({
    operationId: 'changeEventTimezone',
    summary: 'Cambiar zona horaria de un evento en estado DRAFT o SCHEDULED (EL-TK-227)'
  })
  @ApiParam({ name: 'eventId', type: 'string' })
  @ApiBody({ schema: ChangeEventTimezoneBodySchema })
  @ApiResponse({ status: 200, schema: ChangeEventTimezoneResponseSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  async changeEventTimezone(
    @Param('eventId') eventId: string,
    @Body()
    body: {
      timezone: string;
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

    return this.eventsService.changeEventTimezone({
      eventId,
      timezone: body?.timezone,
      utcOffsetMinutes: body?.utcOffsetMinutes,
      expectedRevision: body?.expectedRevision,
      idempotencyKey,
      cookieHeader
    });
  }
}
