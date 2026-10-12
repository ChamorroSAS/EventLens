import type { OrganizerActorContext } from '@eventlens/identity';
import type {
  EventRecord,
  LifecycleSnapshot,
  EventStatus,
  EvaluateAccessParams,
  AccessDecision,
  GuestActorContext,
  EventAction
} from './contracts.js';

const VALID_EVENT_STATUSES = new Set<string>([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'CLOSED',
  'GRACE_PERIOD',
  'PENDING_DELETION',
  'SUSPENDED',
  'ARCHIVED',
  'DELETED'
]);

/**
 * Enforces access and capability boundaries based on canonical event lifecycle (MOD-002, EL-TK-020, EL-TK-072).
 * Fails closed on unknown/inconsistent states, preserves owner isolation (AQR-003),
 * and upholds the DEC-084 exception for guest own contributions/removals.
 */
export class EventAccessPolicy {
  /**
   * Evaluates an access request against the canonical lifecycle policy (EL-TK-072).
   */
  public static evaluate(params: EvaluateAccessParams): AccessDecision {
    const { event, action, actorContext } = params;

    // Fail closed: event must exist and have a recognized lifecycle status
    if (!event || !event.status || !VALID_EVENT_STATUSES.has(event.status)) {
      return {
        allowed: false,
        code: 'FAIL_CLOSED',
        reason: 'Event is undefined, inconsistent or in an unrecognized status'
      };
    }

    const status = event.status;
    const isTerminal = status === 'PENDING_DELETION' || status === 'ARCHIVED' || (status as string) === 'DELETED';
    const isSuspended = status === 'SUSPENDED';

    // 1. Terminal events fail closed strictly for everyone except administrative inspection
    if (isTerminal) {
      if (action === 'ADMIN_INTERVENE' && actorContext?.actorType === 'ADMIN_HUMAN') {
        return { allowed: true, code: 'ALLOWED', reason: 'Admin inspection permitted on terminal event' };
      }
      return {
        allowed: false,
        code: 'EVENT_TERMINAL',
        reason: `Event is in terminal state '${status}' and cannot receive operations`
      };
    }

    // 2. Suspended events fail closed for public and organizer operations (DEC-078)
    if (isSuspended) {
      if (action === 'ADMIN_INTERVENE' && actorContext?.actorType === 'ADMIN_HUMAN') {
        return { allowed: true, code: 'ALLOWED', reason: 'Admin operation permitted on suspended event' };
      }
      return {
        allowed: false,
        code: 'EVENT_SUSPENDED',
        reason: 'Event is administratively suspended'
      };
    }

    // 3. Draft events are restricted to owner or admin (non-enumeration per AQR-003)
    if (status === 'DRAFT') {
      if (action === 'ADMIN_INTERVENE' && actorContext?.actorType === 'ADMIN_HUMAN') {
        return { allowed: true, code: 'ALLOWED', reason: 'Admin access to draft allowed' };
      }
      if (action === 'ORGANIZER_MANAGE') {
        const organizerId = 'organizerId' in event ? event.organizerId : undefined;
        if (actorContext?.actorType === 'ORGANIZER_HUMAN' && actorContext.accountId === organizerId) {
          return { allowed: true, code: 'ALLOWED', reason: 'Organizer owner can manage draft' };
        }
        return { allowed: false, code: 'UNAUTHORIZED_ORGANIZER', reason: 'Only the draft owner can manage it' };
      }
      // Guests cannot see or interact with draft events
      return {
        allowed: false,
        code: 'EVENT_NOT_FOUND',
        reason: 'Draft events are not accessible to public actors'
      };
    }

    // 4. Evaluate specific actions on valid non-terminal, non-suspended events:
    switch (action) {
      case 'GUEST_VIEW_LANDING': {
        // SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD allow viewing the event landing page / notice
        return {
          allowed: true,
          code: 'ALLOWED',
          reason: `Guest landing page accessible in status '${status}'`
        };
      }

      case 'GUEST_VIEW_GALLERY': {
        if (status === 'SCHEDULED') {
          return {
            allowed: false,
            code: 'GALLERY_DISABLED',
            reason: 'Gallery is not open while event is scheduled'
          };
        }
        const galleryEnabled = Boolean(event.guestGalleryEnabled);
        if (!galleryEnabled) {
          return {
            allowed: false,
            code: 'GALLERY_DISABLED',
            reason: 'Guest gallery is explicitly disabled for this event'
          };
        }
        if (status === 'ACTIVE' || status === 'CLOSED' || status === 'GRACE_PERIOD') {
          return {
            allowed: true,
            code: 'ALLOWED',
            reason: 'Guest gallery is accessible'
          };
        }
        return {
          allowed: false,
          code: 'GALLERY_DISABLED',
          reason: `Gallery cannot be viewed in status '${status}'`
        };
      }

      case 'GUEST_UPLOAD': {
        if (status === 'SCHEDULED') {
          return {
            allowed: false,
            code: 'UPLOADS_DISABLED',
            reason: 'Uploads are not open while event is scheduled'
          };
        }
        if (status === 'CLOSED' || status === 'GRACE_PERIOD') {
          return {
            allowed: false,
            code: 'UPLOADS_DISABLED',
            reason: `Uploads are closed in '${status}'`
          };
        }
        if (status === 'ACTIVE') {
          if (!Boolean(event.uploadsEnabled)) {
            return {
              allowed: false,
              code: 'UPLOADS_DISABLED',
              reason: 'Uploads are explicitly disabled for this event'
            };
          }
          return {
            allowed: true,
            code: 'ALLOWED',
            reason: 'Uploads are active and enabled'
          };
        }
        return {
          allowed: false,
          code: 'UPLOADS_DISABLED',
          reason: `Uploads not permitted in status '${status}'`
        };
      }

      case 'GUEST_VIEW_OWN_CONTRIBUTIONS':
      case 'GUEST_REQUEST_OWN_REMOVAL': {
        // Excepción aprobada DEC-084: En CLOSED o GRACE_PERIOD (y ACTIVE), un invitado
        // con sesión válida puede ver y solicitar el retiro de sus propios aportes,
        // aun cuando la galería general o las cargas estén bloqueadas.
        if (status !== 'ACTIVE' && status !== 'CLOSED' && status !== 'GRACE_PERIOD') {
          return {
            allowed: false,
            code: 'EVENT_NOT_ACCESSIBLE',
            reason: `Own contributions cannot be accessed in status '${status}'`
          };
        }

        const guestContext = actorContext?.actorType === 'GUEST_ANONYMOUS'
          ? (actorContext as GuestActorContext)
          : undefined;

        if (!guestContext?.guestSessionId) {
          return {
            allowed: false,
            code: 'SESSION_REQUIRED',
            reason: 'A valid guest session identifier is required to access own contributions (DEC-084)'
          };
        }

        return {
          allowed: true,
          code: 'ALLOWED',
          reason: 'Access to own contributions authorized under DEC-084 exception'
        };
      }

      case 'ORGANIZER_MANAGE': {
        const organizerId = 'organizerId' in event ? event.organizerId : undefined;
        if (!actorContext || actorContext.actorType !== 'ORGANIZER_HUMAN') {
          return {
            allowed: false,
            code: 'UNAUTHORIZED_ORGANIZER',
            reason: 'Organizer authentication required'
          };
        }
        if (actorContext.accountId !== organizerId) {
          return {
            allowed: false,
            code: 'UNAUTHORIZED_ORGANIZER',
            reason: 'Only the creating organizer owner can manage the event'
          };
        }
        return {
          allowed: true,
          code: 'ALLOWED',
          reason: 'Organizer owner authorized'
        };
      }

      case 'ADMIN_INTERVENE': {
        if (!actorContext || actorContext.actorType !== 'ADMIN_HUMAN') {
          return {
            allowed: false,
            code: 'UNAUTHORIZED_ADMIN',
            reason: 'Admin authorization required'
          };
        }
        return {
          allowed: true,
          code: 'ALLOWED',
          reason: 'Admin authorized'
        };
      }

      default:
        return {
          allowed: false,
          code: 'FAIL_CLOSED',
          reason: `Unsupported action '${String(action)}'`
        };
    }
  }

