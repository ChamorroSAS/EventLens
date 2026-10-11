import type { OrganizerActorContext } from '@eventlens/identity';
import type { EventRecord } from './contracts.js';

/**
 * Enforces access and capability boundaries for events (MOD-002, EL-TK-020).
 * Guarantees that DRAFT events strictly block guest access and uploads.
 */
export class EventAccessPolicy {
  /**
   * Determines if a guest can access the event space.
   * DRAFT events or events with guest_gallery_enabled=false strictly disallow guest access.
   */
  public static canGuestAccess(event: EventRecord): boolean {
    if (!event) return false;
    if (event.status === 'DRAFT') return false;
    return event.guestGalleryEnabled && (event.status === 'ACTIVE' || event.status === 'CLOSED');
  }

  /**
   * Determines if a guest can upload media to the event.
   * DRAFT events or events with uploads_enabled=false strictly disallow guest uploads.
   */
  public static canGuestUpload(event: EventRecord): boolean {
    if (!event) return false;
    if (event.status === 'DRAFT') return false;
    return event.uploadsEnabled && event.status === 'ACTIVE';
  }

  /**
   * Determines if an organizer is authorized to manage the event.
   * Enforces strict owner isolation: only the creating organizer can manage.
   */
  public static canOrganizerManage(event: EventRecord, actor: OrganizerActorContext): boolean {
    if (!event || !actor) return false;
    if (actor.actorType !== 'ORGANIZER_HUMAN') return false;
    return event.organizerId === actor.accountId;
  }
}
