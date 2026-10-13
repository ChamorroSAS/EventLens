import { Component, Input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'small' | 'medium' | 'large';

@Component({
  selector: 'eventlens-button',
  standalone: true,
  template: `
    <button
      [attr.type]="type"
      [class]="'el-button el-button--' + variant + ' el-button--' + size + (block ? ' el-button--block' : '')"
      [disabled]="disabled || loading"
      [attr.aria-busy]="loading ? 'true' : null"
      [attr.aria-label]="ariaLabel || null"
    >
      @if (loading) {
        <span class="el-button__spinner" aria-hidden="true"></span>
      }
      <span class="el-button__label"><ng-content /></span>
    </button>
  `,
  styleUrl: './button.component.scss',
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'medium';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() block = false;
  @Input() ariaLabel = '';
}
