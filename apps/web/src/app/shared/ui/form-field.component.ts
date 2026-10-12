import { Component, Input } from '@angular/core';

@Component({
  selector: 'eventlens-form-field',
  standalone: true,
  template: `
    <div class="el-form-field" [class.el-form-field--error]="!!errorText">
      <label class="el-form-field__label" [attr.for]="inputId">
        {{ label }}
        @if (required) {
          <span class="el-form-field__required" aria-hidden="true">*</span>
        }
      </label>
      <ng-content />
      @if (helperText) {
        <p class="el-form-field__helper" [id]="inputId + '-helper'">{{ helperText }}</p>
      }
      @if (errorText) {
        <p class="el-form-field__error" [id]="inputId + '-error'">{{ errorText }}</p>
      }
    </div>
  `,
  styles: `
    .el-form-field {
      display: flex;
      flex-direction: column;
      gap: var(--el-space-xs);
      font-family: var(--el-font-family);
    }
    .el-form-field__label {
      font-size: var(--el-font-size-label);
      font-weight: var(--el-font-weight-semibold);
      color: var(--el-color-text);
    }
    .el-form-field__required {
      color: var(--el-color-danger);
      margin-inline-start: var(--el-space-xs);
    }
    .el-form-field__helper {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      color: var(--el-color-text-secondary);
    }
    .el-form-field__error {
      margin: 0;
      font-size: var(--el-font-size-body-small);
      font-weight: var(--el-font-weight-medium);
      color: var(--el-color-danger);
    }
  `,
})
export class FormFieldComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) inputId!: string;
  @Input() required = false;
  @Input() helperText = '';
  @Input() errorText = '';
}
