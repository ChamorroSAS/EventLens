import { CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA, type PublicEntryRouteDescriptor } from './public-entry-routes.contract';
import { AdminOrganizersComponent } from '../admin/admin-organizers.component.js';
import { OrganizerTemporaryPasswordComponent } from '../organizer-auth/organizer-temporary-password.component.js';
import { PUBLIC_HOME_ROUTE_DESCRIPTOR } from '../public-home/public-home.component';
import { ORGANIZER_LOGIN_ROUTE_DESCRIPTOR } from '../organizer-auth/organizer-login.component';
import { BETA_ACCESS_REQUEST_ROUTE_DESCRIPTOR } from '../beta-access/beta-access-request.component';
import { ORGANIZER_ACCOUNT_ROUTE_DESCRIPTOR } from '../organizer-account/organizer-account.component';
import { ORGANIZER_DASHBOARD_ROUTE_DESCRIPTOR } from '../organizer/organizer-dashboard.component';
import { GUEST_EVENT_ENTRY_ROUTE_DESCRIPTOR } from '../guest/guest-container.component';
import { PUBLIC_NOT_FOUND_ROUTE_DESCRIPTOR } from './public-not-found.component';
import {
  ORGANIZER_EVENT_DETAIL_ROUTE_DESCRIPTOR,
  ORGANIZER_EVENT_CONFIG_GENERAL_ROUTE_DESCRIPTOR,
  ORGANIZER_EVENT_CONFIG_SCHEDULE_ROUTE_DESCRIPTOR,
  ADMIN_LOGIN_ROUTE_DESCRIPTOR,
  ADMIN_EVENTS_ROUTE_DESCRIPTOR,
  ADMIN_EVENT_DETAIL_ROUTE_DESCRIPTOR
} from './panel-routes.descriptors';

export const ALL_PUBLIC_ENTRY_ROUTES: readonly PublicEntryRouteDescriptor[] = Object.freeze([
  PUBLIC_HOME_ROUTE_DESCRIPTOR,
  ORGANIZER_LOGIN_ROUTE_DESCRIPTOR,
  { ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ORGANIZER_PASSWORD_CHANGE, component: OrganizerTemporaryPasswordComponent },
  BETA_ACCESS_REQUEST_ROUTE_DESCRIPTOR,
  ORGANIZER_ACCOUNT_ROUTE_DESCRIPTOR,
  ORGANIZER_DASHBOARD_ROUTE_DESCRIPTOR,
  ORGANIZER_EVENT_DETAIL_ROUTE_DESCRIPTOR,
  ORGANIZER_EVENT_CONFIG_GENERAL_ROUTE_DESCRIPTOR,
  ORGANIZER_EVENT_CONFIG_SCHEDULE_ROUTE_DESCRIPTOR,
  GUEST_EVENT_ENTRY_ROUTE_DESCRIPTOR,
  ADMIN_LOGIN_ROUTE_DESCRIPTOR,
  ADMIN_EVENTS_ROUTE_DESCRIPTOR,
  { ...CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA.ADMIN_ORGANIZERS, component: AdminOrganizersComponent },
  ADMIN_EVENT_DETAIL_ROUTE_DESCRIPTOR,
  PUBLIC_NOT_FOUND_ROUTE_DESCRIPTOR
]);
