import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  Post,
  Req,
  Res
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from '@nestjs/swagger';
import {
  EventManagementError,
  EventPublicAccessService,
  GuestSessionService,
  type GuestContributionItem,
  type GuestSessionRecord,
  type RemovalIntakeRouteResult
} from '@eventlens/event-management';
import { DatabaseService } from '../platform/database/database.service.js';
import { ORGANIZER_SESSION_CONFIG } from '../identity/organizer-session.service.js';
import type { PlatformConfig } from '../platform/config/config.js';
import { errorSchema } from '../platform/health/health.controller.js';

export const GUEST_SESSION_COOKIE_NAME = 'el_guest_session';
const GUEST_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface GuestSessionReceiptDto {
  id: string;
  eventId: string;
  credentialGeneration: number;
  contributorNickname: string | null;
  hasConsented: boolean;
  consentVersion: string | null;
}

export interface GuestContributionItemDto {
  attemptId: string;
  mediaType: 'PHOTO' | 'VIDEO';
  status: string;
  declaredSize: number;
  actualSize: number | null;
  detectedType: string | null;
  durationSeconds: number | null;
  createdAt: string;
  rejectionReason: string | null;
}

export interface GuestPublicAccessDto {
  accessState: 'ALLOWED' | 'RESTRICTED' | 'UNAVAILABLE';
  eventId: string;
  name: string;
  status: string;
  timezone: string;
  generation: number;
  pinRequired: boolean;
  canViewLanding: boolean;
  canUpload: boolean;
  canViewGallery: boolean;
  restrictionReason?: string;
}

export interface GuestPublicEntryResolutionResponseDto {
  access: GuestPublicAccessDto;
  session: GuestSessionReceiptDto | null;
  contributions: GuestContributionItemDto[];
}

export const guestSessionReceiptSchema = {
  type: 'object',
  nullable: true,
  required: [
    'id',
    'eventId',
    'credentialGeneration',
    'contributorNickname',
    'hasConsented',
    'consentVersion'
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    eventId: { type: 'string', format: 'uuid' },
    credentialGeneration: { type: 'integer', minimum: 1 },
    contributorNickname: { type: 'string', nullable: true },
    hasConsented: { type: 'boolean' },
    consentVersion: { type: 'string', nullable: true }
  }
};

