import { Component, Input } from '@angular/core';

@Component({
  selector: 'eventlens-retention-notice',
  standalone: true,
  template: `
    <div class="retention-notice" role="status" aria-live="polite">
      <span class="notice-icon" aria-hidden="true">⏱️</span>
      <div class="notice-text">
        <strong>Período de gracia en papelera (7 días):</strong>
        <span>
          Los archivos enviados a la papelera se conservan durante 7 días calendario.
          Durante este período puedes restaurarlos a su estado anterior. Tras expirar el plazo,
          se entregarán a purga física definitiva de acuerdo a la política de privacidad.
        </span>
      </div>
    </div>
  `,
  styles: `
    .retention-notice {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background-color: #fff7ed;
      border: 1px solid #ffedd5;
      border-left: 4px solid #ea580c;
      border-radius: 0.5rem;
      font-size: 0.8125rem;
      color: #7c2d12;
      line-height: 1.4;
    }
    .notice-icon {
      font-size: 1.125rem;
      flex-shrink: 0;
      margin-top: -0.0625rem;
    }
    .notice-text {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
  `,
})
export class RetentionNoticeComponent {
  @Input() retentionDays = 7;
}
