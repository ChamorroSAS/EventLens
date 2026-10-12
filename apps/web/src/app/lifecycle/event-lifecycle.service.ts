import { Injectable } from '@angular/core';
import type { LifecycleSnapshotModel, ScheduleEventCommand, SuspendEventCommand } from './lifecycle.types.js';

@Injectable({
  providedIn: 'root'
})
export class EventLifecycleService {
  /**
   * Retrieves the authorized lifecycle snapshot for an event (EL-TK-071, EL-TK-073).
   */
  async getLifecycleSnapshot(eventId: string, isGuest = false): Promise<LifecycleSnapshotModel> {
    const url = `/api/v1/events/${encodeURIComponent(eventId)}/lifecycle${isGuest ? '?asGuest=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('EVENT_NOT_FOUND');
      }
      if (res.status === 403) {
        throw new Error('ACCESS_DENIED');
      }
      throw new Error('COMMUNICATION_ERROR');
    }
    return (await res.json()) as LifecycleSnapshotModel;
  }

  /**
   * Schedules a DRAFT event for future opening (EL-TK-063).
   */
  async scheduleEvent(eventId: string, command: ScheduleEventCommand): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }

  /**
   * Activates a SCHEDULED event early (EL-TK-064).
   */
  async activateEarly(eventId: string): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }

  /**
   * Manually closes an ACTIVE event (EL-TK-065).
   */
  async closeEvent(eventId: string): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }

  /**
   * Reopens a CLOSED event prior to validity expiry (EL-TK-066).
   */
  async reopenEvent(eventId: string): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }

  /**
   * Administratively suspends an event with mandatory reason (EL-TK-068).
   */
  async suspendEvent(eventId: string, command: SuspendEventCommand): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }

  /**
   * Administratively reactivates a SUSPENDED event (EL-TK-069).
   */
  async reactivateEvent(eventId: string): Promise<void> {
    const res = await fetch(`/api/v1/events/${encodeURIComponent(eventId)}/reactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      if (res.status === 409) throw new Error('CONFLICT');
      if (res.status === 403) throw new Error('UNAUTHORIZED');
      throw new Error('COMMUNICATION_ERROR');
    }
  }
}