export const guestContributionItemSchema = {
  type: 'object',
  required: [
    'attemptId',
    'mediaType',
    'status',
    'declaredSize',
    'actualSize',
    'detectedType',
    'durationSeconds',
    'createdAt',
    'rejectionReason'
  ],
  properties: {
    attemptId: { type: 'string', format: 'uuid' },
    mediaType: { type: 'string', enum: ['PHOTO', 'VIDEO'] },
    status: { type: 'string' },
    declaredSize: { type: 'integer' },
    actualSize: { type: 'integer', nullable: true },
    detectedType: { type: 'string', nullable: true },
    durationSeconds: { type: 'number', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    rejectionReason: { type: 'string', nullable: true }
  }
};

export const guestPublicAccessSchema = {
  type: 'object',
  required: [
    'accessState',
    'eventId',
    'name',
    'status',
    'timezone',
    'generation',
    'pinRequired',
    'canViewLanding',
    'canUpload',
    'canViewGallery'
  ],
  properties: {
    accessState: {
      type: 'string',
      enum: ['ALLOWED', 'RESTRICTED', 'UNAVAILABLE']
    },
    eventId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: { type: 'string' },
    timezone: { type: 'string' },
    generation: { type: 'integer', minimum: 1 },
    pinRequired: { type: 'boolean' },
    canViewLanding: { type: 'boolean' },
    canUpload: { type: 'boolean' },
    canViewGallery: { type: 'boolean' },
    restrictionReason: { type: 'string' }
  }
};

export const guestPublicEntryResolutionSchema = {
  type: 'object',
  required: ['access', 'session', 'contributions'],
  properties: {
    access: guestPublicAccessSchema,
    session: guestSessionReceiptSchema,
    contributions: {
      type: 'array',
      items: guestContributionItemSchema
    }
  }
};

export const createGuestSessionRequestSchema = {
  type: 'object',
  properties: {
    pin: { type: 'string' }
  }
};

export const createGuestSessionResponseSchema = {
  type: 'object',
  required: ['session', 'contributions'],
  properties: {
    session: {
      ...guestSessionReceiptSchema,
      nullable: false
    },
    contributions: {
      type: 'array',
      items: guestContributionItemSchema
    }
  }
};

export const recordGuestConsentRequestSchema = {
  type: 'object',
  required: ['documentVersion', 'accepted'],
  properties: {
    documentVersion: { type: 'string' },
    accepted: { type: 'boolean' }
  }
};

export const recordGuestConsentResponseSchema = {
  type: 'object',
  required: ['session', 'outcome'],
  properties: {
    session: {
      ...guestSessionReceiptSchema,
      nullable: false
    },
    outcome: {
      type: 'string',
      enum: ['RECORDED', 'IDEMPOTENT_REPLAY']
    }
  }
};

export const setGuestNicknameRequestSchema = {
  type: 'object',
  required: ['nickname'],
  properties: {
    nickname: { type: 'string' }
  }
};

export const setGuestNicknameResponseSchema = {
  type: 'object',
  required: ['session'],
  properties: {
    session: {
      ...guestSessionReceiptSchema,
      nullable: false
    }
  }
};

export const guestOwnContributionsResponseSchema = {
  type: 'object',
  required: ['session', 'contributions', 'totalCount', 'acceptedCount'],
  properties: {
    session: {
      ...guestSessionReceiptSchema,
      nullable: false
    },
    contributions: {
      type: 'array',
      items: guestContributionItemSchema
    },
    totalCount: { type: 'integer' },
    acceptedCount: { type: 'integer' }
  }
};

export const guestRemovalIntakeRouteSchema = {
  type: 'object',
  required: [
    'eventId',
    'eventName',
    'intakePath',
    'disclaimer',
    'requiresSession'
  ],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    eventName: { type: 'string' },
    intakePath: { type: 'string' },
    disclaimer: { type: 'string' },
    requiresSession: { type: 'boolean', enum: [false] }
  }
};

export function extractGuestSessionCookie(
  cookieHeader: string | undefined
): string | undefined {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return undefined;
  }
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const name = trimmed.slice(0, eqIndex).trim();
    if (name === GUEST_SESSION_COOKIE_NAME) {
      const val = trimmed.slice(eqIndex + 1).trim();
      return val.length > 0 ? decodeURIComponent(val) : undefined;
    }
  }
  return undefined;
}

function buildGuestSessionSetCookie(
  rawToken: string,
  isHttps: boolean
): string {
  const securePart = isHttps ? '; Secure' : '';
  return `${GUEST_SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${GUEST_SESSION_MAX_AGE_SECONDS}${securePart}`;
}

function buildClearGuestSessionSetCookie(isHttps: boolean): string {
  const securePart = isHttps ? '; Secure' : '';
  return `${GUEST_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${securePart}`;
}

function mapGuestSessionRecordToReceipt(
  record: GuestSessionRecord
): GuestSessionReceiptDto {
  return {
    id: record.id,
    eventId: record.eventId,
    credentialGeneration: record.credentialGeneration,
    contributorNickname: record.contributorNickname,
    hasConsented: record.consentRecordedAt !== null,
    consentVersion: record.consentVersion
  };
}

function mapContributionItemToDto(
  item: GuestContributionItem
): GuestContributionItemDto {
  return {
    attemptId: item.attemptId,
    mediaType: item.mediaType,
    status: item.status,
    declaredSize: Number(item.declaredSize),
    actualSize: item.actualSize !== null ? Number(item.actualSize) : null,
    detectedType: item.detectedType,
    durationSeconds: item.durationSeconds,
    createdAt: item.createdAt.toISOString(),
    rejectionReason: item.rejectionReason
  };
}

