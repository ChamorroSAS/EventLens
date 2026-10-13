import { Component } from '@angular/core';

@Component({
  selector: 'eventlens-legal-footer',
  standalone: true,
  template: `
    <footer class="el-footer" role="contentinfo">
      <div class="el-footer__container">
        <div class="el-footer__brand">
          <img
            src="/assets/branding/logo-primary.svg"
            alt="EventLens"
            class="el-footer__logo"
            width="128"
            height="32"
          />
          <p class="el-footer__tagline">
            Los recuerdos de cada celebración, reunidos en un solo lugar
          </p>
        </div>
        <div class="el-footer__bottom">
          <p class="el-footer__copyright">
            &copy; 2026 EventLens. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    .el-footer {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-top: 1px solid var(--el-ui-color-border, #e7e7e3);
      padding: 3rem 1.5rem 2rem;
      color: var(--el-ui-color-text-secondary, #667085);
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
    }
    .el-footer__container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .el-footer__brand {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .el-footer__logo {
      height: 32px;
      width: auto;
    }
    .el-footer__tagline {
      font-size: 0.9375rem;
      line-height: 1.5;
      margin: 0;
      color: var(--el-ui-color-text-secondary, #667085);
      max-width: 480px;
    }
    .el-footer__bottom {
      border-top: 1px solid var(--el-ui-color-border, #e7e7e3);
      padding-top: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .el-footer__copyright {
      font-size: 0.875rem;
      margin: 0;
      color: var(--el-ui-color-text-secondary, #667085);
    }
  `]
})
export class LegalFooterComponent {}
