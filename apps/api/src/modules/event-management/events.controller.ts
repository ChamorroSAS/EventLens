import { Body, Controller, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EventDraftService } from '@eventlens/event-management';
import type { OrganizerActorContext } from '@eventlens/identity';
import { OrganizerSessionGuard } from '../../platform/auth/organizer-session.guard.js';
import { errorSchema } from '../../platform/health/health.controller.js';
import { mapEventError } from './event-error.map.js';
import {
  createEventDraftRequestSchema,
  eventDraftSchema,
  toEventDraftResponse,
  type EventDraftResponse
} from './events.schemas.js';

interface AuthenticatedRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: { name?: unknown };
  organizerActor?: OrganizerActorContext;
}

interface HttpReply {
  status(code: number): void;
}

function readIdempotencyKey(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  return trimmed.length >= 1 && trimmed.length <= 200 ? trimmed : undefined;
}

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(@Inject(EventDraftService) private readonly drafts: EventDraftService) {}

  @Post()
  @UseGuards(OrganizerSessionGuard)
  @ApiOperation({ operationId: 'createEventDraft', summary: 'Crear un borrador de evento' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Clave de idempotencia del comando' })
  @ApiBody({ schema: createEventDraftRequestSchema })
  @ApiResponse({ status: 201, schema: eventDraftSchema })
  @ApiResponse({ status: 200, schema: eventDraftSchema, description: 'Reintento idempotente compatible con la misma clave' })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  async create(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: HttpReply
  ): Promise<EventDraftResponse> {
    const actorContext = request.organizerActor as OrganizerActorContext;
    try {
      const result = await this.drafts.createDraft({
        actorContext,
        name: request.body?.name as string,
        idempotencyKey: readIdempotencyKey(request.headers['idempotency-key'])
      });
      reply.status(result.outcome === 'CREATED' ? 201 : 200);
      return toEventDraftResponse(result.event);
    } catch (error) {
      throw mapEventError(error);
    }
  }
}
