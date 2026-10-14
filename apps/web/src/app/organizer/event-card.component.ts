import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventStatusBadgeComponent } from '../lifecycle/event-status-badge.component.js';

@Component({
  selector: 'eventlens-event-card',
  standalone: true,
  imports: [EventStatusBadgeComponent],
  templateUrl: './event-card.component.html',
  styleUrl: './event-card.component.scss'
})
export class EventCardComponent {
  @Input({ required: true }) event!: OrganizerEventModel;
  @Output() selectEvent = new EventEmitter<string>();

  formatStartsAt(): string {
    if (this.event.startsAtLocal) {
      return this.event.startsAtLocal.replace('T', ' ');
    }
    if (this.event.scheduledAt) {
      return new Date(this.event.scheduledAt).toLocaleString();
    }
    return 'Sin programar';
  }

  onSelect(): void {
    this.selectEvent.emit(this.event.id);
  }
}
