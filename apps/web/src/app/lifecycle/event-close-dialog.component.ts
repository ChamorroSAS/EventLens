import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-event-close-dialog',
  standalone: true,
  template: `
    @if (isOpen) {
      <div
        class="dialog-backdrop"
        role="presentation"
        (click)="onCancel()"
        (keydown.escape)="onCancel()"
      >
        <div
          class="dialog-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-dialog-title"
          aria-describedby="close-dialog-desc"
          (click)="$event.stopPropagation()"
        >
          <div class="dialog-header">
            <h3 id="close-dialog-title" class="dialog-title">¿Cerrar evento «{{ eventName }}»?</h3>
          </div>

          <div class="dialog-body">
            <p id="close-dialog-desc" class="dialog-description">
              Al cerrar el evento se deshabilitará la carga de nuevas fotos y videos por parte de los
              invitados.
            </p>
            <div class="dialog-warning" role="note">
              <strong>Importante:</strong> Cerrar manualmente el evento <em>no pausa</em> la vigencia
              ni el periodo de gracia configurados originalmente.
            </div>
          </div>

          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" (click)="onCancel()">
              Cancelar
            </button>
            <button type="button" class="btn btn-danger btn-confirm-close" (click)="onConfirm()">
              Confirmar cierre
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .dialog-card {
      background-color: #ffffff;
      border-radius: 0.75rem;
      max-width: 28rem;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .dialog-header {
      padding: 1.25rem 1.5rem 0.75rem;
    }
    .dialog-title {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .dialog-body {
      padding: 0 1.5rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .dialog-description {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: #475569;
    }
    .dialog-warning {
      padding: 0.75rem;
      background-color: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 0.375rem;
      font-size: 0.8125rem;
      line-height: 1.4;
      color: #92400e;
    }
    .dialog-actions {
      padding: 1rem 1.5rem;
      background-color: #f8fafc;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s ease-in-out;
    }
    .btn-secondary {
      background-color: #ffffff;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-secondary:hover {
      background-color: #f1f5f9;
    }
    .btn-danger {
      background-color: #dc2626;
      color: #ffffff;
    }
    .btn-danger:hover {
      background-color: #b91c1c;
    }
  `
})
export class EventCloseDialogComponent {
  @Input() isOpen = false;
  @Input() eventName = '';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
