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
        <p class="el-form-field__error" [id]="inputId + '-error'" role="alert">{{ errorText }}</p>
      }
    </div>
  `,
  styleUrl: './form-field.component.scss',
})
export class FormFieldComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) inputId!: string;
  @Input() required = false;
  @Input() helperText = '';
  @Input() errorText = '';
}
