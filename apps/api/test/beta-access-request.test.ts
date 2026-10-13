import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { AccessRequestError } from '@eventlens/identity';
import {
  BetaAccessRequestController,
  PublicBetaAccessRequestAdapterService
} from '../src/identity/beta-access-request.controller.js';

describe('BetaAccessRequestController & PublicBetaAccessRequestAdapterService (EL-TK-208)', () => {
  it('returns uniform neutral REQUEST_RECEIVED without exposing requestId or prior state', async () => {
    const mockDatabase = {
      transactions: {
        run: vi.fn()
      }
    };
    const adapter = new PublicBetaAccessRequestAdapterService(mockDatabase as any);
    vi.spyOn(adapter.getDomainService(), 'requestAccess').mockResolvedValue({
      outcome: 'REQUEST_RECEIVED',
      message: 'Solicitud de acceso a la BETA recibida para revisión.',
      requestId: 'internal-uuid-should-not-leak'
    });

    const controller = new BetaAccessRequestController(adapter);
    const headers: Record<string, string> = {};
    const result = await controller.submitRequest(
      { email: 'visitante@eventlens.test' },
      { ip: '127.0.0.1' },
      {
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        }
      }
    );

    expect(result).toEqual({
      outcome: 'REQUEST_RECEIVED',
      message: 'Solicitud recibida.'
    });
    expect(JSON.stringify(result)).not.toContain('internal-uuid-should-not-leak');
    expect(headers['cache-control']).toBe('no-store');
  });

  it('maps INVALID_EMAIL to 422, RATE_LIMITED to 429 with Retry-After, and infrastructure failure to 503', async () => {
    const mockDatabase = {
      transactions: {
        run: vi.fn()
      }
    };
    const adapter = new PublicBetaAccessRequestAdapterService(mockDatabase as any);
    const spy = vi.spyOn(adapter.getDomainService(), 'requestAccess');

    spy.mockRejectedValueOnce(new AccessRequestError('INVALID_EMAIL', 'bad email'));
    await expect(
      adapter.submitPublicRequest({ email: 'not-an-email' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    let retryAfterHeader: string | undefined;
    spy.mockRejectedValueOnce(new AccessRequestError('RATE_LIMITED', 'too many'));
    await expect(
      adapter.submitPublicRequest({
        email: 'visitante@eventlens.test',
        setRetryAfterHeader: (sec) => {
          retryAfterHeader = sec;
        }
      })
    ).rejects.toSatisfy((err: unknown) => err instanceof HttpException && err.getStatus() === 429);
    expect(retryAfterHeader).toBe('900');

    spy.mockRejectedValueOnce(new Error('postgres connection reset'));
    await expect(
      adapter.submitPublicRequest({ email: 'visitante@eventlens.test' })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
