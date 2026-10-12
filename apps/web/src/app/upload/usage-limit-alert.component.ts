import { Component, Input } from '@angular/core';

@Component({
  selector: 'eventlens-usage-limit-alert',
  standalone: true,
  template: `
    @if (visible) {
      <div
        class="usage-alert-box"
        [class]="'alert-' + type"
        role="alert"
        [attr.aria-label]="title || 'Aviso de límite o política'"
      >
        <span class="alert-icon" aria-hidden="true">
          @if (type === 'error') { 🛑 }
          @else if (type === 'warning') { ⚠️ }
          @else { ℹ️ }
        </span>
        <div class="alert-body">
          @if (title) {
            <h4 class="alert-title">{{ title }}</h4>
          }
          <p class="alert-message">{{ message }}</p>
        </div>
      </div>
    }
  `,
  styles: `
    .usage-alert-box {
      display: flex;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      border: 1px solid currentColor;
    }
    .alert-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
      line-height: 1.2;
    }
    .alert-body {
      flex: 1;
    }
    .alert-title {
      margin: 0 0 0.25rem;
      font-size: 0.875rem;
      font-weight: 600;
    }
    .alert-message {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.4;
    }
    .alert-warning {
      background-color: #fffbeb;
      color: #92400e;
      border-color: #fde68a;
    }
    .alert-error {
      background-color: #fef2f2;
      color: #b91c1c;
      border-color: #fca5a5;
    }
    .alert-info {
      background-color: #eff6ff;
      color: #1e40af;
      border-color: #bfdbfe;
    }
  `
})
export class UsageLimitAlertComponent {
  @Input() visible = false;
  @Input() title?: string;
  @Input({ required: true }) message!: string;
  @Input() type: 'warning' | 'error' | 'info' = 'warning';
}
