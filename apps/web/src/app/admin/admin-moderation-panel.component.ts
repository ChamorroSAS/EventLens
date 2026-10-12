import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReportQueueComponent } from './report-queue.component.js';
import { ReportDetailComponent } from './report-detail.component.js';

@Component({
  selector: 'eventlens-admin-moderation-panel',
  standalone: true,
  imports: [CommonModule, ReportQueueComponent, ReportDetailComponent],
  template: `
    <div class="moderation-panel-root">
      @if (selectedCaseId()) {
        <eventlens-report-detail
          [caseId]="selectedCaseId()!"
          [callerActorId]="callerActorId"
          (back)="onBackToQueue()"
        ></eventlens-report-detail>
      } @else {
        <eventlens-report-queue
          [callerActorId]="callerActorId"
          (caseSelected)="onCaseSelected($event)"
        ></eventlens-report-queue>
      }
    </div>
  `,
  styles: `
    .moderation-panel-root {
      width: 100%;
    }
  `
})
export class AdminModerationPanelComponent {
  @Input() callerActorId?: string;

  readonly selectedCaseId = signal<string | null>(null);

  onCaseSelected(caseId: string): void {
    this.selectedCaseId.set(caseId);
  }

  onBackToQueue(): void {
    this.selectedCaseId.set(null);
  }
}
