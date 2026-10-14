import { Routes } from '@angular/router';
import { adminSessionGuard } from './admin/admin-session.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./public-home/public-home.component').then((m) => m.PublicHomePageComponent),
    title: 'Phoeve — Tus recuerdos de celebración en un solo lugar',
  },
  {
    path: 'ingresar',
    loadComponent: () =>
      import('./organizer-auth/organizer-login.component').then((m) => m.OrganizerLoginComponent),
    title: 'Iniciar sesión — Phoeve',
  },
  {
    path: 'solicitar-acceso',
    loadComponent: () =>
      import('./beta-access/beta-access-request.component').then(
        (m) => m.BetaAccessRequestComponent
      ),
    title: 'Solicitar acceso a la Beta — Phoeve',
  },
  {
    path: 'mi-cuenta',
    loadComponent: () =>
      import('./organizer-account/organizer-account.component').then(
        (m) => m.OrganizerAccountComponent
      ),
    title: 'Mi cuenta — Phoeve',
  },
  {
    path: 'mis-eventos',
    loadComponent: () =>
      import('./organizer/organizer-dashboard.component').then(
        (m) => m.OrganizerDashboardComponent
      ),
    title: 'Mis eventos — Phoeve',
  },
  {
    path: 'mis-eventos/:eventId',
    loadComponent: () =>
      import('./organizer/organizer-dashboard.component').then(
        (m) => m.OrganizerDashboardComponent
      ),
    title: 'Detalle del evento — Phoeve',
  },
  {
    path: 'mis-eventos/:eventId/configuracion/general',
    loadComponent: () =>
      import('./organizer/organizer-dashboard.component').then(
        (m) => m.OrganizerDashboardComponent
      ),
    title: 'Configuración general — Phoeve',
    data: { section: 'general' },
  },
  {
    path: 'mis-eventos/:eventId/configuracion/programacion',
    loadComponent: () =>
      import('./organizer/organizer-dashboard.component').then(
        (m) => m.OrganizerDashboardComponent
      ),
    title: 'Programación del evento — Phoeve',
    data: { section: 'programacion' },
  },
  {
    path: 'g/:lookupKey',
    loadComponent: () =>
      import('./guest/guest-container.component').then((m) => m.GuestContainerComponent),
    title: 'Acceso al evento — Phoeve',
  },
  {
    path: 'admin/ingresar',
    loadComponent: () =>
      import('./admin/admin-login.component').then((m) => m.AdminLoginComponent),
    title: 'Acceso administrativo — Phoeve',
  },
  {
    path: 'admin/eventos',
    canActivate: [adminSessionGuard],
    loadComponent: () =>
      import('./admin/admin-read-only-shell.component').then((m) => m.AdminReadOnlyShellComponent),
    title: 'Búsqueda administrativa — Phoeve',
  },
  {
    path: 'admin/eventos/:eventId',
    canActivate: [adminSessionGuard],
    loadComponent: () =>
      import('./admin/admin-read-only-shell.component').then((m) => m.AdminReadOnlyShellComponent),
    title: 'Detalle administrativo — Phoeve',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./navigation/public-not-found.component').then((m) => m.PublicNotFoundComponent),
    title: 'Página no encontrada — Phoeve',
  },
];

