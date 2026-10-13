import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import {
  AuthenticationError,
  OrganizerAuthenticationService,
  deriveOrganizerCsrfToken,
  projectOrganizerEffectiveSession,
  serializeOrganizerSessionCookie,
  type AuditEventRecord,
  type AuditSink,
  type OrganizerEffectiveSessionProjection,
  type RecoveryAuthorityPort,
  type ValidateOrganizerSessionResult
} from '@eventlens/identity';
import { DatabaseService } from '../platform/database/database.service.js';
import type { PlatformConfig } from '../platform/config/config.js';

export const ORGANIZER_SESSION_CONFIG = Symbol('ORGANIZER_SESSION_CONFIG');

export function extractOrganizerSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return undefined;
  }
  const parts = cookieHeader.split(';');
  let fallbackSession: string | undefined;
  for (const rawPart of parts) {
    const trimmed = rawPart.trim();
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    if (!rawValue) continue;
    let decoded = rawValue;
    try {
      decoded = decodeURIComponent(rawValue);
    } catch {
      continue;
    }
    if (name === '__Host-el_session') {
      return decoded;
    }
    if (name === 'el_session' && fallbackSession === undefined) {
      fallbackSession = decoded;
    }
  }
  return fallbackSession;
}

export function buildExpiredOrganizerSessionCookies(includeHttpFallback: boolean): string[] {
  const cookies = [
    '__Host-el_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'
  ];
  if (includeHttpFallback) {
    cookies.push('el_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  }
  return cookies;
}

@Injectable()
export class OrganizerSessionService {
  private readonly authService: OrganizerAuthenticationService;
  private readonly auditSink: AuditSink;
  private readonly recoveryAuthority: RecoveryAuthorityPort;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ORGANIZER_SESSION_CONFIG) private readonly config: PlatformConfig
  ) {
    this.auditSink = {
      record: async (event: AuditEventRecord) => {
        await this.database.transactions.run((tx) =>
          tx.execute(
            `INSERT INTO admin_audit_event (
               id, procedure, actor_id, target_identifier, target_principal_id, result, details, timestamp
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            event.id,
            event.procedure,
            event.actorId,
            event.targetIdentifier,
            event.targetPrincipalId ?? null,
            event.result,
            event.details ?? null,
            event.timestamp
          )
        );
      }
    };

    const readActiveCredentialRevision = async (principalId: string): Promise<bigint | null> => {
      const rows = await this.database.transactions.run((tx) =>
        tx.query<{ revision: bigint | number | string }>(
          `SELECT revision
           FROM organizer_credential
           WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
           ORDER BY revision DESC
           LIMIT 1`,
          principalId
        )
      );
      return rows.length > 0 ? BigInt(rows[0].revision) : null;
    };

    this.recoveryAuthority = {
      getRecoveryEpoch: async () => 1n,
      getCredentialRevision: readActiveCredentialRevision,
      getAdminAuthWatermark: async (principalId: string) =>
        (await readActiveCredentialRevision(principalId)) ?? 1n
    };

    this.authService = new OrganizerAuthenticationService(
      this.database.transactions,
      this.auditSink,
      this.recoveryAuthority
    );
  }

  getAuthService(): OrganizerAuthenticationService {
    return this.authService;
  }

  getAuditSink(): AuditSink {
    return this.auditSink;
  }

  getRecoveryAuthority(): RecoveryAuthorityPort {
    return this.recoveryAuthority;
  }

  isLocalHttpOrigin(): boolean {
    return this.config.webOrigin.startsWith('http://');
  }

  async getEffectiveSessionProjection(rawSessionToken?: string): Promise<{
    projection: Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>;
    transientCsrfToken?: string;
  }> {
    try {
      const rawProjection = await this.authService.projectSession({
        sessionToken: rawSessionToken
      });
      const transientCsrfToken =
        rawProjection.state !== 'ANONYMOUS' && rawSessionToken
          ? rawProjection.csrfToken ?? deriveOrganizerCsrfToken(rawSessionToken)
          : undefined;
      return {
        projection: {
          state: rawProjection.state,
          capabilities: rawProjection.capabilities,
          account: rawProjection.account
        },
        transientCsrfToken
      };
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  assertTrustedOrigin(originHeader: string | undefined): void {
    if (!originHeader || originHeader !== this.config.webOrigin) {
      throw new ForbiddenException();
    }
  }

  async loginOrganizer(params: {
    email: unknown;
    password: unknown;
    originHeader?: string;
  }): Promise<{
    projection: Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>;
    transientCsrfToken: string;
    setCookieHeaders: string[];
  }> {
    this.assertTrustedOrigin(params.originHeader);
    if (
      typeof params.email !== 'string' ||
      typeof params.password !== 'string' ||
      !params.email.trim() ||
      !params.password
    ) {
      throw new UnauthorizedException();
    }

    try {
      const loginResult = await this.authService.login({
        email: params.email,
        password: params.password,
        origin: params.originHeader
      });

      const setCookieHeaders = [serializeOrganizerSessionCookie(loginResult.cookieSpec)];
      if (this.isLocalHttpOrigin()) {
        setCookieHeaders.push(
          `el_session=${encodeURIComponent(loginResult.sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${loginResult.cookieSpec.maxAgeSeconds}`
        );
      }

      return {
        projection: {
          state: loginResult.projection.state,
          capabilities: loginResult.projection.capabilities,
          account: loginResult.projection.account
        },
        transientCsrfToken: loginResult.csrfToken,
        setCookieHeaders
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        if (error.code === 'RATE_LIMITED') {
          throw new HttpException('Too Many Requests', 429);
        }
        if (error.code === 'FORBIDDEN' || error.code === 'INVALID_ORIGIN') {
          throw new ForbiddenException();
        }
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
  }

  async logoutOrganizer(params: {
    sessionToken?: string;
    csrfToken?: string;
    originHeader?: string;
  }): Promise<{
    outcome: 'LOGGED_OUT' | 'ALREADY_EXPIRED_OR_REVOKED';
    projection: Omit<OrganizerEffectiveSessionProjection, 'csrfToken'>;
    setCookieHeaders: string[];
  }> {
    this.assertTrustedOrigin(params.originHeader);
    const expiredCookies = buildExpiredOrganizerSessionCookies(this.isLocalHttpOrigin());
    const anonymousProjection = projectOrganizerEffectiveSession({ actorContext: null });

    if (!params.sessionToken || !params.sessionToken.trim()) {
      return {
        outcome: 'ALREADY_EXPIRED_OR_REVOKED',
        projection: {
          state: anonymousProjection.state,
          capabilities: anonymousProjection.capabilities,
          account: anonymousProjection.account
        },
        setCookieHeaders: expiredCookies
      };
    }

    let validated: ValidateOrganizerSessionResult;
    try {
      validated = await this.authService.validateSession({
        sessionToken: params.sessionToken,
        csrfToken: params.csrfToken,
        requireCsrf: true
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        if (
          error.code === 'FORBIDDEN' ||
          error.code === 'CSRF_VALIDATION_FAILED' ||
          error.code === 'INVALID_ORIGIN'
        ) {
          throw new ForbiddenException();
        }
        // Session is already expired or revoked: expire cookie and confirm anonymous state
        return {
          outcome: 'ALREADY_EXPIRED_OR_REVOKED',
          projection: {
            state: anonymousProjection.state,
            capabilities: anonymousProjection.capabilities,
            account: anonymousProjection.account
          },
          setCookieHeaders: expiredCookies
        };
      }
      throw new ServiceUnavailableException();
    }

    try {
      await this.authService.logout({
        actorContext: validated.actorContext
      });
      return {
        outcome: 'LOGGED_OUT',
        projection: {
          state: anonymousProjection.state,
          capabilities: anonymousProjection.capabilities,
          account: anonymousProjection.account
        },
        setCookieHeaders: expiredCookies
      };
    } catch {
      throw new ServiceUnavailableException();
    }
  }

  async validateMutatingOrganizerSession(params: {
    sessionToken?: string;
    csrfToken?: string;
    originHeader?: string;
  }): Promise<ValidateOrganizerSessionResult> {
    this.assertTrustedOrigin(params.originHeader);
    if (!params.sessionToken) {
      throw new UnauthorizedException();
    }
    if (!params.csrfToken || params.csrfToken.trim() === '') {
      throw new ForbiddenException();
    }
    try {
      return await this.authService.validateSession({
        sessionToken: params.sessionToken,
        csrfToken: params.csrfToken,
        requireCsrf: true
      });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        if (
          error.code === 'FORBIDDEN' ||
          error.code === 'CSRF_VALIDATION_FAILED' ||
          error.code === 'INVALID_ORIGIN'
        ) {
          throw new ForbiddenException();
        }
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
  }

  async validateReadOrganizerSession(params: {
    sessionToken?: string;
    requireOrdinarySession?: boolean;
  }): Promise<ValidateOrganizerSessionResult> {
    if (!params.sessionToken || !params.sessionToken.trim()) {
      throw new UnauthorizedException();
    }
    try {
      const validated = await this.authService.validateSession({
        sessionToken: params.sessionToken,
        requireCsrf: false
      });
      if (
        params.requireOrdinarySession &&
        validated.actorContext.restrictedContext === 'DELETION_MANAGEMENT_ONLY'
      ) {
        throw new ForbiddenException();
      }
      return validated;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      if (error instanceof AuthenticationError) {
        if (error.code === 'FORBIDDEN') {
          throw new ForbiddenException();
        }
        throw new UnauthorizedException();
      }
      throw new ServiceUnavailableException();
    }
  }
}
