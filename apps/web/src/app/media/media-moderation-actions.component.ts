import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaCardModel } from './media.types.js';

@Component({
  selector: 'eventlens-media-moderation-actions',
  standalone: true,
  template: `
    <div class="moderation-actions" role="group" [attr.aria-label]="'Acciones de moderación para ' + media.fileName">
      @if (media.capabilities.canApprove) {
        <button
          type="button"
          class="btn-action btn-approve"
          [disabled]="disabled"
          [attr.aria-label]="'Aprobar ' + media.fileName"
          (click)="onApprove()"
        >
          <span aria-hidden="true">✓</span> Aprobar
        </button>
      }

      @if (media.capabilities.canReject) {
        <button
          type="button"
          class="btn-action btn-reject"
          [disabled]="disabled"
          [attr.aria-label]="'Rechazar ' + media.fileName"
          (click)="onReject()"
        >
          <span aria-hidden="true">✕</span> Rechazar
        </button>
      }

      @if (media.capabilities.canHide) {
        <button
          type="button"
          class="btn-action btn-hide"
          [disabled]="disabled"
          [attr.aria-label]="'Ocultar ' + media.fileName"
          (click)="onHide()"
        >
          <span aria-hidden="true">👁️‍🗨️</span> Ocultar
        </button>
      }

      @if (media.capabilities.canRepublish) {
        <button
          type="button"
          class="btn-action btn-republish"
          [disabled]="disabled"
          [attr.aria-label]="'Volver a publicar ' + media.fileName"
          (click)="onRepublish()"
        >
          <span aria-hidden="true">👁️</span> Publicar
        </button>
      }

      @if (media.capabilities.canTrash) {
        <button
          type="button"
          class="btn-action btn-trash"
          [disabled]="disabled"
          [attr.aria-label]="'Mover ' + media.fileName + ' a la papelera'"
          (click)="onTrash()"
        >
          <span aria-hidden="true">🗑️</span> Papelera
        </button>
      }

      @if (media.capabilities.canRestore) {
        <button
          type="button"
          class="btn-action btn-restore"
          [disabled]="disabled"
          [attr.aria-label]="'Restaurar ' + media.fileName + ' de la papelera'"
          (click)="onRestore()"
        >
          <span aria-hidden="true">↩</span> Restaurar
        </button>
      } @else if (media.status === 'TRASHED') {
        <span class="trash-expired-badge" role="status">
          Ventana de restauración vencida
        </span>
      }
    </div>
  `,
  styles: `
    .moderation-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      flex-wrap: wrap;
    }
    .btn-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 38px;
      padding: 0.375rem 0.625rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    }
    .btn-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-action:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .btn-approve {
      background-color: #dcfce7;
      border-color: #86efac;
      color: #166534;
    }
    .btn-approve:hover:not(:disabled) {
      background-color: #bbf7d0;
    }
    .btn-reject {
      background-color: #fee2e2;
      border-color: #fca5a5;
      color: #991b1b;
    }
    .btn-reject:hover:not(:disabled) {
      background-color: #fecaca;
    }
    .btn-hide {
      background-color: #f1f5f9;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-hide:hover:not(:disabled) {
      background-color: #e2e8f0;
    }
    .btn-republish {
      background-color: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }
    .btn-republish:hover:not(:disabled) {
      background-color: #dbeafe;
    }
    .btn-trash {
      background-color: #fff1f2;
      border-color: #fecdd3;
      color: #be123c;
    }
    .btn-trash:hover:not(:disabled) {
      background-color: #ffe4e6;
    }
    .btn-restore {
      background-color: #f0fdf4;
      border-color: #bbf7d0;
      color: #15803d;
    }
    .btn-restore:hover:not(:disabled) {
      background-color: #dcfce7;
    }
    .trash-expired-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      background-color: #f1f5f9;
      color: #64748b;
      font-size: 0.6875rem;
      font-weight: 500;
      border: 1px dashed #cbd5e1;
    }
  `,
})
export class MediaModerationActionsComponent {
  @Input({ required: true }) media!: MediaCardModel;
  @Input() disabled = false;

  @Output() approve = new EventEmitter<MediaCardModel>();
  @Output() reject = new EventEmitter<MediaCardModel>();
  @Output() hide = new EventEmitter<MediaCardModel>();
  @Output() republish = new EventEmitter<MediaCardModel>();
  @Output() trash = new EventEmitter<MediaCardModel>();
  @Output() restore = new EventEmitter<MediaCardModel>();

  onApprove(): void {
    if (!this.disabled && this.media.capabilities.canApprove) {
      this.approve.emit(this.media);
    }
  }

  onReject(): void {
    if (!this.disabled && this.media.capabilities.canReject) {
      this.reject.emit(this.media);
    }
  }

  onHide(): void {
    if (!this.disabled && this.media.capabilities.canHide) {
      this.hide.emit(this.media);
    }
  }

  onRepublish(): void {
    if (!this.disabled && this.media.capabilities.canRepublish) {
      this.republish.emit(this.media);
    }
  }

  onTrash(): void {
    if (!this.disabled && this.media.capabilities.canTrash) {
      this.trash.emit(this.media);
    }
  }

  onRestore(): void {
    if (!this.disabled && this.media.capabilities.canRestore) {
      this.restore.emit(this.media);
    }
  }
}
