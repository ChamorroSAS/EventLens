import { expect, it, vi, beforeEach, describe, afterEach } from 'vitest';
import { UploadOrchestratorService } from './upload-orchestrator.service.js';
import { UploadService } from './upload.service.js';
import type { UploadLocalFile } from './upload.types.js';

interface MockClient {
  POST: ReturnType<typeof vi.fn>;
}

describe('UploadOrchestratorService', () => {
  let mockUploadService: { calculateSha256: ReturnType<typeof vi.fn>; validateLocalFile: ReturnType<typeof vi.fn> };
  let mockClient: MockClient;
  let mockFetch: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    mockUploadService = {
      calculateSha256: vi.fn().mockResolvedValue('abc123def456'),
      validateLocalFile: vi.fn().mockReturnValue({ valid: true })
    };

    mockClient = {
      POST: vi.fn().mockResolvedValue({
        data: {
          uploads: [{
            mediaRef: 'mr-abc123',
            uploadUrl: 'https://minio/upload',
            fields: { 'content-type': 'image/jpeg', key: 'events/evt-123/media/mr-abc123/photo.jpg' },
            expiresAt: new Date(Date.now() + 900000).toISOString()
          }]
        },
        response: { ok: true }
      })
    };

    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createOrchestrator() {
    return new UploadOrchestratorService(mockUploadService as any, mockClient as any);
  }

  function createLocalFile(status: UploadLocalFile['status'] = 'QUEUED'): UploadLocalFile {
    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    return {
      id: 'f1',
      file,
      name: 'photo.jpg',
      size: 4,
      type: 'image/jpeg',
      status,
      progress: 0,
      canRetry: false
    };
  }

  function createCallbacks(file: UploadLocalFile) {
    return {
      onProgress: vi.fn((id: string, progress: number) => {
        if (id === file.id) file.progress = progress;
      }),
      onStatusChange: vi.fn((id: string, status: UploadLocalFile['status'], options?: { error?: string; canRetry?: boolean; attemptId?: string }) => {
        if (id === file.id) {
          file.status = status;
          if (options?.error) file.error = options.error;
          if (options?.canRetry !== undefined) file.canRetry = options.canRetry;
          if (options?.attemptId) file.attemptId = options.attemptId;
          if (status === 'RECEIVED') file.progress = 100;
        }
      })
    };
  }

  it('hashes file, requests presign, uploads to MinIO, confirms, updates status', async () => {
    const orchestrator = createOrchestrator();
    const localFile = createLocalFile();
    const callbacks = createCallbacks(localFile);

    await orchestrator.startUpload(localFile, callbacks);

    expect(mockUploadService.calculateSha256).toHaveBeenCalledWith(localFile.file);
    expect(mockClient.POST).toHaveBeenCalledWith(
      '/api/v1/public/guest-session/uploads/presign',
      expect.objectContaining({
        body: expect.objectContaining({
          files: expect.arrayContaining([
            expect.objectContaining({
              name: 'photo.jpg',
              size: 4,
              type: 'image/jpeg',
              sha256: 'abc123def456'
            })
          ])
        })
      })
    );
    expect(mockFetch).toHaveBeenCalledWith('https://minio/upload', expect.objectContaining({ method: 'POST' }));

    // Check status transitions
    const statusCalls = callbacks.onStatusChange.mock.calls.map((c) => c[1]);
    expect(statusCalls).toEqual(['HASHING', 'AUTHORIZING', 'UPLOADING', 'CONFIRMING', 'RECEIVED']);

    // Check RECEIVED has attemptId
    const receivedCall = callbacks.onStatusChange.mock.calls.find((c) => c[1] === 'RECEIVED');
    expect(receivedCall?.[2]).toEqual(expect.objectContaining({ attemptId: expect.any(String) }));

    expect(localFile.status).toBe('RECEIVED');
  });

  it('sets REJECTED status on presign failure', async () => {
    mockClient.POST.mockResolvedValueOnce({ data: null, response: { ok: false, status: 500 } });

    const orchestrator = createOrchestrator();
    const localFile = createLocalFile();
    const callbacks = createCallbacks(localFile);

    await orchestrator.startUpload(localFile, callbacks);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith('f1', 'REJECTED', expect.objectContaining({
      error: expect.any(String),
      canRetry: true
    }));
    expect(localFile.status).toBe('REJECTED');
  });

  it('sets REJECTED status on MinIO upload failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Internal Error') });

    const orchestrator = createOrchestrator();
    const localFile = createLocalFile();
    const callbacks = createCallbacks(localFile);

    await orchestrator.startUpload(localFile, callbacks);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith('f1', 'REJECTED', expect.objectContaining({
      error: expect.stringContaining('MinIO upload failed'),
      canRetry: true
    }));
    expect(localFile.status).toBe('REJECTED');
  });

  it('sets REJECTED status on confirm failure', async () => {
    mockClient.POST
      .mockResolvedValueOnce({
        data: { uploads: [{ mediaRef: 'mr-abc123', uploadUrl: 'https://minio/upload', fields: { key: 'events/evt-123/media/mr-abc123/photo.jpg' }, expiresAt: new Date(Date.now() + 900000).toISOString() }] },
        response: { ok: true }
      })
      .mockResolvedValueOnce({ data: null, response: { ok: false, status: 400 } });

    const orchestrator = createOrchestrator();
    const localFile = createLocalFile();
    const callbacks = createCallbacks(localFile);

    await orchestrator.startUpload(localFile, callbacks);

    expect(callbacks.onStatusChange).toHaveBeenCalledWith('f1', 'REJECTED', expect.objectContaining({
      error: expect.any(String),
      canRetry: true
    }));
    expect(localFile.status).toBe('REJECTED');
  });

  it('does not mark as rejected on abort', async () => {
    const controller = new AbortController();
    mockClient.POST.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    const orchestrator = createOrchestrator();
    const localFile = createLocalFile();
    const callbacks = createCallbacks(localFile);

    await orchestrator.startUpload(localFile, callbacks);

    // Should only have HASHING and AUTHORIZING before abort
    const statusCalls = callbacks.onStatusChange.mock.calls.map((c) => c[1]);
    expect(statusCalls).not.toContain('REJECTED');
  });

  it('retryUpload calls startUpload again', async () => {
    const orchestrator = createOrchestrator();
    const localFile = createLocalFile('REJECTED');
    localFile.canRetry = true;
    const callbacks = createCallbacks(localFile);

    await orchestrator.retryUpload('f1', localFile, callbacks);

    expect(mockUploadService.calculateSha256).toHaveBeenCalledWith(localFile.file);
    expect(callbacks.onStatusChange).toHaveBeenCalledWith('f1', 'HASHING');
  });
});