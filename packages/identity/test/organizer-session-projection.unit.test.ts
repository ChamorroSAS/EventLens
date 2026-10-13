import { describe, it, expect } from 'vitest';
import {
  computeOrganizerEffectiveCapabilities,
  projectOrganizerEffectiveSession,
  deriveOrganizerCsrfToken,
  type OrganizerActorContext
} from '../src/index.js';

describe('EL-TK-205: Proyección de sesión efectiva de organizador (Unit Tests)', () => {
  it('clasifica una sesión ausente o inválida como ANONYMOUS sin exponer datos privados ni tokens', () => {
    const projection = projectOrganizerEffectiveSession({ actorContext: null });

    expect(projection.state).toBe('ANONYMOUS');
    expect(projection.account).toBeNull();
    expect(projection.csrfToken).toBeUndefined();
    expect(projection.capabilities).toEqual({
      canSignIn: true,
      canRequestBetaAccess: true,
      canAccessMyEvents: false,
      canAccessMyAccount: false,
      canManageSessions: false,
      canManageAccountDeletion: false,
      isDeletionRestricted: false,
      canSignOut: false
    });
  });

  it('clasifica un organizador ACTIVE como ORGANIZER_ACTIVE con capacidades ordinarias y metadata mínima', () => {
    const actorContext: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: '11111111-1111-4111-8111-111111111111',
      email: 'organizer@eventlens.internal',
      sessionId: '22222222-2222-4222-8222-222222222222',
      authTime: new Date('2026-10-12T15:00:00.000Z'),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n
    };
    const csrfToken = deriveOrganizerCsrfToken('a'.repeat(64));

    const projection = projectOrganizerEffectiveSession({
      actorContext,
      emailVerified: true,
      csrfToken
    });

    expect(projection.state).toBe('ORGANIZER_ACTIVE');
    expect(projection.account).toEqual({
      email: 'organizer@eventlens.internal',
      emailVerified: true,
      accountStatus: 'ACTIVE'
    });
    expect(projection.csrfToken).toBe(csrfToken);
    expect(projection.capabilities).toEqual({
      canSignIn: false,
      canRequestBetaAccess: true,
      canAccessMyEvents: true,
      canAccessMyAccount: true,
      canManageSessions: true,
      canManageAccountDeletion: true,
      isDeletionRestricted: false,
      canSignOut: true
    });

    // Datos mínimos: sin accountId, sessionId, credentialRevision, invitationId ni hashes
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(serialized).not.toContain('22222222-2222-4222-8222-222222222222');
    expect(serialized).not.toContain('invitationId');
    expect(serialized).not.toContain('credentialRevision');
  });

  it('clasifica un organizador en PENDING_DELETION como ORGANIZER_RESTRICTED_DELETION bloqueando Mis eventos y sesiones', () => {
    const restrictedActor: OrganizerActorContext = {
      actorType: 'ORGANIZER_HUMAN',
      accountId: '33333333-3333-4333-8333-333333333333',
      email: 'restricted@eventlens.internal',
      sessionId: '44444444-4444-4444-8444-444444444444',
      authTime: new Date('2026-10-12T15:00:00.000Z'),
      credentialRevision: 1n,
      sessionWatermark: 1n,
      recoveryEpoch: 1n,
      restrictedContext: 'DELETION_MANAGEMENT_ONLY'
    };

    const projection = projectOrganizerEffectiveSession({
      actorContext: restrictedActor,
      emailVerified: true,
      csrfToken: deriveOrganizerCsrfToken('b'.repeat(64))
    });

    expect(projection.state).toBe('ORGANIZER_RESTRICTED_DELETION');
    expect(projection.account).toEqual({
      email: 'restricted@eventlens.internal',
      emailVerified: true,
      accountStatus: 'PENDING_DELETION'
    });
    expect(projection.capabilities).toEqual(
      computeOrganizerEffectiveCapabilities('ORGANIZER_RESTRICTED_DELETION')
    );
    expect(projection.capabilities.canAccessMyEvents).toBe(false);
    expect(projection.capabilities.canManageSessions).toBe(false);
    expect(projection.capabilities.canAccessMyAccount).toBe(true);
    expect(projection.capabilities.canManageAccountDeletion).toBe(true);
    expect(projection.capabilities.isDeletionRestricted).toBe(true);
    expect(projection.capabilities.canSignOut).toBe(true);
  });
});
