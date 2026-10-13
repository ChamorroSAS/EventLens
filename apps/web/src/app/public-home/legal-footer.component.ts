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
      background-color: #17202a;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 3.5rem 1.5rem 2.5rem;
      color: #94a3b8;
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
      filter: brightness(0) invert(1);
    }
    .el-footer__tagline {
      font-size: 0.9375rem;
      line-height: 1.5;
      margin: 0;
      color: #cbd5e1;
      max-width: 480px;
    }
    .el-footer__bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
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
      color: #94a3b8;
    }
  `]
})
export class LegalFooterComponent {}
