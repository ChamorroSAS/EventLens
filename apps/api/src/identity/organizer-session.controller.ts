import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { OrganizerEffectiveSessionProjection } from '@eventlens/identity';
import { errorSchema } from '../platform/health/health.controller.js';
import {
  OrganizerSessionService,
  extractOrganizerSessionCookie
} from './organizer-session.service.js';

export const organizerCapabilitiesSchema = {
  type: 'object',
  required: [
    'canSignIn',
    'canRequestBetaAccess',
    'canAccessMyEvents',
    'canAccessMyAccount',
    'canManageSessions',
    'canManageAccountDeletion',
    'isDeletionRestricted',
    'canSignOut'
  ],
  properties: {
    canSignIn: { type: 'boolean' },
    canRequestBetaAccess: { type: 'boolean' },
    canAccessMyEvents: { type: 'boolean' },
    canAccessMyAccount: { type: 'boolean' },
    canManageSessions: { type: 'boolean' },
    canManageAccountDeletion: { type: 'boolean' },
    isDeletionRestricted: { type: 'boolean' },
    canSignOut: { type: 'boolean' }
  }
};

export const organizerProjectedAccountSchema = {
  type: 'object',
  nullable: true,
  required: ['email', 'emailVerified', 'accountStatus'],
  properties: {
    email: { type: 'string' },
    emailVerified: { type: 'boolean' },
    accountStatus: {
      type: 'string',
      enum: ['ACTIVE', 'PENDING_DELETION']
    }
  }
};

export const organizerSessionProjectionSchema = {
  type: 'object',
  required: ['state', 'capabilities', 'account'],
  properties: {
    state: {
      type: 'string',
      enum: ['ANONYMOUS', 'ORGANIZER_ACTIVE', 'ORGANIZER_RESTRICTED_DELETION']
    },
    capabilities: organizerCapabilitiesSchema,
    account: organizerProjectedAccountSchema
  }
};

export const organizerLoginRequestSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string' }
  }
};

export const organizerLogoutResponseSchema = {
  type: 'object',
  required: ['outcome', 'projection'],
  properties: {
    outcome: {
      type: 'string',
      enum: ['LOGGED_OUT', 'ALREADY_EXPIRED_OR_REVOKED']
    },
    projection: organizerSessionProjectionSchema
  }
};

function readSingleHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string
): string | undefined {
  const raw = headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

@ApiTags('identity')
@Controller('organizer/session')
export class OrganizerSessionController {
  constructor(
    @Inject(OrganizerSessionService)
    private readonly sessionService: OrganizerSessionService
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getOrganizerSessionProjection',
    summary: 'Proyectar estado efectivo y capacidades de la sesión de organizador'
  })
  @ApiResponse({ status: 200, schema: organizerSessionProjectionSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async getSessionProjection(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>> {
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const { projection, transientCsrfToken } =
      await this.sessionService.getEffectiveSessionProjection(sessionToken);

    response.setHeader('Cache-Control', 'no-store');
    if (transientCsrfToken) {
      response.setHeader('X-CSRF-Token', transientCsrfToken);
    }

    return projection;
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'loginOrganizerSession',
    summary: 'Iniciar sesión de organizador con credenciales verificadas'
  })
  @ApiBody({ schema: organizerLoginRequestSchema })
  @ApiResponse({ status: 200, schema: organizerSessionProjectionSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 429, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async login(
    @Body() body: { email?: unknown; password?: unknown } | undefined,
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>> {
    const originHeader = readSingleHeader(request.headers, 'origin');
    const { projection, transientCsrfToken, setCookieHeaders } =
      await this.sessionService.loginOrganizer({
        email: body?.email,
        password: body?.password,
        originHeader
      });

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', setCookieHeaders);
    response.setHeader('X-CSRF-Token', transientCsrfToken);
    return projection;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'logoutOrganizerSession',
    summary: 'Cerrar la sesión actual de organizador preservando otros contextos'
  })
  @ApiResponse({ status: 200, schema: organizerLogoutResponseSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async logout(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{
    outcome: 'LOGGED_OUT' | 'ALREADY_EXPIRED_OR_REVOKED';
    projection: Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>;
  }> {
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const originHeader = readSingleHeader(request.headers, 'origin');
    const csrfToken = readSingleHeader(request.headers, 'x-csrf-token');

    const { outcome, projection, setCookieHeaders } =
      await this.sessionService.logoutOrganizer({
        sessionToken,
        csrfToken,
        originHeader
      });

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', setCookieHeaders);
    return { outcome, projection };
  }
}
