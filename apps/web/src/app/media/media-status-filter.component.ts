import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaStatusFilter } from './media.types.js';

export interface FilterOption {
  id: MediaStatusFilter;
  label: string;
}

@Component({
  selector: 'eventlens-media-status-filter',
  standalone: true,
  template: `
    <nav
      class="filter-toolbar"
      role="toolbar"
      aria-label="Filtrar fotos y videos por estado"
    >
      <div class="filter-group" role="group" aria-label="Estados de medios">
        @for (option of options; track option.id) {
          <button
            type="button"
            class="filter-btn"
            [class.active]="activeFilter === option.id"
            [attr.aria-pressed]="activeFilter === option.id"
            [disabled]="disabled"
            (click)="onSelect(option.id)"
          >
            {{ option.label }}
          </button>
        }
      </div>
    </nav>
  `,
  styles: `
    .filter-toolbar {
      display: flex;
      align-items: center;
      width: 100%;
    }
    .filter-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      width: 100%;
    }
    .filter-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #334155;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
      user-select: none;
    }
    .filter-btn:hover:not(:disabled) {
      background-color: #f1f5f9;
      color: #0f172a;
      border-color: #94a3b8;
    }
    .filter-btn:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .filter-btn.active {
      background-color: #eff6ff;
      color: #1d4ed8;
      border-color: #3b82f6;
      font-weight: 600;
      box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
    }
    .filter-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `,
})
export class MediaStatusFilterComponent {
  @Input() activeFilter: MediaStatusFilter = 'ALL';
  @Input() disabled = false;
  @Output() filterChange = new EventEmitter<MediaStatusFilter>();

  readonly options: FilterOption[] = [
    { id: 'ALL', label: 'Todos' },
    { id: 'PUBLISHED', label: 'Publicados' },
    { id: 'PROCESSING', label: 'En procesamiento' },
    { id: 'PROCESSING_FAILED', label: 'Con fallos' },
    { id: 'QUARANTINED', label: 'En cuarentena' },
    { id: 'PENDING_REVIEW', label: 'Pendientes' },
  ];

  onSelect(filter: MediaStatusFilter): void {
    if (this.disabled || this.activeFilter === filter) return;
    this.filterChange.emit(filter);
  }
}
