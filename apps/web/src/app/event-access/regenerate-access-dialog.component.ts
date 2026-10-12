import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'el-regenerate-access-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-desc"
    >
      <div class="dialog-card" (click)="$event.stopPropagation()">
        <header class="dialog-header">
          <div class="warning-icon" aria-hidden="true">⚠️</div>
          <h2 id="dialog-title" class="dialog-title">¿Regenerar credencial de acceso?</h2>
        </header>

        <div id="dialog-desc" class="dialog-body">
          <p class="warning-main">
            Esta es una acción destructiva e inmediata.
          </p>
          <ul class="warning-list">
            <li>El enlace anterior y el código QR impreso o compartido dejarán de funcionar inmediatamente.</li>
            <li>Todas las sesiones de invitados activas serán revocadas conforme a DEC-083.</li>
            <li>Deberás compartir el nuevo enlace o código QR para que los invitados puedan volver a entrar.</li>
          </ul>
        </div>

        <footer class="dialog-footer">
          <button
            type="button"
            #cancelBtn
            class="cancel-btn"
            (click)="onCancel()"
            [disabled]="submitting"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="confirm-destruct-btn"
            (click)="onConfirm()"
            [disabled]="submitting"
            aria-label="Confirmar regeneración de enlace e invalidación del anterior"
          >
            <span *ngIf="!submitting">Sí, regenerar acceso</span>
            <span *ngIf="submitting" aria-live="assertive">Regenerando...</span>
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1100;
    }
    .dialog-card {
      background: #ffffff;
      border-radius: 12px;
      max-width: 480px;
      width: 100%;
      padding: 1.5rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
    }
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .warning-icon {
      font-size: 1.5rem;
    }
    .dialog-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #9b2c2c;
      margin: 0;
    }
    .dialog-body {
      color: #4a5568;
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .warning-main {
      font-weight: 600;
      color: #742a2a;
      margin-bottom: 0.75rem;
    }
    .warning-list {
      padding-left: 1.25rem;
      margin: 0;
    }
    .warning-list li {
      margin-bottom: 0.375rem;
    }
    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
    .cancel-btn {
      min-height: 44px;
      padding: 0 1rem;
      background: transparent;
      border: 1px solid #cbd5e0;
      color: #4a5568;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .cancel-btn:hover:not(:disabled) {
      background: #edf2f7;
    }
    .confirm-destruct-btn {
      min-height: 44px;
      padding: 0 1.25rem;
      background: #e53e3e;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    .confirm-destruct-btn:hover:not(:disabled) {
      background: #c53030;
    }
    .confirm-destruct-btn:disabled {
      background: #feb2b2;
      cursor: not-allowed;
    }
  `]
})
export class RegenerateAccessDialogComponent implements AfterViewInit {
  @Input() submitting = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('cancelBtn') cancelBtnRef!: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    // Focus default safe cancel button on open
    setTimeout(() => {
      this.cancelBtnRef?.nativeElement?.focus();
    }, 50);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    if (!this.submitting) {
      this.onCancel();
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onConfirm(): void {
    if (!this.submitting) {
      this.confirm.emit();
    }
  }
}
