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
import { extractAdminSessionCookie } from '@eventlens/identity';
import { errorSchema } from '../platform/health/health.controller.js';
import { AdminSessionService } from './admin-session.service.js';

export const adminPrincipalSchema = {
  type: 'object',
  required: ['id', 'identifier'],
  properties: {
    id: { type: 'string' },
    identifier: { type: 'string' }
  }
};

export const adminLoginRequestSchema = {
  type: 'object',
  required: ['identifier', 'secret'],
  properties: {
    identifier: { type: 'string' },
    secret: { type: 'string' }
  }
};

export const adminLoginResponseSchema = {
  type: 'object',
  required: ['principal', 'csrfToken'],
  properties: {
    principal: adminPrincipalSchema,
    csrfToken: { type: 'string' }
  }
};

export const adminSessionProjectionSchema = {
  type: 'object',
  required: ['state', 'principal'],
  properties: {
    state: { type: 'string', enum: ['ADMIN_ACTIVE', 'ANONYMOUS'] },
    principal: { ...adminPrincipalSchema, nullable: true },
    authTime: { type: 'string', format: 'date-time' }
  }
};

export const adminSessionContextResponseSchema = {
  type: 'object',
  required: ['csrfToken'],
  properties: {
    csrfToken: { type: 'string' }
  }
};

export const adminLogoutResponseSchema = {
  type: 'object',
  required: ['outcome'],
  properties: {
    outcome: { type: 'string', enum: ['LOGGED_OUT'] }
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

@ApiTags('AdminAuthentication')
@Controller('admin/auth')
export class AdminSessionController {
  constructor(
    @Inject(AdminSessionService) private readonly sessionService: AdminSessionService
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'loginAdminSession',
    summary: 'Iniciar sesión administrativa con credenciales de alta entropía'
  })
  @ApiBody({ schema: adminLoginRequestSchema })
  @ApiResponse({ status: 200, schema: adminLoginResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async login(
    @Body() body: { identifier?: unknown; secret?: unknown } | undefined,
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{ principal: { id: string; identifier: string }; csrfToken: string }> {
    response.setHeader('Cache-Control', 'no-store');
    const originHeader = readSingleHeader(request.headers, 'origin');
    const clientHeader = readSingleHeader(request.headers, 'x-eventlens-admin-client');

    const result = await this.sessionService.loginAdmin({
      identifier: body?.identifier,
      secret: body?.secret,
      originHeader,
      clientHeader
    });

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', result.setCookieHeaders);
    return {
      principal: result.principal,
      csrfToken: result.csrfToken
    };
  }

  @Get('session')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'getAdminSession',
    summary: 'Obtener la proyección mínima de la sesión administrativa activa'
  })
  @ApiResponse({ status: 200, schema: adminSessionProjectionSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async getSession(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const sessionToken = extractAdminSessionCookie(cookieHeader);

    const projection = await this.sessionService.getSessionProjection(sessionToken);
    response.setHeader('Cache-Control', 'no-store');
    return projection;
  }

  @Post('session-context')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'renewAdminSessionContext',
    summary: 'Renovar el contexto de sesión administrativa rotando únicamente el token CSRF'
  })
  @ApiResponse({ status: 200, schema: adminSessionContextResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async renewSessionContext(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{ csrfToken: string }> {
    response.setHeader('Cache-Control', 'no-store');
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const sessionToken = extractAdminSessionCookie(cookieHeader);
    const originHeader = readSingleHeader(request.headers, 'origin');
    const clientHeader = readSingleHeader(request.headers, 'x-eventlens-admin-client');

    const result = await this.sessionService.renewSessionContext({
      sessionToken,
      originHeader,
      clientHeader
    });

    response.setHeader('Cache-Control', 'no-store');
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'logoutAdminSession',
    summary: 'Cerrar la sesión administrativa revocando el token de sesión'
  })
  @ApiResponse({ status: 200, schema: adminLogoutResponseSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async logout(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{ outcome: 'LOGGED_OUT' }> {
    response.setHeader('Cache-Control', 'no-store');
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    const sessionToken = extractAdminSessionCookie(cookieHeader);
    const originHeader = readSingleHeader(request.headers, 'origin');
    const csrfToken = readSingleHeader(request.headers, 'x-csrf-token');

    const result = await this.sessionService.logoutAdmin({
      sessionToken,
      originHeader,
      csrfTokenHeader: csrfToken
    });

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Set-Cookie', result.setCookieHeaders);
    return { outcome: result.outcome };
  }
}
