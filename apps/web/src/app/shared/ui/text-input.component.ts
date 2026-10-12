import { Component, forwardRef, Input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'eventlens-text-input',
  standalone: true,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextInputComponent), multi: true },
  ],
  template: `
    <input
      class="el-text-input"
      [id]="inputId"
      [attr.type]="type"
      [attr.placeholder]="placeholder || null"
      [attr.required]="required ? '' : null"
      [attr.aria-invalid]="invalid ? 'true' : null"
      [attr.aria-describedby]="describedBy"
      [value]="value()"
      [disabled]="disabled()"
      (input)="handleInput($event)"
      (blur)="handleBlur()"
    />
  `,
  styles: `
    @use 'mixins' as m;

    .el-text-input {
      inline-size: 100%;
      box-sizing: border-box;
      font-family: var(--el-font-family);
      font-size: var(--el-font-size-body);
      color: var(--el-color-text);
      background-color: var(--el-color-surface);
      border: 1px solid var(--el-color-border-strong);
      border-radius: var(--el-radius-md);
      padding: var(--el-space-sm) var(--el-space-md);
      min-block-size: var(--el-touch-target-min);
    }
    .el-text-input::placeholder {
      color: var(--el-color-text-disabled);
    }
    .el-text-input:focus-visible {
      @include m.el-focus-ring;
      border-color: var(--el-color-primary);
    }
    .el-text-input[aria-invalid='true'] {
      border-color: var(--el-color-danger);
    }
    .el-text-input:disabled {
      background-color: var(--el-color-surface-muted);
      color: var(--el-color-text-disabled);
      cursor: not-allowed;
    }
  `,
})
export class TextInputComponent implements ControlValueAccessor {
  @Input() inputId = '';
  @Input() type: 'text' | 'email' | 'search' = 'text';
  @Input() placeholder = '';
  @Input() required = false;
  @Input() invalid = false;
  @Input() describedBy: string | null = null;

  readonly value = signal('');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  handleInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
