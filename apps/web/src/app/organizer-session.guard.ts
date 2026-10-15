import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { OrganizerSessionService } from './organizer-session.service.js';
import { canonicalizeInternalReturnUrl } from './navigation/return-url.canonicalizer.js';

export const organizerSessionGuard: CanActivateFn = async (_route, state) => {
  const session = inject(OrganizerSessionService), router = inject(Router);
  const snapshot = await session.refreshSessionProjection();
  if (snapshot.state === 'PASSWORD_CHANGE_REQUIRED') return router.createUrlTree(['/cambiar-contrasena']);
  if (snapshot.state === 'ORGANIZER_ACTIVE' || snapshot.state === 'UNAVAILABLE') return true;
  if (snapshot.state === 'ORGANIZER_RESTRICTED_DELETION') return state.url.startsWith('/mi-cuenta') ? true : router.createUrlTree(['/mi-cuenta']);
  return router.createUrlTree(['/ingresar'], { queryParams: { returnUrl: canonicalizeInternalReturnUrl(state.url) } });
};
