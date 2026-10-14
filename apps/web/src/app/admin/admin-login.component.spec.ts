import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AdminLoginComponent } from './admin-login.component.js';
import { AdminSessionService } from './admin-session.service.js';

describe('AdminLoginComponent (EL-TK-235)', () => {
  it('clears the credential after an unavailable login attempt without exposing it in the message', async () => {
    const session = {
      refreshSession: vi.fn(async () => ({ state: 'ANONYMOUS' })),
      login: vi.fn(async () => ({
        ok: false as const,
        message: 'El acceso administrativo no está disponible. Reintenta más tarde.'
      }))
    };
    await TestBed.configureTestingModule({
      imports: [AdminLoginComponent],
      providers: [{ provide: AdminSessionService, useValue: session }]
    }).compileComponents();

    const fixture: ComponentFixture<AdminLoginComponent> = TestBed.createComponent(AdminLoginComponent);
    fixture.componentInstance.identifier.set('operator');
    fixture.componentInstance.secret.set('secret-that-must-not-remain');
    await fixture.componentInstance.onSubmit(new Event('submit'));

    expect(session.login).toHaveBeenCalledWith(
      { identifier: 'operator', secret: 'secret-that-must-not-remain' },
      undefined
    );
    expect(fixture.componentInstance.secret()).toBe('');
    expect(fixture.componentInstance.errorMessage()).toBe(
      'El acceso administrativo no está disponible. Reintenta más tarde.'
    );
  });
});
