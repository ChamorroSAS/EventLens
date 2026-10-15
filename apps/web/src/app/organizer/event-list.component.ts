import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventCardComponent } from './event-card.component.js';

@Component({
  selector: 'eventlens-event-list',
  standalone: true,
  imports: [EventCardComponent],
  templateUrl: './event-list.component.html',
  styleUrl: './event-list.component.scss'
})
export class EventListComponent {
  @Input({ required: true }) events: OrganizerEventModel[] = [];
  @Output() selectEvent = new EventEmitter<string>();

  onEventSelected(eventId: string): void {
    this.selectEvent.emit(eventId);
  }
}