function mapGuestManagementError(error: unknown): never {
  if (error instanceof HttpException) {
    throw error;
  }

  if (error instanceof EventManagementError) {
    switch (error.code) {
      case 'INVALID_CREDENTIAL':
      case 'EVENT_NOT_FOUND':
      case 'CREDENTIAL_NOT_FOUND':
        throw new HttpException(
          {
            code: 'GUEST_ENTRY_NOT_FOUND',
            message: 'El enlace de acceso no es válido o ha sido revocado.'
          },
          HttpStatus.NOT_FOUND
        );
      case 'EVENT_NOT_ACCESSIBLE':
      case 'EVENT_TERMINAL':
        throw new HttpException(
          {
            code: error.code,
            message: 'El evento no se encuentra disponible para esta acción.'
          },
          HttpStatus.FORBIDDEN
        );
      case 'PIN_REQUIRED':
      case 'INVALID_PIN_FORMAT':
        throw new HttpException(
          {
            code: error.code,
            message: 'Debes ingresar un código PIN numérico de 6 dígitos.'
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      case 'INVALID_PIN':
        throw new HttpException(
          {
            code: 'INVALID_PIN',
            message: 'El código PIN ingresado es incorrecto.'
          },
          HttpStatus.UNAUTHORIZED
        );
      case 'RATE_LIMIT_EXCEEDED':
        throw new HttpException(
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message:
              'Demasiados intentos fallidos de PIN. Espera unos minutos antes de volver a intentarlo.'
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      case 'UNAUTHORIZED':
      case 'SESSION_REVOKED':
      case 'SESSION_EXPIRED':
        throw new HttpException(
          {
            code: 'GUEST_SESSION_INVALID',
            message: 'Tu sesión de invitado ha expirado o fue revocada.'
          },
          HttpStatus.UNAUTHORIZED
        );
      case 'CONSENT_REJECTED':
      case 'INVALID_CONSENT_VERSION':
        throw new HttpException(
          {
            code: error.code,
            message: 'Es necesario aceptar el consentimiento informado antes de continuar.'
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      case 'INVALID_CONTRIBUTOR_NICKNAME':
        throw new HttpException(
          {
            code: 'INVALID_CONTRIBUTOR_NICKNAME',
            message: 'El nombre o apodo debe tener entre 1 y 60 caracteres válidos.'
          },
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      default:
        throw new HttpException(
          {
            code: error.code,
            message: error.message
          },
          HttpStatus.BAD_REQUEST
        );
    }
  }

  throw error;
}

@Injectable()
export class GuestPublicEntryService {
  private readonly publicAccessService: EventPublicAccessService;
  private readonly guestSessionService: GuestSessionService;

  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(ORGANIZER_SESSION_CONFIG)
    private readonly config: PlatformConfig
  ) {
    this.publicAccessService = new EventPublicAccessService(
      this.databaseService.transactions
    );
    this.guestSessionService = new GuestSessionService(
      this.databaseService.transactions
    );
  }

  private isHttps(): boolean {
    return (
      this.config.webOrigin.startsWith('https://') ||
      this.config.publicEntryBaseUrl.startsWith('https://')
    );
  }

  async resolveEntry(params: {
    lookupKey: string;
    cookieToken: string | undefined;
  }): Promise<{
    body: GuestPublicEntryResolutionResponseDto;
    setCookieHeader?: string;
  }> {
    try {
      const publicAccessService = this.publicAccessService;
      const guestSessionService = this.guestSessionService;

      const resolved = await publicAccessService.resolvePublicAccess({
        lookupKey: params.lookupKey
      });

      const accessDto: GuestPublicAccessDto = {
        accessState: resolved.accessState,
        eventId: resolved.eventId,
        name: resolved.name,
        status: resolved.status,
        timezone: resolved.timezone,
        generation: resolved.generation,
        pinRequired: resolved.pinRequired,
        canViewLanding: resolved.capabilities.canViewLanding,
        canUpload: resolved.capabilities.canUpload,
        canViewGallery: resolved.capabilities.canViewGallery,
        ...(resolved.restrictionReason
          ? { restrictionReason: resolved.restrictionReason }
          : {})
      };

      if (resolved.accessState === 'UNAVAILABLE') {
        return {
          body: {
            access: accessDto,
            session: null,
            contributions: []
          },
          ...(params.cookieToken
            ? {
                setCookieHeader: buildClearGuestSessionSetCookie(this.isHttps())
              }
            : {})
        };
      }

      let activeToken: string | undefined;
      let activeSessionRecord: GuestSessionRecord | null = null;
      let setCookieHeader: string | undefined;

      if (params.cookieToken) {
        try {
          const candidate = await guestSessionService.resolveGuestSession(
            params.cookieToken
          );
          if (
            candidate.eventId === resolved.eventId &&
            candidate.credentialGeneration === resolved.generation
          ) {
            activeToken = params.cookieToken;
            activeSessionRecord = candidate;
          } else {
            setCookieHeader = buildClearGuestSessionSetCookie(this.isHttps());
          }
        } catch {
          setCookieHeader = buildClearGuestSessionSetCookie(this.isHttps());
        }
      }

      // Escenario 3 de EL-TK-075: Evento sin PIN y accesible -> emite sesión inmediatamente
      if (
        !activeSessionRecord &&
        resolved.accessState === 'ALLOWED' &&
        !resolved.pinRequired
      ) {
        const created = await guestSessionService.createGuestSession({
          lookupKey: params.lookupKey
        });
        activeToken = created.session.token;
        activeSessionRecord = await guestSessionService.resolveGuestSession(
          activeToken
        );
        setCookieHeader = buildGuestSessionSetCookie(
          activeToken,
          this.isHttps()
        );
      }

      let contributions: GuestContributionItemDto[] = [];
      if (activeToken && activeSessionRecord) {
        try {
          const ownContribs = await guestSessionService.getGuestContributions({
            sessionToken: activeToken
          });
          contributions = ownContribs.items.map(mapContributionItemToDto);
        } catch {
          contributions = [];
        }
      }

      return {
        body: {
          access: accessDto,
          session: activeSessionRecord
            ? mapGuestSessionRecordToReceipt(activeSessionRecord)
            : null,
          contributions
        },
        ...(setCookieHeader ? { setCookieHeader } : {})
      };
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  async createSessionWithPin(params: {
    lookupKey: string;
    pin: string | undefined;
  }): Promise<{
    body: {
      session: GuestSessionReceiptDto;
      contributions: GuestContributionItemDto[];
    };
    setCookieHeader: string;
  }> {
    try {
      const guestSessionService = this.guestSessionService;
      const created = await guestSessionService.createGuestSession({
        lookupKey: params.lookupKey,
        ...(params.pin !== undefined ? { pin: params.pin } : {})
      });

      const sessionRecord = await guestSessionService.resolveGuestSession(
        created.session.token
      );
      let contributions: GuestContributionItemDto[] = [];
      try {
        const ownContribs = await guestSessionService.getGuestContributions({
          sessionToken: created.session.token
        });
        contributions = ownContribs.items.map(mapContributionItemToDto);
      } catch {
        contributions = [];
      }

      return {
        body: {
          session: mapGuestSessionRecordToReceipt(sessionRecord),
          contributions
        },
        setCookieHeader: buildGuestSessionSetCookie(
          created.session.token,
          this.isHttps()
        )
      };
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  async recordConsent(params: {
    cookieToken: string | undefined;
    documentVersion: string;
    accepted: boolean;
  }): Promise<{
    body: {
      session: GuestSessionReceiptDto;
      outcome: 'RECORDED' | 'IDEMPOTENT_REPLAY';
    };
    clearCookieHeader?: string;
  }> {
    if (!params.cookieToken) {
      throw new HttpException(
        {
          code: 'GUEST_SESSION_REQUIRED',
          message: 'Se requiere una sesión de invitado activa.'
        },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const guestSessionService = this.guestSessionService;
      const result = await guestSessionService.recordConsent({
        sessionToken: params.cookieToken,
        documentVersion: params.documentVersion,
        accepted: params.accepted
      });
      const updated = await guestSessionService.resolveGuestSession(
        params.cookieToken
      );

      return {
        body: {
          session: mapGuestSessionRecordToReceipt(updated),
          outcome: result.outcome
        }
      };
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  async setNickname(params: {
    cookieToken: string | undefined;
    nickname: string;
  }): Promise<{
    body: {
      session: GuestSessionReceiptDto;
    };
  }> {
    if (!params.cookieToken) {
      throw new HttpException(
        {
          code: 'GUEST_SESSION_REQUIRED',
          message: 'Se requiere una sesión de invitado activa.'
        },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const guestSessionService = this.guestSessionService;
      await guestSessionService.setContributorNickname({
        sessionToken: params.cookieToken,
        nickname: params.nickname
      });
      const updated = await guestSessionService.resolveGuestSession(
        params.cookieToken
      );

      return {
        body: {
          session: mapGuestSessionRecordToReceipt(updated)
        }
      };
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  async getOwnContributions(params: {
    cookieToken: string | undefined;
  }): Promise<{
    body: {
      session: GuestSessionReceiptDto;
      contributions: GuestContributionItemDto[];
      totalCount: number;
      acceptedCount: number;
    };
  }> {
    if (!params.cookieToken) {
      throw new HttpException(
        {
          code: 'GUEST_SESSION_REQUIRED',
          message: 'Se requiere una sesión de invitado activa.'
        },
        HttpStatus.UNAUTHORIZED
      );
    }

    try {
      const guestSessionService = this.guestSessionService;
      const session = await guestSessionService.resolveGuestSession(
        params.cookieToken
      );
      const contribs = await guestSessionService.getGuestContributions({
        sessionToken: params.cookieToken
      });

      return {
        body: {
          session: mapGuestSessionRecordToReceipt(session),
          contributions: contribs.items.map(mapContributionItemToDto),
          totalCount: contribs.totalCount,
          acceptedCount: contribs.acceptedCount
        }
      };
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  async getRemovalIntakeRoute(params: {
    lookupKey: string;
  }): Promise<RemovalIntakeRouteResult> {
    try {
      return await this.publicAccessService.getRemovalIntakeRoute({
        lookupKey: params.lookupKey
      });
    } catch (error) {
      mapGuestManagementError(error);
    }
  }

  getClearCookieHeader(): string {
    return buildClearGuestSessionSetCookie(this.isHttps());
  }
}

@ApiTags('guest-public-entry')
@Controller('public')
export class GuestPublicEntryController {
  constructor(
    @Inject(GuestPublicEntryService)
    private readonly guestPublicEntryService: GuestPublicEntryService
  ) {}

  private extractCookieToken(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const rawCookieHeader = request.headers?.cookie;
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader.join('; ')
      : rawCookieHeader;
    return extractGuestSessionCookie(cookieHeader);
  }

  private applySecurityHeaders(response: {
    setHeader(name: string, value: string | string[]): void;
  }): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
  }

  @Get('guest-entry/:lookupKey')
  @ApiOperation({
    operationId: 'resolveGuestPublicEntry',
    summary:
      'Resolver el acceso público guest por lookupKey y recuperar recibo de sesión activa sin exponer tokens'
  })
  @ApiParam({ name: 'lookupKey', type: 'string' })
  @ApiResponse({ status: 200, schema: guestPublicEntryResolutionSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async resolveGuestEntry(
    @Param('lookupKey') lookupKey: string,
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<GuestPublicEntryResolutionResponseDto> {
    this.applySecurityHeaders(response);
    const cookieToken = this.extractCookieToken(request);

    try {
      const result = await this.guestPublicEntryService.resolveEntry({
        lookupKey,
        cookieToken
      });
      if (result.setCookieHeader) {
        response.setHeader('Set-Cookie', result.setCookieHeader);
      }
      return result.body;
    } catch (error) {
      if (cookieToken && error instanceof HttpException && error.getStatus() === 404) {
        response.setHeader(
          'Set-Cookie',
          this.guestPublicEntryService.getClearCookieHeader()
        );
      }
      throw error;
    }
  }

  @Post('guest-entry/:lookupKey/session')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'createGuestEntrySession',
    summary:
      'Verificar PIN opcional y emitir sesión guest mediante cookie HttpOnly devolviendo recibo autoritativo'
  })
  @ApiParam({ name: 'lookupKey', type: 'string' })
  @ApiBody({ schema: createGuestSessionRequestSchema })
  @ApiResponse({ status: 200, schema: createGuestSessionResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 429, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async createGuestSession(
    @Param('lookupKey') lookupKey: string,
    @Body() body: { pin?: unknown } | undefined,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{
    session: GuestSessionReceiptDto;
    contributions: GuestContributionItemDto[];
  }> {
    this.applySecurityHeaders(response);
    const pin = typeof body?.pin === 'string' ? body.pin : undefined;
    const result = await this.guestPublicEntryService.createSessionWithPin({
      lookupKey,
      pin
    });
    response.setHeader('Set-Cookie', result.setCookieHeader);
    return result.body;
  }

  @Post('guest-session/consent')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'recordGuestSessionConsent',
    summary: 'Registrar consentimiento explícito versionado para la sesión guest activa'
  })
  @ApiBody({ schema: recordGuestConsentRequestSchema })
  @ApiResponse({ status: 200, schema: recordGuestConsentResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async recordConsent(
    @Body() body: { documentVersion?: unknown; accepted?: unknown } | undefined,
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{
    session: GuestSessionReceiptDto;
    outcome: 'RECORDED' | 'IDEMPOTENT_REPLAY';
  }> {
    this.applySecurityHeaders(response);
    const cookieToken = this.extractCookieToken(request);
    try {
      const result = await this.guestPublicEntryService.recordConsent({
        cookieToken,
        documentVersion:
          typeof body?.documentVersion === 'string' ? body.documentVersion : '',
        accepted: body?.accepted === true
      });
      return result.body;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) {
        response.setHeader(
          'Set-Cookie',
          this.guestPublicEntryService.getClearCookieHeader()
        );
      }
      throw error;
    }
  }

  @Post('guest-session/nickname')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'setGuestSessionNickname',
    summary: 'Guardar nombre o apodo de aportante en la sesión guest activa'
  })
  @ApiBody({ schema: setGuestNicknameRequestSchema })
  @ApiResponse({ status: 200, schema: setGuestNicknameResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async setNickname(
    @Body() body: { nickname?: unknown } | undefined,
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{
    session: GuestSessionReceiptDto;
  }> {
    this.applySecurityHeaders(response);
    const cookieToken = this.extractCookieToken(request);
    try {
      const result = await this.guestPublicEntryService.setNickname({
        cookieToken,
        nickname: typeof body?.nickname === 'string' ? body.nickname : ''
      });
      return result.body;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) {
        response.setHeader(
          'Set-Cookie',
          this.guestPublicEntryService.getClearCookieHeader()
        );
      }
      throw error;
    }
  }

  @Get('guest-session/contributions')
  @ApiOperation({
    operationId: 'getGuestOwnContributions',
    summary: 'Consultar Mis aportes asociados exclusivamente a la sesión guest activa'
  })
  @ApiResponse({ status: 200, schema: guestOwnContributionsResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async getOwnContributions(
    @Req() request: { headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<{
    session: GuestSessionReceiptDto;
    contributions: GuestContributionItemDto[];
    totalCount: number;
    acceptedCount: number;
  }> {
    this.applySecurityHeaders(response);
    const cookieToken = this.extractCookieToken(request);
    try {
      const result = await this.guestPublicEntryService.getOwnContributions({
        cookieToken
      });
      return result.body;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 401) {
        response.setHeader(
          'Set-Cookie',
          this.guestPublicEntryService.getClearCookieHeader()
        );
      }
      throw error;
    }
  }

  @Get('guest-entry/:lookupKey/removal-intake')
  @ApiOperation({
    operationId: 'getGuestRemovalIntakeRoute',
    summary:
      'Consultar la derivación y aviso oficial de solicitud de retiro sin exigir ni recuperar sesión guest'
  })
  @ApiParam({ name: 'lookupKey', type: 'string' })
  @ApiResponse({ status: 200, schema: guestRemovalIntakeRouteSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  @ApiResponse({ status: 503, schema: errorSchema })
  async getRemovalIntakeRoute(
    @Param('lookupKey') lookupKey: string,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string | string[]): void }
  ): Promise<RemovalIntakeRouteResult> {
    this.applySecurityHeaders(response);
    return this.guestPublicEntryService.getRemovalIntakeRoute({ lookupKey });
  }
}
