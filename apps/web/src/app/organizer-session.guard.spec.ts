import { TestBed } from '@angular/core/testing';
import { Router, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { organizerSessionGuard } from './organizer-session.guard.js';
import { OrganizerSessionService } from './organizer-session.service.js';

describe('mandatory initial password route boundary', () => {
  it('revalidates a direct private deep link and redirects a password-only session', async () => {
    const session={refreshSessionProjection:vi.fn(async()=>({state:'PASSWORD_CHANGE_REQUIRED'}))};
    const tree={toString:()=>'/cambiar-contrasena'};
    const router={createUrlTree:vi.fn(()=>tree)};
    TestBed.configureTestingModule({providers:[{provide:OrganizerSessionService,useValue:session},{provide:Router,useValue:router}]});
    const result=await TestBed.runInInjectionContext(()=>organizerSessionGuard({} as never,{url:'/mis-eventos/private-id/configuracion/general'} as RouterStateSnapshot));
    expect(session.refreshSessionProjection).toHaveBeenCalledOnce();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/cambiar-contrasena']);
    expect(result).toBe(tree);
  });
});
