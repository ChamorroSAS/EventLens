import { Component, Input } from '@angular/core';

@Component({
  selector: 'eventlens-form-actions',
  standalone: true,
  template: `
    <div class="el-form-actions" [class.el-form-actions--sticky]="sticky">
      <ng-content />
    </div>
  `,
  styles: `
    .el-form-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--el-space-sm);
      justify-content: flex-end;
    }
    .el-form-actions--sticky {
      position: sticky;
      inset-block-end: 0;
      background-color: var(--el-color-surface);
      padding-block: var(--el-space-md);
    }
  `,
})
export class FormActionsComponent {
  @Input() sticky = false;
}
