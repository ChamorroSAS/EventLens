import type { Type } from '@angular/core';

export type PublicEntryRouteId =
  | 'PUBLIC_HOME'
  | 'ORGANIZER_LOGIN'
  | 'BETA_ACCESS_REQUEST'
  | 'ORGANIZER_ACCOUNT'
  | 'ORGANIZER_DASHBOARD'
  | 'GUEST_EVENT_ENTRY'
  | 'NOT_FOUND';

export type PublicEntryRouteContext =
  | 'PUBLIC'
  | 'AUTH_ENTRY'
  | 'PUBLIC_FORM'
  | 'ORGANIZER_ACCOUNT'
  | 'ORGANIZER_OPERATIONS'
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
    title: 'EventLens — Tus recuerdos de celebración en un solo lugar',
    context: 'PUBLIC'
  },
  ORGANIZER_LOGIN: {
    id: 'ORGANIZER_LOGIN',
    path: APPROVED_PUBLIC_ENTRY_PATHS.LOGIN,
    title: 'Iniciar sesión — EventLens',
    context: 'AUTH_ENTRY'
  },
  BETA_ACCESS_REQUEST: {
    id: 'BETA_ACCESS_REQUEST',
    path: APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS,
    title: 'Solicitar acceso a la Beta — EventLens',
    context: 'PUBLIC_FORM'
  },
  ORGANIZER_ACCOUNT: {
    id: 'ORGANIZER_ACCOUNT',
    path: APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT,
    title: 'Mi cuenta — EventLens',
    context: 'ORGANIZER_ACCOUNT'
  },
  ORGANIZER_DASHBOARD: {
    id: 'ORGANIZER_DASHBOARD',
    path: APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD,
    title: 'Mis eventos — EventLens',
    context: 'ORGANIZER_OPERATIONS'
  },
  GUEST_EVENT_ENTRY: {
    id: 'GUEST_EVENT_ENTRY',
    path: APPROVED_PUBLIC_ENTRY_PATHS.GUEST_PATTERN,
    title: 'Acceso al evento — EventLens',
    context: 'GUEST'
  },
  NOT_FOUND: {
    id: 'NOT_FOUND',
    path: APPROVED_PUBLIC_ENTRY_PATHS.WILDCARD,
    title: 'Página no encontrada — EventLens',
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
