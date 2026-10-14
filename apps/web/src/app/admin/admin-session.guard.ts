import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { canonicalizeAdminReturnUrl } from '../navigation/return-url.canonicalizer.js';
import { AdminSessionService } from './admin-session.service.js';

/** Revalidates the server session; the UI is never an administrative authority. */
export const adminSessionGuard: CanActivateFn = async (_route, state) => {
  const session = inject(AdminSessionService);
  const router = inject(Router);
  if (session.logoutUncertainty()) return true;
  const snapshot = await session.refreshSession();
  if (snapshot.state === 'ADMIN_ACTIVE') return true;
  if (snapshot.state === 'UNAVAILABLE') return true;
  return router.createUrlTree(['/admin/ingresar'], {
    queryParams: { returnUrl: canonicalizeAdminReturnUrl(state.url) }
  });
};
