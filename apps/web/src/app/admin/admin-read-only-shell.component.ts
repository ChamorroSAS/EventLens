import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { AdminReadOnlyEventSearchComponent } from './admin-read-only-event-search.component.js';
import { AdminConsoleShellComponent } from './admin-console-shell.component.js';
import { AdminReadOnlyEventDetailComponent } from './admin-read-only-event-detail.component.js';
import { AdminSessionService } from './admin-session.service.js';

/** Routed read-only boundary, without historical administrative mutation components. */
@Component({
  selector: 'eventlens-admin-read-only-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, AdminConsoleShellComponent, AdminReadOnlyEventSearchComponent, AdminReadOnlyEventDetailComponent],
  template: `
    <eventlens-admin-console-shell activeNav="eventos">
      <section class="admin-shell" aria-labelledby="admin-shell-title">
        <h1 id="admin-shell-title" tabindex="-1">Consola administrativa</h1>

        @if (session.state() === 'UNAVAILABLE') {
          <section class="admin-shell__notice" role="status" aria-live="polite">
            <p>El acceso administrativo no está disponible. Reintenta más tarde.</p>
            @if (session.logoutUncertainty(); as message) { <p>{{ message }}</p> }
            <button type="button" (click)="retry()">{{ session.logoutUncertainty() ? 'Reintentar cierre de sesión' : 'Reintentar' }}</button>
          </section>
        } @else if (session.state() === 'ANONYMOUS') {
          <section class="admin-shell__notice" role="status">
            <p>La sesión administrativa ya no permite consultar estos datos.</p>
            <a routerLink="/admin/ingresar" [queryParams]="{returnUrl: '/admin/eventos'}">Volver al acceso administrativo</a>
            @if (session.logoutUncertainty(); as message) {
              <p>{{ message }}</p>
              <button type="button" (click)="retry()">Reintentar cierre de sesión</button>
            }
          </section>
        } @else if (session.state() === 'ADMIN_ACTIVE' && !session.isRevalidating()) {
          <section class="admin-shell__content" aria-live="polite">
            @if (eventId(); as id) {
              <eventlens-admin-read-only-event-detail [eventId]="id" />
            } @else {
              <eventlens-admin-read-only-event-search />
            }
          </section>
        } @else {
          <section class="admin-shell__content" role="status" aria-live="polite">
            <p>Comprobando la sesión administrativa…</p>
          </section>
        }
      </section>
    </eventlens-admin-console-shell>
  `,
  styles: [`
    .admin-shell { max-width: 72rem; margin: 0 auto; padding: 1.5rem; color: var(--el-color-text); }
    h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2rem); }
    button { min-height: 2.75rem; border: 1px solid var(--el-color-border); border-radius: .5rem; padding: .5rem 1rem; background: var(--el-color-surface); color: var(--el-color-text); font: inherit; }
    button:focus-visible { outline: 2px solid var(--el-color-accent); outline-offset: 2px; }
    .admin-shell__notice, .admin-shell__content { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--el-color-border); border-radius: .75rem; }
  `]
})
export class AdminReadOnlyShellComponent {
  readonly session = inject(AdminSessionService);
  private readonly router = inject(Router, { optional: true });
  private readonly params = toSignal(inject(ActivatedRoute, { optional: true })?.paramMap ?? of(null));
  readonly eventId = computed(() => this.params()?.get('eventId') ?? null);

  async retry(): Promise<void> {
    if (this.session.logoutUncertainty()) {
      const outcome = await this.session.retryLogout();
      if (outcome.status === 'CONFIRMED') await this.router?.navigateByUrl('/admin/ingresar');
      return;
    }
    await this.session.refreshSession();
  }
}
