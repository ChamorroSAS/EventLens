import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import {
  AdminAuthenticationService,
  AuthenticationError,
  serializeSessionCookie,
  type AdminSessionProjection,
  type AuditEventRecord,
  type AuditSink,
  type RecoveryAuthorityPort
} from '@eventlens/identity';
import { DatabaseService } from '../platform/database/database.service.js';
import type { PlatformConfig } from '../platform/config/config.js';
import { ORGANIZER_SESSION_CONFIG } from './organizer-session.service.js';

export const ADMIN_RECOVERY_AUTHORITY = Symbol('ADMIN_RECOVERY_AUTHORITY');

function unavailableRecoveryAuthority(): RecoveryAuthorityPort {
  const unavailable = async (): Promise<never> => {
    throw new AuthenticationError('AUTHORITY_UNAVAILABLE', 'Administrative RecoveryAuthority is not configured');
  };
  return {
    getRecoveryEpoch: unavailable,
    getCredentialRevision: unavailable,
    getAdminAuthWatermark: unavailable
  };
}

@Injectable()
export class AdminSessionService {
  private readonly authService: AdminAuthenticationService;
  private readonly auditSink: AuditSink;
  private readonly recoveryAuthority: RecoveryAuthorityPort;
  private readonly authorityConfigured: boolean;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ORGANIZER_SESSION_CONFIG) private readonly config: PlatformConfig,
    @Optional() @Inject(ADMIN_RECOVERY_AUTHORITY) recoveryAuthorityOverride?: RecoveryAuthorityPort
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

    this.authorityConfigured = recoveryAuthorityOverride != null;
    this.recoveryAuthority = recoveryAuthorityOverride ?? unavailableRecoveryAuthority();

    this.authService = new AdminAuthenticationService(this.database.transactions, {
      allowedOrigins: [this.config.webOrigin],
      externalAuditSink: this.auditSink,
      recoveryAuthority: this.recoveryAuthority
    });
  }

  getRecoveryAuthority(): RecoveryAuthorityPort {
    return this.recoveryAuthority;
  }

  getAuthService(): AdminAuthenticationService {
    return this.authService;
  }

  async loginAdmin(params: {
    identifier?: unknown;
    secret?: unknown;
    originHeader?: string;
    clientHeader?: string;
  }): Promise<{
    principal: { id: string; identifier: string };
    csrfToken: string;
    setCookieHeaders: string[];
  }> {
    if (typeof params.identifier !== 'string' || !params.identifier.trim()) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid administrative credentials'
      });
    }

    if (typeof params.secret !== 'string' || !params.secret) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid administrative credentials'
      });
    }

    if (!params.originHeader || params.originHeader !== this.config.webOrigin) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Origin is not allowlisted for administrative operations'
      });
    }

    if (params.clientHeader !== '1') {
      throw new ForbiddenException({
        code: 'UNAUTHENTICATED',
        message: 'Missing required administrative client header'
      });
    }

    try {
      this.assertAuthorityConfigured();
      const result = await this.authService.authenticate({
        identifier: params.identifier,
        secret: params.secret,
        origin: params.originHeader,
        customHeaderPresent: true
      });

      return {
        principal: {
          id: result.actorContext.principalId,
          identifier: result.actorContext.identifier
        },
        csrfToken: result.csrfToken,
        setCookieHeaders: [serializeSessionCookie(result.cookieSpec)]
      };
    } catch (err) {
      this.mapAuthError(err);
    }
  }

  async getSessionProjection(sessionToken: string | undefined): Promise<AdminSessionProjection> {
    if (!sessionToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session token is required'
      });
    }

    try {
      this.assertAuthorityConfigured();
      const actorContext = await this.authService.validateSession({
        sessionToken
      });

      return {
        state: 'ADMIN_ACTIVE',
        principal: {
          id: actorContext.principalId,
          identifier: actorContext.identifier
        },
        authTime: actorContext.authTime.toISOString()
      };
    } catch (err) {
      this.mapAuthError(err);
    }
  }

  async renewSessionContext(params: {
    sessionToken: string | undefined;
    originHeader?: string;
    clientHeader?: string;
  }): Promise<{ csrfToken: string }> {
    if (!params.sessionToken) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Session token is required'
      });
    }

    if (!params.originHeader || params.originHeader !== this.config.webOrigin) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Origin is not allowlisted for administrative operations'
      });
    }

    if (params.clientHeader !== '1') {
      throw new ForbiddenException({
        code: 'UNAUTHENTICATED',
        message: 'Missing required administrative client header'
      });
    }

    try {
      this.assertAuthorityConfigured();
      const result = await this.authService.renewSessionContext({
        sessionToken: params.sessionToken,
        origin: params.originHeader,
        customHeaderPresent: true
      });

      return {
        csrfToken: result.csrfToken
      };
    } catch (err) {
      this.mapAuthError(err);
    }
  }

  async logoutAdmin(params: {
    sessionToken: string | undefined;
    originHeader?: string;
    csrfTokenHeader?: string;
  }): Promise<{
    outcome: 'LOGGED_OUT';
    setCookieHeaders: string[];
  }> {
    if (!params.sessionToken) {
      // Idempotent logout
      return {
        outcome: 'LOGGED_OUT',
        setCookieHeaders: [
          '__Host-el_admin_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'
        ]
      };
    }

    if (!params.originHeader || params.originHeader !== this.config.webOrigin) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Origin is not allowlisted for administrative operations'
      });
    }

    if (!params.csrfTokenHeader) {
      throw new ForbiddenException({
        code: 'CSRF_VALIDATION_FAILED',
        message: 'CSRF token is required'
      });
    }

    try {
      this.assertAuthorityConfigured();
      await this.authService.logout({
        sessionToken: params.sessionToken,
        origin: params.originHeader,
        csrfToken: params.csrfTokenHeader
      });

      return {
        outcome: 'LOGGED_OUT',
        setCookieHeaders: [
          '__Host-el_admin_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'
        ]
      };
    } catch (err) {
      this.mapAuthError(err);
    }
  }

  private assertAuthorityConfigured(): void {
    if (!this.authorityConfigured) {
      throw new AuthenticationError('AUTHORITY_UNAVAILABLE', 'Administrative RecoveryAuthority is not configured');
    }
  }

  private mapAuthError(err: unknown): never {
    if (err instanceof HttpException) {
      throw err;
    }
    if (err instanceof AuthenticationError) {
      switch (err.code) {
        case 'INVALID_ORIGIN':
        case 'CSRF_VALIDATION_FAILED':
          throw new ForbiddenException({ code: err.code, message: err.message });
        case 'UNAUTHENTICATED':
        case 'SESSION_EXPIRED':
        case 'SESSION_REVOKED':
        case 'SESSION_NOT_FOUND':
          throw new UnauthorizedException({ code: err.code, message: err.message });
        case 'AUTHORITY_UNAVAILABLE':
        case 'RATE_LIMITED':
        case 'TEMPORARY_FAILURE':
          throw new ServiceUnavailableException({ code: err.code, message: err.message });
        default:
          throw new UnauthorizedException({ code: err.code, message: err.message });
      }
    }
    throw new ServiceUnavailableException({
      code: 'TEMPORARY_FAILURE',
      message: 'Administrative service temporarily unavailable'
    });
  }
}
