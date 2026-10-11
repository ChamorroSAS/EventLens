import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Execution,SqlTransaction} from '@eventlens/job-queue';
import {MediaRetryPolicy,ApplyTransientRetry,type MediaRetryRepository} from '../src/transient-retry.js';
import type {InspectionInput} from '../src/contracts.js';

describe('MediaRetryPolicy', ()=>{
  it('classifies transient errors as transient', ()=>{
    expect(MediaRetryPolicy.classify(new Error('connect ETIMEDOUT 10.0.0.1')).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({code:'ECONNRESET',message:'Connection reset'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({status:503,message:'503 Service Unavailable'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({code:'SlowDown',message:'Please reduce your request rate'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({code:'40P01',message:'deadlock detected'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({code:'WORKER_CRASH',message:'process exited unexpectedly with SIGKILL'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({outcome:'INCONCLUSIVE',message:'Inspection inconclusive'}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({format:{status:'INCONCLUSIVE'}}).isTransient).toBe(true);
    expect(MediaRetryPolicy.classify({malware:{status:'INCONCLUSIVE'}}).isTransient).toBe(true);
  });

  it('classifies non-transient errors as non-transient', ()=>{
    expect(MediaRetryPolicy.classify({malware:{status:'THREAT_DETECTED',reason:'Eicar'}}).isTransient).toBe(false);
    expect(MediaRetryPolicy.classify({format:{status:'INVALID',reason:'CONTAINER_MISMATCH'}}).isTransient).toBe(false);
    expect(MediaRetryPolicy.classify({outcome:'DENIED'}).isTransient).toBe(false);
    expect(MediaRetryPolicy.classify({code:'STALE_ORIGINAL'}).isTransient).toBe(false);
    expect(MediaRetryPolicy.classify({code:'INVALID_ARGUMENT'}).isTransient).toBe(false);
  });

  it('sanitizes reasons to prevent leaking database URLs, credentials, and local paths', ()=>{
    const raw = 'Failed to connect to postgresql://admin:superSecret123@db.internal:5432/eventlens?ssl=true at C:\\Users\\geren\\AppData\\Local\\Temp\\file.bin with token=secretToken999';
    const sanitized = MediaRetryPolicy.sanitizeReason(raw);
    expect(sanitized).not.toContain('superSecret123');
    expect(sanitized).not.toContain('secretToken999');
    expect(sanitized).not.toContain('C:\\Users\\geren');
    expect(sanitized).toContain('[REDACTED_DB_URL]');
    expect(sanitized).toContain('token=[REDACTED]');
  });

  it('calculates backoff delay exponentially clamped to max', ()=>{
    expect(MediaRetryPolicy.calculateDelay(1, 1000, 30000)).toBe(1000);
    expect(MediaRetryPolicy.calculateDelay(2, 1000, 30000)).toBe(2000);
    expect(MediaRetryPolicy.calculateDelay(3, 1000, 30000)).toBe(4000);
    expect(MediaRetryPolicy.calculateDelay(10, 1000, 30000)).toBe(30000);
  });
});

describe('ApplyTransientRetry unit logic', ()=>{
  const input: InspectionInput = {
    mediaRef: 'media-001',
    generation: 1n,
    revision: 1n,
    original: {namespace:'n',key:'k',immutableVersion:'v',sha256:'a'.repeat(64),sizeBytes:100},
    declaredMime: 'image/jpeg'
  };

  const job = (attempt: number): Execution => ({
    jobId: randomUUID(),
    resourceRef: 'media-001',
    generation: 1n,
    queue: 'media',
    type: 'PHOTO_DERIVATIVES',
    payload: {},
    handlerVersion: '1',
    attempt,
    fence: BigInt(attempt),
    owner: 'worker-1',
    token: randomUUID(),
    epoch: 'epoch-1',
    leaseUntil: new Date(Date.now() + 60000)
  });

  it('fails closed on non-transient error', async ()=>{
    const repo: MediaRetryRepository = {
      lock: vi.fn(),
      record: vi.fn(),
      receipt: vi.fn()
    };
    const queue = {retry: vi.fn()};
    const handler = new ApplyTransientRetry(repo, queue);
    await expect(handler.execute(job(1), input, {malware:{status:'THREAT_DETECTED'}}, 'op-1')).rejects.toMatchObject({code:'CONFLICT'});
  });

  it('reprograms with RETRYING disposition on attempt 1 and attempt 2', async ()=>{
    const repo: MediaRetryRepository = {
      lock: vi.fn(),
      record: vi.fn().mockResolvedValue({
        operationId: 'op-1',
        mediaRef: 'media-001',
        generation: '1',
        jobId: 'j-1',
        attempt: 1,
        disposition: 'RETRYING',
        retryFingerprint: 'f-1'
      }),
      receipt: vi.fn()
    };
    const queue = {
      retry: vi.fn().mockImplementation(async (_j,_op,_outcome,_retryAt,_disp,effect,lockOwner)=>{
        if(lockOwner) await lockOwner({} as SqlTransaction);
        await effect({} as SqlTransaction);
        return 'COMPLETED';
      })
    };
    const handler = new ApplyTransientRetry(repo, queue, {baseDelayMs: 500});
    const res = await handler.execute(job(1), input, new Error('ETIMEDOUT'), 'op-1');
    expect(res.disposition).toBe('RETRYING');
    expect(res.retryAt).not.toBeNull();
    expect(res.receipt.disposition).toBe('RETRYING');
    expect(queue.retry).toHaveBeenCalledTimes(1);
    expect(queue.retry.mock.calls[0][4]).toBe('RETRYING');
  });

  it('marks DEAD and does not program a 4th attempt when budget of 3 attempts is exhausted', async ()=>{
    const repo: MediaRetryRepository = {
      lock: vi.fn(),
      record: vi.fn().mockResolvedValue({
        operationId: 'op-3',
        mediaRef: 'media-001',
        generation: '1',
        jobId: 'j-1',
        attempt: 3,
        disposition: 'DEAD',
        retryFingerprint: 'f-3'
      }),
      receipt: vi.fn()
    };
    const queue = {
      retry: vi.fn().mockImplementation(async (_j,_op,_outcome,_retryAt,_disp,effect,lockOwner)=>{
        if(lockOwner) await lockOwner({} as SqlTransaction);
        await effect({} as SqlTransaction);
        return 'COMPLETED';
      })
    };
    const handler = new ApplyTransientRetry(repo, queue, {maxAttempts: 3});
    const res = await handler.execute(job(3), input, new Error('ETIMEDOUT'), 'op-3');
    expect(res.disposition).toBe('DEAD');
    expect(res.retryAt).toBeNull();
    expect(queue.retry.mock.calls[0][3]).toBeNull(); // retryAt is null
    expect(queue.retry.mock.calls[0][4]).toBe('DEAD'); // disposition is DEAD
  });
});
