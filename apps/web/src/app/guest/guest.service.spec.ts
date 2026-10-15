import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestService } from './guest.service.js';
import { GuestContainerComponent } from './guest-container.component.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function entry(eventId: string) {
  return {
    data: {
      access: { accessState: 'ALLOWED', eventId, name: eventId, status: 'ACTIVE', timezone: 'America/Bogota', scheduledAt: null, welcomeMessage: null, generation: 1, pinRequired: false, canViewLanding: true, canUpload: true, canViewGallery: true },
      session: { id: `session-${eventId}`, eventId, credentialGeneration: 1, contributorNickname: eventId, hasConsented: true, consentVersion: 'v1.0' },
      contributions: [{ attemptId: `attempt-${eventId}`, mediaType: 'PHOTO', status: 'ACCEPTED', declaredSize: 4, actualSize: 4, detectedType: 'image/jpeg', durationSeconds: null, createdAt: '2026-10-14T00:00:00.000Z' }]
    }, response: new Response(null, { status: 200 })
  };
}

describe('Guest request context isolation', () => {
  let service: GuestService;
  beforeEach(() => { TestBed.configureTestingModule({ imports: [GuestContainerComponent], providers: [GuestService] }); service = TestBed.inject(GuestService); });
  afterEach(() => vi.restoreAllMocks());

  it('aborts older entry and discards its late result after newer metadata, receipt and contributions', async () => {
    const a = deferred<ReturnType<typeof entry>>();
    const b = deferred<ReturnType<typeof entry>>();
    const get = vi.spyOn(service['client'], 'GET');
    get.mockImplementationOnce(() => a.promise as never).mockImplementationOnce(() => b.promise as never);
    const old = service.resolvePublicEntry('A');
    const oldContext = service.getContextVersion();
    const oldSignal = (get.mock.calls[0][1] as { signal?: AbortSignal } | undefined)?.signal;
    const newer = service.resolvePublicEntry('B');
    expect(oldSignal?.aborted).toBe(true);
    expect(service.invalidatePendingRequests(oldContext)).toBeNull();
    b.resolve(entry('B')); expect((await newer).ok).toBe(true);
    a.resolve(entry('A')); expect((await old).ok).toBe(false);
    expect(service.currentAccessView()?.name).toBe('B');
    expect(service.getSession()?.id).toBe('session-B');
    expect(service.getContributions()[0].attemptId).toBe('attempt-B');
  });

  it.each(['nickname', 'consent', 'PIN', 'contributions'])('ignores obsolete %s 401 without clearing newer session', async action => {
    vi.spyOn(service['client'], 'GET').mockResolvedValue(entry('A') as never);
    await service.resolvePublicEntry('A');
    const pending = deferred<{ response: Response; error: { code: string } }>();
    vi.spyOn(service['client'], 'POST').mockImplementation(() => pending.promise as never);
    if (action === 'contributions') vi.spyOn(service['client'], 'GET').mockImplementationOnce(() => pending.promise as never);
    const old = action === 'nickname' ? service.saveContributorNickname('old') : action === 'consent' ? service.confirmConsent('v1.0') : action === 'PIN' ? service.submitPin('A', '123456') : service.refreshOwnContributions();
    vi.spyOn(service['client'], 'GET').mockResolvedValue(entry('B') as never);
    await service.resolvePublicEntry('B');
    pending.resolve({ response: new Response(null, { status: 401 }), error: { code: 'GUEST_SESSION_INVALID' } });
    const result = await old;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('OBSOLETE_GUEST_CONTEXT');
    expect(service.getSession()?.eventId).toBe('B');
    expect(service.getContributions()[0].attemptId).toBe('attempt-B');
  });

  it.each(['nickname', 'consent', 'PIN'])('ignores obsolete successful %s receipt', async action => {
    vi.spyOn(service['client'], 'GET').mockResolvedValue(entry('A') as never);
    await service.resolvePublicEntry('A');
    const pending = deferred<ReturnType<typeof entry>>();
    vi.spyOn(service['client'], 'POST').mockImplementation(() => pending.promise as never);
    const old = action === 'nickname' ? service.saveContributorNickname('old') : action === 'consent' ? service.confirmConsent('v1.0') : service.submitPin('A', '123456');
    vi.spyOn(service['client'], 'GET').mockResolvedValue(entry('B') as never);
    await service.resolvePublicEntry('B');
    pending.resolve(entry('A')); await old;
    expect(service.getSession()?.id).toBe('session-B');
    expect(service.getContributions()[0].attemptId).toBe('attempt-B');
  });

  it('keeps ownership after entry without session, PIN, and pending nickname on destruction', async () => {
    const a = entry('A');
    vi.spyOn(service['client'], 'GET').mockResolvedValue({ ...a, data: { ...a.data, session: null, contributions: [] } } as never);
    const pending = deferred<ReturnType<typeof entry>>();
    const post = vi.spyOn(service['client'], 'POST').mockResolvedValueOnce(a as never).mockImplementationOnce(() => pending.promise as never);
    const fixture = TestBed.createComponent(GuestContainerComponent);
    const component = fixture.componentInstance;
    component.lookupKey = 'A';
    await component.loadGuestEntry('A');
    const entryContext = service.getContextVersion();
    expect(service.getSession()).toBeNull();
    await component.onPinSubmitted('123456');
    expect(service.getContextVersion()).toBe(entryContext);
    component.editNickname();
    const old = component.onNicknameSaved('Late name');
    const signal = (post.mock.calls[1][1] as { signal?: AbortSignal }).signal;
    fixture.destroy();
    expect(signal?.aborted).toBe(true);
    pending.resolve({ ...a, data: { ...a.data, session: { ...a.data.session, contributorNickname: 'Late name' } } });
    await old;
    expect(service.getSession()?.contributorNickname).toBe('A');
    expect(component.currentStep()).not.toBe('SELECT_FILES');
  });

  it('destroying old component cannot cancel newer component entry or clear its receipt', async () => {
    const a = deferred<ReturnType<typeof entry>>(); const b = deferred<ReturnType<typeof entry>>();
    const get = vi.spyOn(service['client'], 'GET').mockImplementationOnce(() => a.promise as never).mockImplementationOnce(() => b.promise as never);
    const fixtureA = TestBed.createComponent(GuestContainerComponent); fixtureA.componentInstance.lookupKey = 'A';
    const old = fixtureA.componentInstance.loadGuestEntry('A');
    const fixtureB = TestBed.createComponent(GuestContainerComponent); fixtureB.componentInstance.lookupKey = 'B';
    const newer = fixtureB.componentInstance.loadGuestEntry('B');
    const newSignal = (get.mock.calls[1][1] as { signal?: AbortSignal }).signal;
    fixtureA.destroy(); expect(newSignal?.aborted).toBe(false);
    b.resolve(entry('B')); await newer;
    a.resolve(entry('A')); await old;
    expect(service.getSession()?.id).toBe('session-B');
    expect(service.currentAccessView()?.name).toBe('B');
    expect(fixtureB.componentInstance.accessView?.name).toBe('B');
  });
});
