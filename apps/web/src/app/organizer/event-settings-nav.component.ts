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
  templateUrl: './event-settings-nav.component.html',
  styleUrl: './event-settings-nav.component.scss'
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
