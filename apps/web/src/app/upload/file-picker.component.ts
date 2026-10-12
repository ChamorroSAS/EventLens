import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'eventlens-file-picker',
  standalone: true,
  template: `
    <div
      class="file-picker-container"
      [class.drag-over]="isDragOver"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
    >
      <input
        #fileInput
        id="guest-file-input"
        type="file"
        class="visually-hidden-input"
        multiple
        accept="image/*,video/*,.heic,.mov,.mp4,.webm"
        [disabled]="disabled"
        (change)="onFilesSelected($event)"
      />

      <label
        for="guest-file-input"
        class="picker-trigger-btn"
        [class.btn-disabled]="disabled"
        tabindex="0"
        role="button"
        [attr.aria-disabled]="disabled"
        (keydown.enter)="fileInput.click()"
        (keydown.space)="fileInput.click(); $event.preventDefault()"
      >
        <span class="picker-icon" aria-hidden="true">📸</span>
        <span class="picker-label-text">
          {{ label || 'Seleccionar fotos y videos' }}
        </span>
        <span class="picker-hint-text">
          Toca para elegir desde tu galería o cámara
        </span>
      </label>
    </div>
  `,
  styles: `
    .file-picker-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      border: 2px dashed #94a3b8;
      border-radius: 0.75rem;
      padding: 1.5rem 1rem;
      background-color: #f8fafc;
      transition: border-color 0.2s ease, background-color 0.2s ease;
      text-align: center;
    }
    .file-picker-container.drag-over {
      border-color: #3b82f6;
      background-color: #eff6ff;
    }
    .visually-hidden-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .picker-trigger-btn {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-width: 200px;
      min-height: 44px; /* WCAG 2.2 AA target size */
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: background-color 0.15s ease;
      outline: none;
    }
    .picker-trigger-btn:hover:not(.btn-disabled) {
      background-color: #1d4ed8;
    }
    .picker-trigger-btn:focus-visible {
      outline: 3px solid #60a5fa;
      outline-offset: 2px;
    }
    .picker-trigger-btn.btn-disabled {
      background-color: #cbd5e1;
      color: #64748b;
      cursor: not-allowed;
      box-shadow: none;
    }
    .picker-icon {
      font-size: 1.75rem;
      line-height: 1;
    }
    .picker-label-text {
      font-size: 1rem;
      font-weight: 600;
    }
    .picker-hint-text {
      font-size: 0.8125rem;
      font-weight: 400;
      opacity: 0.9;
    }
  `
})
export class FilePickerComponent {
  @Input() label?: string;
  @Input() disabled = false;

  @Output() filesSelected = new EventEmitter<File[]>();

  isDragOver = false;

  onFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const filesArray = Array.from(target.files);
      this.filesSelected.emit(filesArray);
      target.value = ''; // Reset input to allow selecting same files again
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled) {
      this.isDragOver = true;
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (!this.disabled && event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const filesArray = Array.from(event.dataTransfer.files);
      this.filesSelected.emit(filesArray);
    }
  }
}
