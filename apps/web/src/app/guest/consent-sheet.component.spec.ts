import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi } from 'vitest';
import { ConsentSheetComponent } from './consent-sheet.component.js';

describe('Guest explicit consent', () => {
  it('requires all three deliberate choices before emitting consent and respects submitting', async () => {
    await TestBed.configureTestingModule({ imports: [ConsentSheetComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ConsentSheetComponent);
    fixture.detectChanges();
    const emitted = vi.fn();
    fixture.componentInstance.consentAccepted.subscribe(emitted);
    const inputs = [...fixture.nativeElement.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
    const button = fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(inputs.every(input => !input.checked)).toBe(true);
    expect(button.disabled).toBe(true);
    for (const input of inputs.slice(0, 2)) {
      input.checked = true;
      input.dispatchEvent(new Event('change'));
    }
    fixture.detectChanges();
    fixture.componentInstance.onSubmit(new Event('submit'));
    expect(emitted).not.toHaveBeenCalled();
    inputs[2].checked = true;
    inputs[2].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    fixture.componentInstance.onSubmit(new Event('submit'));
    expect(emitted).toHaveBeenCalledExactlyOnceWith('v1.0');
    fixture.componentInstance.submitting = true;
    fixture.componentInstance.onSubmit(new Event('submit'));
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});
