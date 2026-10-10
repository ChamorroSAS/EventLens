import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { PlatformApiService } from './platform-api.service';

describe('Platform shell', () => {
  it('announces real readiness through the public client boundary', async () => {
    const checkReadiness = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: PlatformApiService, useValue: { checkReadiness } }] });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(checkReadiness).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('API disponible.');
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
  });

  it('sanitizes errors and allows a keyboard-accessible retry', async () => {
    const checkReadiness = vi.fn().mockRejectedValueOnce(new Error('private database detail')).mockResolvedValueOnce(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: PlatformApiService, useValue: { checkReadiness } }] });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('API no disponible.');
    expect(fixture.nativeElement.textContent).not.toContain('private database detail');
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('API disponible.');
  });
});
