import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AdminJobAction, AdminJobDetail } from './jobs.types.js';

@Component({
  selector: 'eventlens-job-detail-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="dialog-backdrop"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onClose()"
      tabindex="-1"
    >
      <div
        #dialogContainer
        class="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-detail-title"
        tabindex="-1"
      >
        <header class="dialog-header">
          <div>
            <h3 id="job-detail-title" class="dialog-title">
              Diagnóstico de Job: <span class="mono">{{ job.type }}</span>
            </h3>
            <p class="dialog-subtitle">ID: <span class="mono">{{ job.id }}</span></p>
          </div>
          <button
            type="button"
            class="close-btn"
            (click)="onClose()"
            aria-label="Cerrar diagnóstico"
          >
            &times;
          </button>
        </header>

        <div class="dialog-body">
          <!-- Metadatos Básicos -->
          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Estado</span>
              <span class="status-badge" [ngClass]="'status-' + job.status.toLowerCase()">
                {{ job.status }}
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Cola</span>
              <span class="meta-value">{{ job.queue }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Prioridad</span>
              <span class="meta-value">{{ job.priority }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Intentos</span>
              <span class="meta-value">{{ job.attempts }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Disponible desde</span>
              <span class="meta-value">{{ job.availableAt | date:'medium' }}</span>
            </div>
            @if (job.deadline) {
              <div class="meta-item">
                <span class="meta-label">Deadline</span>
                <span class="meta-value">{{ job.deadline | date:'medium' }}</span>
              </div>
            }
          </div>

          <!-- Error Técnico Sanitizado -->
          @if (job.sanitizedError) {
            <section class="section-block" aria-labelledby="error-heading">
              <h4 id="error-heading" class="section-title">Último Error Técnico Sanitizado</h4>
              <pre class="error-box" tabindex="0"><code>{{ job.sanitizedError }}</code></pre>
            </section>
          }

          <!-- Historial de Intentos -->
          @if (job.attemptsHistory && job.attemptsHistory.length > 0) {
            <section class="section-block" aria-labelledby="history-heading">
              <h4 id="history-heading" class="section-title">Historial de Intentos</h4>
              <div class="table-container">
                <table class="history-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Iniciado</th>
                      <th scope="col">Finalizado</th>
                      <th scope="col">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (att of job.attemptsHistory; track att.number) {
                      <tr>
                        <td class="mono">{{ att.number }}</td>
                        <td>{{ att.startedAt | date:'mediumTime' }}</td>
                        <td>{{ att.endedAt ? (att.endedAt | date:'mediumTime') : 'En curso' }}</td>
                        <td>
                          <span class="result-badge" [ngClass]="att.result ? 'result-' + att.result.toLowerCase() : 'result-running'">
                            {{ att.result || 'RUNNING' }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }
        </div>

        <!-- Acciones Operativas Habilitadas -->
        <footer class="dialog-footer">
          <div class="footer-actions">
            @if (job.capabilities.canRetry) {
              <button
                type="button"
                class="btn btn-retry"
                (click)="onActionClick('RETRY', $event)"
              >
                Reintentar Job (Retry)
              </button>
            }
            @if (job.capabilities.canCancel) {
              <button
                type="button"
                class="btn btn-cancel"
                (click)="onActionClick('CANCEL', $event)"
              >
                Cancelar Job
              </button>
            }
            @if (job.capabilities.canMarkDead) {
              <button
                type="button"
                class="btn btn-dead"
                (click)="onActionClick('MARK_DEAD', $event)"
              >
                Marcar como Dead
              </button>
            }
          </div>
          <button type="button" class="btn btn-secondary" (click)="onClose()">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 900;
      padding: 1rem;
    }
    .dialog-card {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 0.75rem;
      max-width: 48rem;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #334155;
    }
    .dialog-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
    }
    .dialog-subtitle {
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0.25rem 0 0 0;
    }
    .close-btn {
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
      line-height: 1;
    }
    .close-btn:hover {
      color: #f8fafc;
    }
    .dialog-body {
      padding: 1.5rem;
      overflow-y: auto;
      flex: 1;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
      background: #0f172a;
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid #334155;
    }
    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .meta-label {
      font-size: 0.75rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .meta-value {
      font-weight: 500;
      font-size: 0.875rem;
    }
    .status-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      width: fit-content;
    }
    .status-pending { background: #334155; color: #94a3b8; }
    .status-processing { background: #0369a1; color: #bae6fd; }
    .status-retrying { background: #b45309; color: #fde68a; }
    .status-failed { background: #be123c; color: #fecdd3; }
    .status-dead { background: #4c1d95; color: #ddd6fe; }
    .status-cancelled { background: #475569; color: #cbd5e1; }
    .status-completed { background: #047857; color: #a7f3d0; }

    .section-block {
      margin-bottom: 1.5rem;
    }
    .section-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: #e2e8f0;
    }
    .error-box {
      background: #0f172a;
      border: 1px solid #475569;
      border-radius: 0.375rem;
      padding: 0.75rem;
      color: #f87171;
      font-size: 0.8125rem;
      overflow-x: auto;
      max-height: 12rem;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .error-box:focus {
      outline: 2px solid #38bdf8;
    }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8125rem;
      background: #0f172a;
      border-radius: 0.375rem;
      overflow: hidden;
    }
    .history-table th, .history-table td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    .history-table th {
      background: #1e293b;
      color: #94a3b8;
      font-weight: 600;
    }
    .result-badge {
      display: inline-block;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-size: 0.7rem;
      font-weight: 600;
    }
    .result-success { background: #047857; color: #a7f3d0; }
    .result-failed { background: #be123c; color: #fecdd3; }
    .result-running { background: #0369a1; color: #bae6fd; }

    .dialog-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-top: 1px solid #334155;
    }
    .footer-actions {
      display: flex;
      gap: 0.5rem;
    }
    .btn {
      padding: 0.5rem 0.875rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn-secondary { background: #334155; color: #f8fafc; }
    .btn-secondary:hover { background: #475569; }
    .btn-retry { background: #0284c7; color: white; }
    .btn-retry:hover { background: #0369a1; }
    .btn-cancel { background: #dc2626; color: white; }
    .btn-cancel:hover { background: #b91c1c; }
    .btn-dead { background: #7c3aed; color: white; }
    .btn-dead:hover { background: #6d28d9; }
    .mono { font-family: monospace; }
  `]
})
export class JobDetailDialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) job!: AdminJobDetail;
  @Input() invokingElement: HTMLElement | null = null;

  @Output() close = new EventEmitter<void>();
  @Output() actionRequested = new EventEmitter<{
    jobId: string;
    action: AdminJobAction;
    element: HTMLElement;
  }>();

  @ViewChild('dialogContainer') dialogContainerRef!: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    setTimeout(() => {
      this.dialogContainerRef?.nativeElement?.focus();
    }, 50);
  }

  ngOnDestroy(): void {
    if (this.invokingElement && typeof this.invokingElement.focus === 'function') {
      this.invokingElement.focus();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onActionClick(action: AdminJobAction, event: Event): void {
    const target = event.currentTarget as HTMLElement;
    this.actionRequested.emit({
      jobId: this.job.id,
      action,
      element: target
    });
  }
}
