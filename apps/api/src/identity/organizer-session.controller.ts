import {
  Body,
  BadRequestException,
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
    canSignOut: { type: 'boolean' },
    canChangePassword: { type: 'boolean' }
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
      enum: ['ANONYMOUS', 'ORGANIZER_ACTIVE', 'ORGANIZER_RESTRICTED_DELETION', 'PASSWORD_CHANGE_REQUIRED']
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

  @Post('temporary-password')
  @HttpCode(200)
  @ApiOperation({operationId:'changeOrganizerTemporaryPassword'})
  @ApiBody({schema:{type:'object',additionalProperties:false,required:['currentPassword','newPassword','declaredAdult'],properties:{currentPassword:{type:'string'},newPassword:{type:'string',minLength:8,maxLength:1024},declaredAdult:{type:'boolean',enum:[true]}}}})
  @ApiResponse({status:200,schema:{type:'object',required:['outcome'],properties:{outcome:{type:'string',enum:['PASSWORD_CHANGED_RELOGIN_REQUIRED']}}}})
  @ApiResponse({status:401,schema:errorSchema}) @ApiResponse({status:403,schema:errorSchema}) @ApiResponse({status:422,schema:errorSchema}) @ApiResponse({status:503,schema:errorSchema})
  async changeTemporaryPassword(@Body() body:unknown,@Req() request:{headers?:Record<string,string|string[]|undefined>},@Res({passthrough:true}) response:{setHeader(name:string,value:string|string[]):void}) {
    if(!body || typeof body!=='object' || Array.isArray(body)) throw new BadRequestException();
    const data=body as Record<string,unknown>;
    if(Object.keys(data).some(key=>!['currentPassword','newPassword','declaredAdult'].includes(key)) || typeof data.currentPassword!=='string' || typeof data.newPassword!=='string' || data.declaredAdult!==true) throw new BadRequestException({code:'INVALID_ARGUMENT'});
    const raw=request.headers?.cookie;
    const result=await this.sessionService.changeTemporaryPassword({sessionToken:extractOrganizerSessionCookie(Array.isArray(raw)?raw.join('; '):raw),csrfToken:readSingleHeader(request.headers,'x-csrf-token'),originHeader:readSingleHeader(request.headers,'origin'),currentPassword:data.currentPassword,newPassword:data.newPassword,declaredAdult:true});
    response.setHeader('Cache-Control','no-store'); response.setHeader('Set-Cookie',result.setCookieHeaders);
    return {outcome:result.outcome};
  }

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
