import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaTransactions } from '@eventlens/database';
import type { OrganizerActorContext } from '@eventlens/identity';
import {
  EventPublicAccessService,
  GuestSessionService,
  EventManagementError,
  type EventAuditSink,
  type EventAuditRecord
} from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const describeIntegration = databaseUrl ? describe : describe.skip;

describeIntegration('Guest Access Lifecycle Integration Tests (PostgreSQL 16 — EL-EP-004)', () => {
  const client = createPrismaClient(databaseUrl!);
  const txs = new PrismaTransactions(client, 10000);

  async function sql(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.execute(statement, ...args));
  }

  async function query<T extends object>(statement: string, ...args: unknown[]) {
    return txs.run((tx) => tx.query<T>(statement, ...args));
  }

  let auditEvents: EventAuditRecord[] = [];
  const auditSink: EventAuditSink = {
    async record(event: EventAuditRecord) {
      auditEvents.push(event);
    }
  };

  const publicAccessService = new EventPublicAccessService(txs, auditSink);
  const guestSessionService = new GuestSessionService(txs, auditSink);

  beforeEach(() => {
    auditEvents = [];
  });

  it('ejecuta el ciclo completo de acceso, PIN, revocación de sesiones, regeneración y Mis aportes', async () => {
    const organizerId = randomUUID();
    const eventId = randomUUID();
    const actorContext: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: organizerId
    };

    // 1. Seed active event
    await sql(
      `INSERT INTO event (
         id, organizer_id, name, status, timezone, pin_enabled, uploads_enabled, guest_gallery_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, 'ACTIVE', 'America/Bogota', false, true, true, NOW(), NOW())`,
      eventId,
      organizerId,
      'Fiesta Integrada'
    );

    // 2. Issue initial public credential (EL-TK-084)
    const initialCredResult = await publicAccessService.issueInitialCredential({
      actorContext,
      eventId
    });
    expect(initialCredResult.credential.generation).toBe(1);
    expect(initialCredResult.credential.pinRequired).toBe(false);
    const lookupKey1 = initialCredResult.credential.lookupKey;

    // 3. Create guest session 1 without PIN (EL-TK-075)
    const session1Result = await guestSessionService.createGuestSession({
      lookupKey: lookupKey1
    });
    const token1 = session1Result.session.token;
    expect(session1Result.session.id).toBeTruthy();

    // Verify session 1 is currently active
    const resolvedSession1 = await guestSessionService.resolveGuestSession(token1);
    expect(resolvedSession1.revokedAt).toBeNull();

    // 4. Organizer changes PIN to '123456' (EL-TK-079) -> Revokes session 1 (DEC-083)
    const pinUpdateResult = await publicAccessService.updateEventPin({
      actorContext,
      eventId,
      action: 'CHANGE_PIN',
      newPin: '123456'
    });
    expect(pinUpdateResult.pinEnabled).toBe(true);
    expect(pinUpdateResult.revokedSessionsCount).toBeGreaterThanOrEqual(1);

    // Verify session 1 is now revoked
    await expect(guestSessionService.resolveGuestSession(token1)).rejects.toThrowError(
      /Guest session has been revoked/
    );

    // 5. Create guest session 2 using the new PIN
    const session2Result = await guestSessionService.createGuestSession({
      lookupKey: lookupKey1,
      pin: '123456'
    });
    const token2 = session2Result.session.token;
    expect(session2Result.session.id).toBeTruthy();

    // Verify session 2 is active
    const resolvedSession2 = await guestSessionService.resolveGuestSession(token2);
    expect(resolvedSession2.revokedAt).toBeNull();

    // 6. Seed upload attempt for session 2 and query Mis aportes (EL-TK-078)
    const attemptId = randomUUID();
    const reservationId = randomUUID();
    await sql(
      `INSERT INTO upload_attempt (
         id, event_id, guest_session_id, reservation_id, idempotency_key, declared_size, declared_type,
         contributor_nickname, status, actual_size, detected_type, created_at, expires_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, 1024, 'PHOTO', 'Amigo', 'ACCEPTED', 1020, 'image/jpeg', NOW(), NOW() + interval '1 hour', NOW())`,
      attemptId,
      eventId,
      session2Result.session.id,
      reservationId,
      'idemp-1'
    );

    const contributionsResult = await guestSessionService.getGuestContributions({
      sessionToken: token2
    });
    expect(contributionsResult.totalCount).toBe(1);
    expect(contributionsResult.acceptedCount).toBe(1);
    expect(contributionsResult.items[0].attemptId).toBe(attemptId);

    // 7. Regenerate public credential (EL-TK-080) -> Revokes session 2, increments generation to 2
    const regenResult = await publicAccessService.regeneratePublicCredential({
      actorContext,
      eventId
    });
    expect(regenResult.outcome).toBe('REGENERATED');
    expect(regenResult.previousGeneration).toBe(1);
    expect(regenResult.credential.generation).toBe(2);
    expect(regenResult.credential.lookupKey).not.toBe(lookupKey1);
    expect(regenResult.revokedSessionsCount).toBeGreaterThanOrEqual(1);

    // Verify session 2 is now revoked
    await expect(guestSessionService.resolveGuestSession(token2)).rejects.toThrowError(
      /Guest session has been revoked/
    );

    // Old lookup key 1 is now revoked
    await expect(
      publicAccessService.resolvePublicAccess({ lookupKey: lookupKey1 })
    ).rejects.toThrowError(/invalid or has been revoked/);

    // 8. Query share access snapshot (EL-TK-081) -> Returns new credential and QR SVG
    const shareSnapshot = await publicAccessService.getShareAccessSnapshot({
      actorContext,
      eventId,
      baseUrl: 'https://eventlens.app'
    });
    expect(shareSnapshot.generation).toBe(2);
    expect(shareSnapshot.lookupKey).toBe(regenResult.credential.lookupKey);
    expect(shareSnapshot.qrSvg).toContain('<svg');
    expect(shareSnapshot.pinRequired).toBe(true);

    // 9. Query removal intake route without session (EL-TK-082)
    const removalRoute = await publicAccessService.getRemovalIntakeRoute({
      lookupKey: regenResult.credential.lookupKey,
      baseUrl: 'https://eventlens.app'
    });
    expect(removalRoute.eventId).toBe(eventId);
    expect(removalRoute.intakePath).toContain('/removal-request?eventId=' + eventId);
    expect(removalRoute.requiresSession).toBe(false);
    expect(removalRoute.disclaimer).toContain('La recepción de esta solicitud');
  });
});
