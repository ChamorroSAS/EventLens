import type { PublicEntryRouteDescriptor } from './public-entry-routes.contract';
import { OrganizerDashboardComponent } from '../organizer/organizer-dashboard.component';
import { AdminAppShellComponent } from '../admin/admin-app-shell.component';
import { AdminLoginComponent } from '../admin/admin-login.component';

export const ORGANIZER_EVENT_DETAIL_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ORGANIZER_EVENT_DETAIL' as const,
  path: '/mis-eventos/:eventId',
  title: 'Detalle del evento — Phoeve',
  context: 'ORGANIZER_OPERATIONS',
  component: OrganizerDashboardComponent
});

export const ORGANIZER_EVENT_CONFIG_GENERAL_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ORGANIZER_EVENT_CONFIG_GENERAL' as const,
  path: '/mis-eventos/:eventId/configuracion/general',
  title: 'Configuración general — Phoeve',
  context: 'ORGANIZER_OPERATIONS',
  component: OrganizerDashboardComponent
});

export const ORGANIZER_EVENT_CONFIG_SCHEDULE_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ORGANIZER_EVENT_CONFIG_SCHEDULE' as const,
  path: '/mis-eventos/:eventId/configuracion/programacion',
  title: 'Programación del evento — Phoeve',
  context: 'ORGANIZER_OPERATIONS',
  component: OrganizerDashboardComponent
});

export const ADMIN_LOGIN_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ADMIN_LOGIN' as const,
  path: '/admin/ingresar',
  title: 'Acceso administrativo — Phoeve',
  context: 'AUTH_ENTRY',
  component: AdminLoginComponent
});

export const ADMIN_EVENTS_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ADMIN_EVENTS' as const,
  path: '/admin/eventos',
  title: 'Búsqueda administrativa — Phoeve',
  context: 'ADMIN_OPERATIONS',
  component: AdminAppShellComponent
});

export const ADMIN_EVENT_DETAIL_ROUTE_DESCRIPTOR: PublicEntryRouteDescriptor = Object.freeze({
  id: 'ADMIN_EVENT_DETAIL' as const,
  path: '/admin/eventos/:eventId',
  title: 'Detalle administrativo — Phoeve',
  context: 'ADMIN_OPERATIONS',
  component: AdminAppShellComponent
});
