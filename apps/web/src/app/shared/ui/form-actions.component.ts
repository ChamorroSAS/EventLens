import { Component, Input } from '@angular/core';

@Component({
  selector: 'eventlens-form-actions',
  standalone: true,
  template: `
    <div class="el-form-actions" [class.el-form-actions--sticky]="sticky">
      <ng-content />
    </div>
  `,
  styleUrl: './form-actions.component.scss',
})
export class FormActionsComponent {
  @Input() sticky = false;
}
