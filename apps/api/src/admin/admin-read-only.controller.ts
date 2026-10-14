import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags, type ApiResponseSchemaHost } from '@nestjs/swagger';
import { errorSchema } from '../platform/health/health.controller.js';
import { AdminReadOnlyService } from './admin-read-only.service.js';

const string = { type: 'string' };
const timestamp = { type: 'string', format: 'date-time' };
const nullableTime = { ...timestamp, nullable: true };
const pagination = {
  type: 'object', additionalProperties: false, required: ['page', 'limit', 'total', 'totalPages'],
  properties: { page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, total: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 } }
};
export const adminSearchSchema: ApiResponseSchemaHost['schema'] = {
  type: 'object', additionalProperties: false, required: ['items', 'pagination'], properties: {
    items: { type: 'array', items: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'name', 'status', 'organizerId', 'timezone', 'scheduledAt', 'createdAt'], properties: {
        type: { type: 'string', enum: ['EVENT'] }, id: string, name: string, status: string, organizerId: string, timezone: string, scheduledAt: nullableTime, createdAt: timestamp
      } },
      { type: 'object', additionalProperties: false, required: ['type', 'id', 'email', 'status', 'declaredAdult', 'createdAt'], properties: {
        type: { type: 'string', enum: ['ORGANIZER'] }, id: string, email: string, status: string, declaredAdult: { type: 'boolean' }, createdAt: timestamp
      } }
    ] } }, pagination
  }
};
export const adminReadOnlyDetailSchema: ApiResponseSchemaHost['schema'] = {
  type: 'object', additionalProperties: false, required: ['eventId', 'name', 'overallAvailability', 'owner', 'lifecycle', 'capacity', 'fetchedAt'], properties: {
    eventId: string, name: string, overallAvailability: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] },
    owner: { type: 'object', additionalProperties: false, required: ['id', 'email', 'status', 'declaredAdult', 'createdAt'], properties: {
      id: string, email: string, status: string, declaredAdult: { type: 'boolean' }, createdAt: timestamp
    } },
    lifecycle: { type: 'object', additionalProperties: false, required: ['status', 'timezone', 'startsAtLocal', 'scheduledAt', 'expiresAt', 'graceEndsAt', 'activatedAt', 'closedAt', 'suspendedAt', 'previousStatus', 'uploadsEnabled', 'guestGalleryEnabled'], properties: {
      status: string, timezone: string, startsAtLocal: { ...string, nullable: true }, scheduledAt: nullableTime,
      expiresAt: nullableTime, graceEndsAt: nullableTime, activatedAt: nullableTime, closedAt: nullableTime, suspendedAt: nullableTime,
      previousStatus: { ...string, nullable: true }, uploadsEnabled: { type: 'boolean' }, guestGalleryEnabled: { type: 'boolean' }
    } },
    capacity: { type: 'object', additionalProperties: false, required: ['availability'], properties: {
      availability: { type: 'string', enum: ['AVAILABLE', 'UNAVAILABLE', 'DEGRADED'] }, planCode: string, storageLimitBytes: string, storageUsedBytes: string, fileLimit: { type: 'integer' }, filesCount: { type: 'integer' }
    } }, fetchedAt: timestamp
  }
};

type Request = { headers?: Record<string, string | string[] | undefined> };
type Response = { setHeader(name: string, value: string): void };
function cookie(request: Request): string | undefined {
  const raw = request.headers?.cookie;
  return Array.isArray(raw) ? raw.join('; ') : raw;
}

@ApiTags('AdminReadOnly')
@Controller('admin')
export class AdminReadOnlyController {
  constructor(@Inject(AdminReadOnlyService) private readonly service: AdminReadOnlyService) {}

  @Get('search')
  @ApiOperation({ operationId: 'searchAdminEntities', summary: 'Buscar eventos y organizadores para investigación administrativa' })
  @ApiQuery({ name: 'query', required: false, type: String, maxLength: 100 })
  @ApiQuery({ name: 'entityType', required: false, enum: ['ALL', 'EVENT', 'ORGANIZER'] })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiResponse({ status: 200, schema: adminSearchSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async search(@Query() query: Record<string, unknown>, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.service.search(cookie(request), query);
  }

  @Get('events/:eventId/aggregated-detail')
  @ApiOperation({ operationId: 'getAdminAggregatedEventDetail', summary: 'Consultar detalle administrativo mínimo de un evento' })
  @ApiResponse({ status: 200, schema: adminReadOnlyDetailSchema })
  @ApiResponse({ status: 400, schema: errorSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async detail(@Param('eventId') eventId: string, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return this.service.detail(cookie(request), eventId);
  }
}
