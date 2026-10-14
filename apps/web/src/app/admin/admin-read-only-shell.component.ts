import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminSessionService } from './admin-session.service.js';

/** Temporary routed boundary for the read-only MVP; it intentionally imports no legacy admin UI. */
@Component({
  selector: 'eventlens-admin-read-only-shell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="admin-shell" aria-labelledby="admin-shell-title">
      <header class="admin-shell__header">
        <div>
          <p class="admin-shell__eyebrow">Phoeve</p>
          <h1 id="admin-shell-title" tabindex="-1">Consola administrativa</h1>
        </div>
        @if (session.state() === 'ADMIN_ACTIVE') {
          <button type="button" (click)="logout()">Cerrar sesión</button>
        }
      </header>

      @if (session.state() === 'UNAVAILABLE') {
        <section class="admin-shell__notice" role="status" aria-live="polite">
          <p>El acceso administrativo no está disponible. Reintenta más tarde.</p>
          @if (session.logoutUncertainty(); as message) { <p>{{ message }}</p> }
          <button type="button" (click)="retry()">{{ session.logoutUncertainty() ? 'Reintentar cierre de sesión' : 'Reintentar' }}</button>
        </section>
      } @else if (session.state() === 'ADMIN_ACTIVE' && !session.isRevalidating()) {
        <section class="admin-shell__content" aria-live="polite">
          <p>La búsqueda administrativa estará disponible aquí.</p>
        </section>
      } @else {
        <section class="admin-shell__content" role="status" aria-live="polite">
          <p>Comprobando la sesión administrativa…</p>
        </section>
      }
    </main>
  `,
  styles: [`
    .admin-shell { max-width: 72rem; margin: 0 auto; padding: 1.5rem; color: var(--el-color-text); }
    .admin-shell__header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--el-color-border); padding-bottom: 1rem; }
    .admin-shell__eyebrow { color: var(--el-color-text-secondary); font-size: .875rem; margin: 0 0 .25rem; }
    h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2rem); }
    button { min-height: 2.75rem; border: 1px solid var(--el-color-border); border-radius: .5rem; padding: .5rem 1rem; background: var(--el-color-surface); color: var(--el-color-text); font: inherit; }
    button:focus-visible { outline: 2px solid var(--el-color-accent); outline-offset: 2px; }
    .admin-shell__notice, .admin-shell__content { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--el-color-border); border-radius: .75rem; }
  `]
})
export class AdminReadOnlyShellComponent {
  readonly session = inject(AdminSessionService);
  private readonly router = inject(Router, { optional: true });

  async retry(): Promise<void> {
    if (this.session.logoutUncertainty()) {
      const outcome = await this.session.retryLogout();
      if (outcome.status === 'CONFIRMED') await this.router?.navigateByUrl('/admin/ingresar');
      return;
    }
    await this.session.refreshSession();
  }

  async logout(): Promise<void> {
    await this.session.logout();
    await this.router?.navigateByUrl('/admin/ingresar');
  }
}
