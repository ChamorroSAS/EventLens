import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminOrganizersComponent } from './admin-organizers.component.js';
import { AdminOrganizersApiService } from './admin-organizers-api.service.js';
import { AdminSessionService } from './admin-session.service.js';

afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

it('clears a one-time credential after a minute without waiting for another server request', async () => {
  vi.useFakeTimers();
  const organizer={id:'00000000-0000-4000-8000-000000000001',email:'beta@example.test',displayName:null,status:'ACTIVE',passwordChangeRequired:true,temporaryPasswordExpiresAt:'2027-01-01T00:00:00Z',revision:'1',createdAt:'2026-10-14T00:00:00Z',updatedAt:'2026-10-14T00:00:00Z',emailVerified:false,provisioningSource:'ADMIN_PROVISIONED'};
  const api={create:vi.fn(async()=>({organizer,outcome:'CREATE',temporaryPassword:'transient-test-password'})),list:vi.fn(async()=>({items:[organizer],total:1,limit:20,offset:0}))};
  const session={state:()=> 'ADMIN_ACTIVE',registerPrivateCacheClearer:()=>()=>{},refreshSession:vi.fn()};
  TestBed.configureTestingModule({providers:[{provide:AdminOrganizersApiService,useValue:api},{provide:AdminSessionService,useValue:session},{provide:Router,useValue:{navigateByUrl:vi.fn()}}]});
  const component=TestBed.runInInjectionContext(()=>new AdminOrganizersComponent());
  component.openCreate();component.email.set(organizer.email);component.reason.set('Prueba de privacidad de credenciales');
  await component.save(new Event('submit'));
  expect(component.temporaryPassword()).toBe('transient-test-password');
  await vi.advanceTimersByTimeAsync(60000);
  expect(component.temporaryPassword()).toBe('');
  expect(component.secretEmail()).toBe('');
  expect(component.notice()).toContain('La credencial se ocultó');
  expect(session.refreshSession).not.toHaveBeenCalled();
  component.ngOnDestroy();
});

it('links validation errors to the affected fields for assistive technology (EL-TK-242)', () => {
  const session={state:()=> 'UNAVAILABLE',isRevalidating:()=>false,registerPrivateCacheClearer:()=>()=>{},refreshSession:vi.fn(),logoutUncertainty:()=>null,retryLogout:vi.fn()};
  const api={list:vi.fn(async()=>({items:[],total:0,limit:20,offset:0}))};
  TestBed.configureTestingModule({imports:[],providers:[provideRouter([]),{provide:AdminOrganizersApiService,useValue:api},{provide:AdminSessionService,useValue:session}]});
  const fixture=TestBed.createComponent(AdminOrganizersComponent);
  fixture.componentInstance.mode.set('manage');
  fixture.componentInstance.dialogError.set('La cuenta cambió. Recarga la lista antes de continuar.');
  fixture.detectChanges();
  const element=fixture.nativeElement as HTMLElement;
  const alert=element.querySelector('#organizer-form-error');
  expect(alert?.getAttribute('role')).toBe('alert');
  for(const id of ['organizer-email','organizer-name','organizer-reason']) {
    const field=element.querySelector('#'+id);
    expect(field?.getAttribute('aria-describedby')).toBe('organizer-form-error');
    expect(field?.getAttribute('aria-invalid')).toBe('true');
  }
  fixture.componentInstance.ngOnDestroy();
});
