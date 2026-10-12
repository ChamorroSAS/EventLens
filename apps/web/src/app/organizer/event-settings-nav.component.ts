import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { EventSettingsSection, EventConfigurationCapabilitiesModel } from './organizer.types.js';

interface NavItem {
  id: EventSettingsSection;
  label: string;
  icon: string;
}

@Component({
  selector: 'eventlens-event-settings-nav',
  standalone: true,
  template: `
    <nav class="settings-nav" aria-label="Secciones de configuración del evento">
      <div class="nav-header">
        <button
          type="button"
          class="btn-back"
          aria-label="Volver a la lista de eventos"
          (click)="onBack()"
        >
          <span aria-hidden="true">←</span> Volver a mis eventos
        </button>
      </div>

      <ul class="nav-list" role="tablist">
        @for (item of navItems; track item.id) {
          <li role="presentation">
            <button
              type="button"
              role="tab"
              class="nav-tab"
              [class.active]="activeSection === item.id"
              [attr.aria-selected]="activeSection === item.id"
              [attr.aria-current]="activeSection === item.id ? 'page' : null"
              (click)="onSectionSelect(item.id)"
            >
              <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </button>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    .settings-nav {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1rem;
    }
    .nav-header {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .btn-back {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 44px;
      padding: 0.5rem 0.75rem;
      background: none;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      color: #334155;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .btn-back:hover {
      background-color: #f1f5f9;
      color: #0f172a;
    }
    .btn-back:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    @media (max-width: 639px) {
      .nav-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      }
    }
    .nav-tab {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 44px;
      padding: 0.625rem 0.875rem;
      border: none;
      border-radius: 0.5rem;
      background: none;
      color: #475569;
      font-size: 0.875rem;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .nav-tab:hover {
      background-color: #f8fafc;
      color: #0f172a;
    }
    .nav-tab.active {
      background-color: #eff6ff;
      color: #1d4ed8;
      font-weight: 600;
    }
    .nav-tab:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    .nav-icon {
      font-size: 1.125rem;
    }
  `
})
export class EventSettingsNavComponent {
  @Input() activeSection: EventSettingsSection = 'general';
  @Input() capabilities?: EventConfigurationCapabilitiesModel;
  @Output() sectionChange = new EventEmitter<EventSettingsSection>();
  @Output() backToDashboard = new EventEmitter<void>();

  readonly navItems: NavItem[] = [
    { id: 'general', label: 'General y Portada', icon: '⚙️' },
    { id: 'schedule', label: 'Programación', icon: '📅' },
    { id: 'access', label: 'Acceso y PIN', icon: '🔑' },
    { id: 'guest', label: 'Invitados y Aportes', icon: '👥' },
    { id: 'lifecycle', label: 'Ciclo de vida', icon: '⏱️' },
    { id: 'capacity', label: 'Capacidad y Plan', icon: '📊' },
    { id: 'media', label: 'Biblioteca de fotos', icon: '🖼️' }
  ];

  onSectionSelect(section: EventSettingsSection): void {
    this.sectionChange.emit(section);
  }

  onBack(): void {
    this.backToDashboard.emit();
  }
}
