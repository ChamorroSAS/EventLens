import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { OrganizerAuthenticationService, type OrganizerActorContext } from '@eventlens/identity';
import { DatabaseService } from '../database/database.service.js';
import { readCookie } from './cookies.js';

const SESSION_COOKIE = '__Host-el_session';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Resolves the organizer actor from the validated session cookie and enforces CSRF double-submit
 * on state-changing requests. The actor context is always derived server-side, never from payload.
 */
@Injectable()
export class OrganizerSessionGuard implements CanActivate {
  constructor(
    @Inject(OrganizerAuthenticationService) private readonly authentication: OrganizerAuthenticationService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = readCookie(request.headers?.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException();

    let actorContext: OrganizerActorContext;
    try {
      ({ actorContext } = await this.authentication.validateSession({ sessionToken: token }));
    } catch {
      throw new UnauthorizedException();
    }
    request.organizerActor = actorContext;

    if (!SAFE_METHODS.has(String(request.method).toUpperCase())) {
      await this.assertCsrf(actorContext.sessionId, request.headers?.[CSRF_HEADER]);
    }
    return true;
  }

  private async assertCsrf(sessionId: string, provided: unknown): Promise<void> {
    if (typeof provided !== 'string' || provided.length === 0) throw new ForbiddenException();
    const expected = await this.database.transactions.run((tx) =>
      tx.query<{ csrf_token_digest: string }>(
        `SELECT csrf_token_digest FROM organizer_session WHERE id = $1`,
        sessionId
      )
    );
    if (!expected.length) throw new ForbiddenException();
    const providedDigest = Buffer.from(createHash('sha256').update(provided).digest('hex'));
    const expectedDigest = Buffer.from(expected[0].csrf_token_digest);
    if (providedDigest.length !== expectedDigest.length || !timingSafeEqual(providedDigest, expectedDigest)) {
      throw new ForbiddenException();
    }
  }
}
