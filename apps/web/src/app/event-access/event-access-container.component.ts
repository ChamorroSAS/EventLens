import { Component, ElementRef, Input, ViewChild, signal } from '@angular/core';
import { EventAccessSettings, ShareAccessSnapshot, UpdatePinCommandPayload } from './access.types.js';
import { EventAccessSettingsComponent } from './event-access-settings.component.js';
import { EventSharePanelComponent } from './event-share-panel.component.js';
import { RegenerateAccessDialogComponent } from './regenerate-access-dialog.component.js';

@Component({
  selector: 'el-event-access-container',
  standalone: true,
  imports: [
    EventAccessSettingsComponent,
    EventSharePanelComponent,
    RegenerateAccessDialogComponent
  ],
  template: `
    <section class="access-management-container" aria-labelledby="mgmt-heading">
      <h1 id="mgmt-heading" class="page-heading">Gestión de acceso e invitaciones</h1>

      <!-- Panel de configuración de PIN -->
      <el-event-access-settings
        [settings]="settings"
        [submitting]="isUpdatingPin()"
        [errorMessage]="pinErrorMessage()"
        [successMessage]="pinSuccessMessage()"
        (updatePin)="onUpdatePin($event)"
      ></el-event-access-settings>

      <!-- Panel de previsualización y compartir QR / enlace -->
      <el-event-share-panel
        #sharePanel
        [snapshot]="shareSnapshot"
        (openRegenerateDialog)="onOpenRegenerateDialog()"
      ></el-event-share-panel>

      <!-- Modal accesible de regeneración -->
      @if (showRegenerateDialog()) {
        <el-regenerate-access-dialog
          [submitting]="isRegenerating()"
          (confirm)="onConfirmRegenerate()"
          (cancel)="onCloseRegenerateDialog()"
        ></el-regenerate-access-dialog>
      }
    </section>
  `,
  styles: [`
    .access-management-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 1.5rem 1rem;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .page-heading {
      font-size: 1.5rem;
      font-weight: 800;
      color: #1a202c;
      margin-bottom: 1.5rem;
    }
  `]
})
export class EventAccessContainerComponent {
  @Input() settings: EventAccessSettings | null = null;
  @Input() shareSnapshot: ShareAccessSnapshot | null = null;

  readonly isUpdatingPin = signal(false);
  readonly pinErrorMessage = signal<string | null>(null);
  readonly pinSuccessMessage = signal<string | null>(null);

  readonly showRegenerateDialog = signal(false);
  readonly isRegenerating = signal(false);

  private triggerElement: HTMLElement | null = null;

  onUpdatePin(payload: UpdatePinCommandPayload): void {
    this.isUpdatingPin.set(false);
    this.pinErrorMessage.set(null);
    const isEnabled = payload.action === 'CHANGE_PIN';
    if (this.settings) {
      this.settings.pinEnabled = isEnabled;
      this.settings.pinRequired = isEnabled;
    }
    this.pinSuccessMessage.set(isEnabled
      ? 'PIN configurado exitosamente. Sesiones previas revocadas.'
      : 'PIN desactivado exitosamente. Sesiones previas revocadas.');
  }

  onOpenRegenerateDialog(): void {
    this.triggerElement = document.activeElement as HTMLElement;
    this.showRegenerateDialog.set(true);
  }

  onCloseRegenerateDialog(): void {
    this.showRegenerateDialog.set(false);
    this.returnFocusToTrigger();
  }

  onConfirmRegenerate(): void {
    this.isRegenerating.set(false);
    this.showRegenerateDialog.set(false);

    // Update generation and lookup key
    if (this.shareSnapshot) {
      const nextGen = this.shareSnapshot.generation + 1;
      const newKey = 'new-key-gen-' + nextGen;
      this.shareSnapshot = {
        ...this.shareSnapshot,
        generation: nextGen,
        lookupKey: newKey,
        sharePath: '/g/' + newKey,
        shareUrl: 'https://eventlens.app/g/' + newKey,
        qrPayload: 'https://eventlens.app/g/' + newKey
      };
    }

    this.returnFocusToTrigger();
  }

  private returnFocusToTrigger(): void {
    if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
      this.triggerElement.focus();
    }
  }
}
