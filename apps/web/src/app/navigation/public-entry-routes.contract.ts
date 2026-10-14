import type { Type } from '@angular/core';

export type PublicEntryRouteId =
  | 'PUBLIC_HOME'
  | 'ORGANIZER_LOGIN'
  | 'BETA_ACCESS_REQUEST'
  | 'ORGANIZER_ACCOUNT'
  | 'ORGANIZER_DASHBOARD'
  | 'ORGANIZER_EVENT_DETAIL'
  | 'ORGANIZER_EVENT_CONFIG_GENERAL'
  | 'ORGANIZER_EVENT_CONFIG_SCHEDULE'
  | 'GUEST_EVENT_ENTRY'
  | 'ADMIN_LOGIN'
  | 'ADMIN_EVENTS'
  | 'ADMIN_EVENT_DETAIL'
  | 'NOT_FOUND';

export type PublicEntryRouteContext =
  | 'PUBLIC'
  | 'AUTH_ENTRY'
  | 'PUBLIC_FORM'
  | 'ORGANIZER_ACCOUNT'
  | 'ORGANIZER_OPERATIONS'
  | 'ADMIN_OPERATIONS'
  | 'GUEST'
  | 'PUBLIC_ERROR';

export const PUBLIC_HOME_ANCHORS = [
  'como-funciona',
  'beneficios',
  'privacidad',
  'preguntas-frecuentes'
] as const;

export type PublicHomeAnchorId = (typeof PUBLIC_HOME_ANCHORS)[number];

export const APPROVED_PUBLIC_ENTRY_PATHS = Object.freeze({
  HOME: '/',
  LOGIN: '/ingresar',
  BETA_ACCESS: '/solicitar-acceso',
  ORGANIZER_ACCOUNT: '/mi-cuenta',
  ORGANIZER_DASHBOARD: '/mis-eventos',
  GUEST_PREFIX: '/g/',
  GUEST_PATTERN: '/g/:lookupKey',
  WILDCARD: '**'
});

export const APPROVED_PANEL_PATHS = Object.freeze({
  ORGANIZER_EVENT_DETAIL: '/mis-eventos/:eventId',
  ORGANIZER_EVENT_CONFIG_GENERAL: '/mis-eventos/:eventId/configuracion/general',
  ORGANIZER_EVENT_CONFIG_SCHEDULE: '/mis-eventos/:eventId/configuracion/programacion',
  ADMIN_LOGIN: '/admin/ingresar',
  ADMIN_EVENTS: '/admin/eventos',
  ADMIN_EVENT_DETAIL: '/admin/eventos/:eventId'
});

export interface PublicEntryRouteMetadata {
  readonly id: PublicEntryRouteId;
  readonly path: string;
  readonly title: string;
  readonly context: PublicEntryRouteContext;
}

export const CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA: Readonly<
  Record<PublicEntryRouteId, PublicEntryRouteMetadata>
> = Object.freeze({
  PUBLIC_HOME: {
    id: 'PUBLIC_HOME',
    path: APPROVED_PUBLIC_ENTRY_PATHS.HOME,
    title: 'Phoeve — Tus recuerdos de celebración en un solo lugar',
    context: 'PUBLIC'
  },
  ORGANIZER_LOGIN: {
    id: 'ORGANIZER_LOGIN',
    path: APPROVED_PUBLIC_ENTRY_PATHS.LOGIN,
    title: 'Iniciar sesión — Phoeve',
    context: 'AUTH_ENTRY'
  },
  BETA_ACCESS_REQUEST: {
    id: 'BETA_ACCESS_REQUEST',
    path: APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS,
    title: 'Solicitar acceso a la Beta — Phoeve',
    context: 'PUBLIC_FORM'
  },
  ORGANIZER_ACCOUNT: {
    id: 'ORGANIZER_ACCOUNT',
    path: APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT,
    title: 'Mi cuenta — Phoeve',
    context: 'ORGANIZER_ACCOUNT'
  },
  ORGANIZER_DASHBOARD: {
    id: 'ORGANIZER_DASHBOARD',
    path: APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD,
    title: 'Mis eventos — Phoeve',
    context: 'ORGANIZER_OPERATIONS'
  },
  ORGANIZER_EVENT_DETAIL: {
    id: 'ORGANIZER_EVENT_DETAIL',
    path: APPROVED_PANEL_PATHS.ORGANIZER_EVENT_DETAIL,
    title: 'Detalle del evento — Phoeve',
    context: 'ORGANIZER_OPERATIONS'
  },
  ORGANIZER_EVENT_CONFIG_GENERAL: {
    id: 'ORGANIZER_EVENT_CONFIG_GENERAL',
    path: APPROVED_PANEL_PATHS.ORGANIZER_EVENT_CONFIG_GENERAL,
    title: 'Configuración general — Phoeve',
    context: 'ORGANIZER_OPERATIONS'
  },
  ORGANIZER_EVENT_CONFIG_SCHEDULE: {
    id: 'ORGANIZER_EVENT_CONFIG_SCHEDULE',
    path: APPROVED_PANEL_PATHS.ORGANIZER_EVENT_CONFIG_SCHEDULE,
    title: 'Programación del evento — Phoeve',
    context: 'ORGANIZER_OPERATIONS'
  },
  GUEST_EVENT_ENTRY: {
    id: 'GUEST_EVENT_ENTRY',
    path: APPROVED_PUBLIC_ENTRY_PATHS.GUEST_PATTERN,
    title: 'Acceso al evento — Phoeve',
    context: 'GUEST'
  },
  ADMIN_LOGIN: {
    id: 'ADMIN_LOGIN',
    path: APPROVED_PANEL_PATHS.ADMIN_LOGIN,
    title: 'Acceso administrativo — Phoeve',
    context: 'AUTH_ENTRY'
  },
  ADMIN_EVENTS: {
    id: 'ADMIN_EVENTS',
    path: APPROVED_PANEL_PATHS.ADMIN_EVENTS,
    title: 'Búsqueda administrativa — Phoeve',
    context: 'ADMIN_OPERATIONS'
  },
  ADMIN_EVENT_DETAIL: {
    id: 'ADMIN_EVENT_DETAIL',
    path: APPROVED_PANEL_PATHS.ADMIN_EVENT_DETAIL,
    title: 'Detalle administrativo — Phoeve',
    context: 'ADMIN_OPERATIONS'
  },
  NOT_FOUND: {
    id: 'NOT_FOUND',
    path: APPROVED_PUBLIC_ENTRY_PATHS.WILDCARD,
    title: 'Página no encontrada — Phoeve',
    context: 'PUBLIC_ERROR'
  }
});

export interface PublicEntryRouteActivationContext {
  readonly pathname: string;
  readonly safePathname: string;
  readonly params: Readonly<Record<string, string>>;
  readonly queryParams: Readonly<Record<string, string>>;
  readonly fragment: string | null;
}

export type PublicEntryRouteGuardResult = boolean | string | Promise<boolean | string>;

export type PublicEntryRouteGuard = (
  context: PublicEntryRouteActivationContext
) => PublicEntryRouteGuardResult;

export interface PublicEntryRouteDescriptor {
  readonly id: PublicEntryRouteId;
  readonly path: string;
  readonly title: string;
  readonly context: PublicEntryRouteContext;
  readonly component: Type<unknown>;
  readonly canActivate?: readonly PublicEntryRouteGuard[];
}
