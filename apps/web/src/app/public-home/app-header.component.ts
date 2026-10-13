import {
  Component,
  HostListener,
  inject,
  signal
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { APPROVED_PUBLIC_ENTRY_PATHS } from '../navigation/public-entry-routes.contract';
import { PublicEntryRouterService } from '../navigation/public-entry-router.service';
import { OrganizerSessionService } from '../organizer-session.service';

@Component({
  selector: 'eventlens-app-header',
  standalone: true,
  template: `
    <header class="el-header" role="banner">
      <div class="el-header__container">
        <!-- Logo de marca -->
        <a
          class="el-header__brand"
          [attr.href]="homePath"
          (click)="onNavigateHome($event)"
          aria-label="EventLens — Inicio"
        >
          <img
            src="/assets/branding/logo-primary.svg"
            alt="EventLens"
            class="el-header__logo"
            width="128"
            height="32"
          />
        </a>

        <!-- Navegación desktop -->
        <nav class="el-header__nav el-header__nav--desktop" aria-label="Navegación principal">
          <ul class="el-nav-list">
            <li>
              <a [attr.href]="'/#como-funciona'" (click)="onAnchorClick($event, 'como-funciona')">
                Cómo funciona
              </a>
            </li>
            <li>
              <a [attr.href]="'/#beneficios'" (click)="onAnchorClick($event, 'beneficios')">
                Beneficios
              </a>
            </li>
            <li>
              <a [attr.href]="'/#privacidad'" (click)="onAnchorClick($event, 'privacidad')">
                Privacidad
              </a>
            </li>
            <li>
              <a [attr.href]="'/#preguntas-frecuentes'" (click)="onAnchorClick($event, 'preguntas-frecuentes')">
                Preguntas frecuentes
              </a>
            </li>
          </ul>
        </nav>

        <!-- Acciones adaptativas según estado de sesión -->
        <div class="el-header__actions el-header__actions--desktop">
          @if (sessionService.state() === 'ORGANIZER_ACTIVE') {
            <a
              class="el-btn-nav"
              [attr.href]="eventsPath"
              (click)="onNavigate($event, eventsPath)"
            >
              Mis eventos
            </a>
            <a
              class="el-btn-nav"
              [attr.href]="accountPath"
              (click)="onNavigate($event, accountPath)"
            >
              Mi cuenta
            </a>
            <button
              type="button"
              class="el-btn-secondary"
              (click)="onLogout()"
              [disabled]="sessionService.isLoggingOut()"
            >
              Cerrar sesión
            </button>
          } @else if (sessionService.state() === 'ORGANIZER_RESTRICTED_DELETION') {
            <a
              class="el-btn-nav"
              [attr.href]="accountPath"
              (click)="onNavigate($event, accountPath)"
            >
              Mi cuenta
            </a>
            <button
              type="button"
              class="el-btn-secondary"
              (click)="onLogout()"
              [disabled]="sessionService.isLoggingOut()"
            >
              Cerrar sesión
            </button>
          } @else {
            <!-- Anónimo, checking o indisponible -->
            <a
              class="el-btn-nav"
              [attr.href]="loginPath"
              (click)="onNavigate($event, loginPath)"
            >
              Iniciar sesión
            </a>
            <a
              class="el-btn-cta"
              [attr.href]="betaPath"
              (click)="onNavigate($event, betaPath)"
            >
              Solicitar acceso a la Beta
            </a>
          }
        </div>

        <!-- Botón toggle de menú móvil -->
        <button
          type="button"
          class="el-header__menu-btn"
          [attr.aria-expanded]="mobileMenuOpen()"
          aria-controls="mobile-navigation"
          aria-label="Menú principal de navegación"
          (click)="toggleMobileMenu()"
        >
          <span class="el-menu-icon" aria-hidden="true">
            @if (mobileMenuOpen()) {
              &times;
            } @else {
              &#9776;
            }
          </span>
        </button>
      </div>

      <!-- Menú móvil desplegable -->
      @if (mobileMenuOpen()) {
        <div
          id="mobile-navigation"
          class="el-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menú móvil"
        >
          <nav aria-label="Navegación móvil">
            <ul class="el-mobile-menu__list">
              <li>
                <a [attr.href]="'/#como-funciona'" (click)="onAnchorClick($event, 'como-funciona')">
                  Cómo funciona
                </a>
              </li>
              <li>
                <a [attr.href]="'/#beneficios'" (click)="onAnchorClick($event, 'beneficios')">
                  Beneficios
                </a>
              </li>
              <li>
                <a [attr.href]="'/#privacidad'" (click)="onAnchorClick($event, 'privacidad')">
                  Privacidad
                </a>
              </li>
              <li>
                <a [attr.href]="'/#preguntas-frecuentes'" (click)="onAnchorClick($event, 'preguntas-frecuentes')">
                  Preguntas frecuentes
                </a>
              </li>
            </ul>

            <div class="el-mobile-menu__actions">
              @if (sessionService.state() === 'ORGANIZER_ACTIVE') {
                <a
                  class="el-mobile-btn"
                  [attr.href]="eventsPath"
                  (click)="onNavigate($event, eventsPath)"
                >
                  Mis eventos
                </a>
                <a
                  class="el-mobile-btn"
                  [attr.href]="accountPath"
                  (click)="onNavigate($event, accountPath)"
                >
                  Mi cuenta
                </a>
                <button
                  type="button"
                  class="el-mobile-btn el-mobile-btn--secondary"
                  (click)="onLogout()"
                  [disabled]="sessionService.isLoggingOut()"
                >
                  Cerrar sesión
                </button>
              } @else if (sessionService.state() === 'ORGANIZER_RESTRICTED_DELETION') {
                <a
                  class="el-mobile-btn"
                  [attr.href]="accountPath"
                  (click)="onNavigate($event, accountPath)"
                >
                  Mi cuenta
                </a>
                <button
                  type="button"
                  class="el-mobile-btn el-mobile-btn--secondary"
                  (click)="onLogout()"
                  [disabled]="sessionService.isLoggingOut()"
                >
                  Cerrar sesión
                </button>
              } @else {
                <a
                  class="el-mobile-btn"
                  [attr.href]="loginPath"
                  (click)="onNavigate($event, loginPath)"
                >
                  Iniciar sesión
                </a>
                <a
                  class="el-mobile-btn el-mobile-btn--cta"
                  [attr.href]="betaPath"
                  (click)="onNavigate($event, betaPath)"
                >
                  Solicitar acceso a la Beta
                </a>
              }
            </div>
          </nav>
        </div>
      }
    </header>
  `,
  styles: [`
    .el-header {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-bottom: 1px solid var(--el-ui-color-border, #e7e7e3);
      position: sticky;
      top: 0;
      z-index: 100;
      font-family: var(--el-ui-font-family-base, 'Manrope', system-ui, sans-serif);
    }
    .el-header__container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0.75rem 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      min-height: 4rem;
    }
    .el-header__brand {
      display: inline-flex;
      align-items: center;
      text-decoration: none;
      min-height: 44px;
      min-width: 44px;
    }
    .el-header__logo {
      height: 32px;
      width: auto;
    }
    .el-header__nav--desktop {
      display: none;
    }
    .el-nav-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: 1.5rem;
      align-items: center;
    }
    .el-nav-list a {
      color: var(--el-ui-color-text-secondary, #667085);
      text-decoration: none;
      font-size: 0.9375rem;
      font-weight: 500;
      padding: 0.5rem 0.25rem;
      transition: color 0.15s ease;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .el-nav-list a:hover {
      color: var(--el-ui-color-text-primary, #17202A);
    }
    .el-nav-list a:focus-visible,
    .el-header__brand:focus-visible,
    .el-btn-nav:focus-visible,
    .el-btn-secondary:focus-visible,
    .el-btn-cta:focus-visible,
    .el-header__menu-btn:focus-visible {
      outline: var(--el-ui-focus-outline-width, 2px) solid var(--el-ui-focus-outline-color, #17345C);
      outline-offset: var(--el-ui-focus-outline-offset, 2px);
      border-radius: 4px;
    }
    .el-header__actions--desktop {
      display: none;
    }
    .el-btn-nav {
      color: var(--el-ui-color-text-primary, #17202A);
      text-decoration: none;
      font-size: 0.9375rem;
      font-weight: 600;
      padding: 0.5rem 0.75rem;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .el-btn-secondary {
      background: none;
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      color: var(--el-ui-color-text-primary, #17202A);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      cursor: pointer;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .el-btn-secondary:hover {
      background-color: var(--el-ui-color-background, #FAFAF8);
    }
    .el-btn-cta {
      background-color: var(--el-ui-color-primary, #17345C);
      color: #ffffff;
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      transition: background-color 0.15s ease;
    }
    .el-btn-cta:hover {
      background-color: var(--el-ui-color-primary-hover, #102A4D);
    }
    .el-header__menu-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      border-radius: 6px;
      width: 44px;
      height: 44px;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--el-ui-color-text-primary, #17202A);
    }
    .el-mobile-menu {
      background-color: var(--el-ui-color-surface, #ffffff);
      border-top: 1px solid var(--el-ui-color-border, #e7e7e3);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }
    .el-mobile-menu__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .el-mobile-menu__list a {
      color: var(--el-ui-color-text-primary, #17202A);
      text-decoration: none;
      font-size: 1rem;
      font-weight: 500;
      min-height: 44px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--el-ui-color-border, #e7e7e3);
    }
    .el-mobile-menu__actions {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding-top: 0.5rem;
    }
    .el-mobile-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      font-size: 1rem;
      font-weight: 600;
      text-decoration: none;
      border-radius: 6px;
      padding: 0.5rem 1rem;
      border: 1px solid var(--el-ui-color-border, #e7e7e3);
      color: var(--el-ui-color-text-primary, #17202A);
      background-color: var(--el-ui-color-surface, #ffffff);
    }
    .el-mobile-btn--cta {
      background-color: var(--el-ui-color-primary, #17345C);
      color: #ffffff;
      border-color: var(--el-ui-color-primary, #17345C);
    }
    .el-mobile-btn--secondary {
      background-color: var(--el-ui-color-background, #FAFAF8);
      cursor: pointer;
    }

    @media (min-width: 768px) {
      .el-header__nav--desktop {
        display: flex;
      }
      .el-header__actions--desktop {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .el-header__menu-btn {
        display: none;
      }
      .el-mobile-menu {
        display: none;
      }
    }
  `]
})
export class AppHeaderComponent {
  readonly router = inject(PublicEntryRouterService, { optional: true });
  readonly sessionService = inject(OrganizerSessionService);
  private readonly doc = inject(DOCUMENT);

  readonly mobileMenuOpen = signal(false);

  readonly homePath = APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  readonly loginPath = APPROVED_PUBLIC_ENTRY_PATHS.LOGIN;
  readonly betaPath = APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS;
  readonly accountPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT;
  readonly eventsPath = APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD;

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileMenuOpen()) {
      this.mobileMenuOpen.set(false);
    }
  }

  onNavigateHome(event: MouseEvent): void {
    if (!this.router) return;
    event.preventDefault();
    this.mobileMenuOpen.set(false);
    void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.HOME);
  }

  onNavigate(event: MouseEvent, path: string): void {
    if (!this.router) return;
    event.preventDefault();
    this.mobileMenuOpen.set(false);
    void this.router.navigateByUrl(path);
  }

  onAnchorClick(event: MouseEvent, anchorId: string): void {
    this.mobileMenuOpen.set(false);
    const currentSafePath = this.router?.currentSafePath() ?? '/';

    if (currentSafePath === APPROVED_PUBLIC_ENTRY_PATHS.HOME) {
      event.preventDefault();
      const targetElement = this.doc.getElementById(anchorId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
        const focusTarget =
          targetElement.querySelector('h2, [tabindex="-1"]') || targetElement;
        (focusTarget as HTMLElement).focus?.();
      }
    } else {
      if (this.router) {
        event.preventDefault();
        void this.router.navigateByUrl(`/#${anchorId}`);
      }
    }
  }

  async onLogout(): Promise<void> {
    this.mobileMenuOpen.set(false);
    await this.sessionService.logout();
    if (this.router) {
      void this.router.navigateByUrl(APPROVED_PUBLIC_ENTRY_PATHS.HOME);
    }
  }
}
