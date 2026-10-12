import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { OrganizerEventModel } from './organizer.types.js';
import { EventCardComponent } from './event-card.component.js';

@Component({
  selector: 'eventlens-event-list',
  standalone: true,
  imports: [EventCardComponent],
  template: `
    <section class="events-section" aria-labelledby="events-list-heading">
      <h2 id="events-list-heading" class="sr-only">Lista de mis eventos</h2>
      <div class="events-grid" role="list">
        @for (item of events; track item.id) {
          <div role="listitem">
            <eventlens-event-card
              [event]="item"
              (selectEvent)="onEventSelected($event)"
            />
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .events-section {
      width: 100%;
    }
    .events-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }
    @media (min-width: 640px) {
      .events-grid {
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      }
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `
})
export class EventListComponent {
  @Input({ required: true }) events: OrganizerEventModel[] = [];
  @Output() selectEvent = new EventEmitter<string>();

  onEventSelected(eventId: string): void {
    this.selectEvent.emit(eventId);
  }
}