  /**
   * Determines if a guest can access the event landing/notice page (EL-TK-072 Escenario 1).
   */
  public static canGuestViewLanding(event: EventRecord | LifecycleSnapshot | null | undefined): boolean {
    return this.evaluate({ event, action: 'GUEST_VIEW_LANDING' }).allowed;
  }

  /**
   * Determines if a guest can view the general public gallery (EL-TK-072 Escenario 2).
   */
  public static canGuestViewGallery(event: EventRecord | LifecycleSnapshot | null | undefined): boolean {
    return this.evaluate({ event, action: 'GUEST_VIEW_GALLERY' }).allowed;
  }

  /**
   * Backward-compatible helper for general guest gallery access.
   */
  public static canGuestAccess(event: EventRecord | LifecycleSnapshot | null | undefined): boolean {
    return this.canGuestViewGallery(event);
  }

  /**
   * Determines if a guest can upload media to the event.
   */
  public static canGuestUpload(event: EventRecord | LifecycleSnapshot | null | undefined): boolean {
    return this.evaluate({ event, action: 'GUEST_UPLOAD' }).allowed;
  }

  /**
   * Determines if a guest can access their own contributions ("Mis aportes") under DEC-084 exception.
   */
  public static canGuestAccessOwnContributions(
    event: EventRecord | LifecycleSnapshot | null | undefined,
    actorContext?: GuestActorContext | null
  ): boolean {
    return this.evaluate({
      event,
      action: 'GUEST_VIEW_OWN_CONTRIBUTIONS',
      actorContext
    }).allowed;
  }

  /**
   * Determines if a guest can request removal of their own contributions under DEC-084 exception.
   */
  public static canGuestRequestRemoval(
    event: EventRecord | LifecycleSnapshot | null | undefined,
    actorContext?: GuestActorContext | null
  ): boolean {
    return this.evaluate({
      event,
      action: 'GUEST_REQUEST_OWN_REMOVAL',
      actorContext
    }).allowed;
  }

  /**
   * Determines if an organizer is authorized to manage the event.
   * Enforces strict owner isolation: only the creating organizer can manage.
   */
  public static canOrganizerManage(
    event: EventRecord | LifecycleSnapshot | null | undefined,
    actor: OrganizerActorContext | null | undefined
  ): boolean {
    return this.evaluate({
      event,
      action: 'ORGANIZER_MANAGE',
      actorContext: actor
    }).allowed;
  }
}

