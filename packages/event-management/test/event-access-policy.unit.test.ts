import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { OrganizerActorContext, AdminActorContext } from '@eventlens/identity';
import {
  EventAccessPolicy,
  type EventRecord,
  type GuestActorContext
} from '../src/index.js';

describe('EL-TK-072: EventAccessPolicy (Unit Tests)', () => {
  const organizerId = randomUUID();

  const ownerActor: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: organizerId,
    email: 'owner@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const otherOrganizer: OrganizerActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: randomUUID(),
    email: 'other@eventlens.local',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const adminActor: AdminActorContext = {
    actorType: 'ADMIN_HUMAN',
    principalId: randomUUID(),
    identifier: 'admin@eventlens.internal',
    sessionId: randomUUID(),
    authTime: new Date(),
    credentialRevision: 1n,
    adminAuthRevision: 1n,
    sessionWatermark: 1n,
    recoveryEpoch: 1n
  };

  const guestWithSession: GuestActorContext = {
    actorType: 'GUEST_ANONYMOUS',
    guestSessionId: randomUUID()
  };

  const guestWithoutSession: GuestActorContext = {
    actorType: 'GUEST_ANONYMOUS'
  };

  function createMockEvent(overrides: Partial<EventRecord> = {}): EventRecord {
    return {
      id: randomUUID(),
      organizerId,
      name: 'Evento de Prueba Policy',
      status: 'ACTIVE',
      timezone: 'America/Bogota',
      startsAtLocal: '2026-11-01 10:00:00',
      scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
      utcOffsetMinutes: -300,
      expiresAt: new Date('2026-12-01T15:00:00.000Z'),
      graceEndsAt: new Date('2026-12-08T15:00:00.000Z'),
      activatedAt: new Date('2026-11-01T15:00:00.000Z'),
      closedAt: null,
      purgeStartedAt: null,
      suspendedAt: null,
      suspensionReason: null,
      previousStatus: null,
      validityDurationDays: 30,
      graceDays: 7,
      uploadsEnabled: true,
      guestGalleryEnabled: true,
      moderationMode: 'AUTO_PUBLISH',
      pinEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  describe('Escenario 1: SCHEDULED', () => {
    it('un invitado puede ver aviso de landing pero no puede cargar ni ver galería abierta', () => {
      const event = createMockEvent({ status: 'SCHEDULED' });

      // Landing autorizada
      const landingDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_VIEW_LANDING'
      });
      expect(landingDecision.allowed).toBe(true);
      expect(landingDecision.code).toBe('ALLOWED');
      expect(EventAccessPolicy.canGuestViewLanding(event)).toBe(true);

      // Carga rechazada
      const uploadDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_UPLOAD'
      });
      expect(uploadDecision.allowed).toBe(false);
      expect(uploadDecision.code).toBe('UPLOADS_DISABLED');
      expect(EventAccessPolicy.canGuestUpload(event)).toBe(false);

      // Galería rechazada
      const galleryDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_VIEW_GALLERY'
      });
      expect(galleryDecision.allowed).toBe(false);
      expect(galleryDecision.code).toBe('GALLERY_DISABLED');
      expect(EventAccessPolicy.canGuestViewGallery(event)).toBe(false);
    });
  });

  describe('Escenario 2: CLOSED y GRACE_PERIOD con excepción DEC-084', () => {
    it('en CLOSED bloquea cargas generales pero permite galería y excepción de Mis aportes/retiros', () => {
      const event = createMockEvent({
        status: 'CLOSED',
        uploadsEnabled: true,
        guestGalleryEnabled: true
      });

      // Carga general bloqueada
      expect(EventAccessPolicy.canGuestUpload(event)).toBe(false);
      const uploadDecision = EventAccessPolicy.evaluate({ event, action: 'GUEST_UPLOAD' });
      expect(uploadDecision.allowed).toBe(false);
      expect(uploadDecision.code).toBe('UPLOADS_DISABLED');

      // Galería general permitida si guestGalleryEnabled está activo
      expect(EventAccessPolicy.canGuestViewGallery(event)).toBe(true);

      // Excepción DEC-084: Invitado con sesión válida PUEDE ver sus propios aportes y pedir retiro
      const ownDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_VIEW_OWN_CONTRIBUTIONS',
        actorContext: guestWithSession
      });
      expect(ownDecision.allowed).toBe(true);
      expect(ownDecision.code).toBe('ALLOWED');
      expect(EventAccessPolicy.canGuestAccessOwnContributions(event, guestWithSession)).toBe(true);

      const removalDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_REQUEST_OWN_REMOVAL',
        actorContext: guestWithSession
      });
      expect(removalDecision.allowed).toBe(true);
      expect(removalDecision.code).toBe('ALLOWED');
      expect(EventAccessPolicy.canGuestRequestRemoval(event, guestWithSession)).toBe(true);

      // Sin sesión válida, la excepción de aportes propios exige sesión
      const noSessionDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_VIEW_OWN_CONTRIBUTIONS',
        actorContext: guestWithoutSession
      });
      expect(noSessionDecision.allowed).toBe(false);
      expect(noSessionDecision.code).toBe('SESSION_REQUIRED');
      expect(EventAccessPolicy.canGuestAccessOwnContributions(event, guestWithoutSession)).toBe(false);
    });

    it('en GRACE_PERIOD mantiene la excepción DEC-084 incluso si guestGalleryEnabled está false', () => {
      const event = createMockEvent({
        status: 'GRACE_PERIOD',
        guestGalleryEnabled: false,
        uploadsEnabled: false
      });

      // Galería pública general deshabilitada
      expect(EventAccessPolicy.canGuestViewGallery(event)).toBe(false);

      // Aportes propios con sesión válida siguen autorizados bajo DEC-084
      expect(EventAccessPolicy.canGuestAccessOwnContributions(event, guestWithSession)).toBe(true);
      expect(EventAccessPolicy.canGuestRequestRemoval(event, guestWithSession)).toBe(true);
    });
  });

  describe('Escenario 3: SUSPENDED y PENDING_DELETION (Terminal)', () => {
    it('SUSPENDED falla cerrado para operaciones ordinarias de invitados y organizadores', () => {
      const event = createMockEvent({ status: 'SUSPENDED' });

      expect(EventAccessPolicy.canGuestViewLanding(event)).toBe(false);
      expect(EventAccessPolicy.canGuestViewGallery(event)).toBe(false);
      expect(EventAccessPolicy.canGuestUpload(event)).toBe(false);
      expect(EventAccessPolicy.canGuestAccessOwnContributions(event, guestWithSession)).toBe(false);
      expect(EventAccessPolicy.canOrganizerManage(event, ownerActor)).toBe(false);

      // Admin puede intervenir
      const adminDecision = EventAccessPolicy.evaluate({
        event,
        action: 'ADMIN_INTERVENE',
        actorContext: adminActor
      });
      expect(adminDecision.allowed).toBe(true);
    });

    it('PENDING_DELETION y ARCHIVED son terminales y fallan cerrado estrictamente', () => {
      for (const terminalStatus of ['PENDING_DELETION', 'ARCHIVED', 'DELETED'] as const) {
        const event = createMockEvent({ status: terminalStatus as any });

        const landingDecision = EventAccessPolicy.evaluate({ event, action: 'GUEST_VIEW_LANDING' });
        expect(landingDecision.allowed).toBe(false);
        expect(landingDecision.code).toBe('EVENT_TERMINAL');

        const uploadDecision = EventAccessPolicy.evaluate({ event, action: 'GUEST_UPLOAD' });
        expect(uploadDecision.allowed).toBe(false);
        expect(uploadDecision.code).toBe('EVENT_TERMINAL');

        const ownDecision = EventAccessPolicy.evaluate({
          event,
          action: 'GUEST_VIEW_OWN_CONTRIBUTIONS',
          actorContext: guestWithSession
        });
        expect(ownDecision.allowed).toBe(false);
        expect(ownDecision.code).toBe('EVENT_TERMINAL');

        expect(EventAccessPolicy.canOrganizerManage(event, ownerActor)).toBe(false);
      }
    });
  });

  describe('Casos de error, estados vacíos e inconsistentes (Fail-Closed)', () => {
    it('evalúa FAIL_CLOSED ante evento nulo, indefinido o con status corrupto', () => {
      expect(EventAccessPolicy.evaluate({ event: null, action: 'GUEST_VIEW_LANDING' }).code).toBe('FAIL_CLOSED');
      expect(EventAccessPolicy.evaluate({ event: undefined, action: 'GUEST_UPLOAD' }).code).toBe('FAIL_CLOSED');
      expect(EventAccessPolicy.evaluate({
        event: { status: 'INVALID_STATUS' as any } as EventRecord,
        action: 'GUEST_VIEW_GALLERY'
      }).code).toBe('FAIL_CLOSED');
    });

    it('DRAFT no es accesible a invitados (no enumeración per AQR-003)', () => {
      const event = createMockEvent({ status: 'DRAFT' });
      const guestDecision = EventAccessPolicy.evaluate({
        event,
        action: 'GUEST_VIEW_LANDING',
        actorContext: guestWithSession
      });
      expect(guestDecision.allowed).toBe(false);
      expect(guestDecision.code).toBe('EVENT_NOT_FOUND');

      // Propietario sí puede gestionar borrador
      expect(EventAccessPolicy.canOrganizerManage(event, ownerActor)).toBe(true);
      // Otro organizador no puede
      expect(EventAccessPolicy.canOrganizerManage(event, otherOrganizer)).toBe(false);
    });
  });
});
