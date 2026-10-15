import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { UploadOrchestratorService } from './upload-orchestrator.service.js';
import type { UploadLocalFile } from './upload.types.js';

class FakeXHR {
 static instances: FakeXHR[] = [];
 upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
 status = 204;
 onload?: () => void; onerror?: () => void; onabort?: () => void;
 body?: FormData;
 constructor() { FakeXHR.instances.push(this); }
 open = vi.fn();
 send(form: FormData) { this.body = form; }
 abort() { this.onabort?.(); }
}
const grant = { uploads: [{ attemptId: 'attempt-1', uploadUrl: '/storage/private', fields: { key: 'staging/1' }, expiresAt: '2026-10-15T00:00:00Z' }] };
const receipt = { status: 'RECEIVED', state: 'CONFIRMING', attemptId: 'attempt-1', receivedAt: '2026-10-14T00:00:00Z' };
function response(data: unknown, status = 200) { return { ok: status < 300, status, json: async () => data }; }
function file(): UploadLocalFile { return { id: 'local-1', file: new File(['bytes'], 'x.jpg', { type: 'image/jpeg' }), name: 'x.jpg', size: 5, type: 'image/jpeg', status: 'QUEUED', progress: 0, canRetry: false }; }
const flush = async () => { for (let i=0; i<8; i++) await Promise.resolve(); };
describe('real guest transport', () => {
 beforeEach(() => { FakeXHR.instances = []; vi.stubGlobal('XMLHttpRequest', FakeXHR); vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(grant)).mockResolvedValueOnce(response(receipt))); });
 afterEach(() => vi.unstubAllGlobals());
 it('sends actual multipart bytes and only emits measured upload progress, without browser SHA', async () => {
  const service = new UploadOrchestratorService(); const selected = file();
  const onProgress = vi.fn(); const onStatusChange = vi.fn();
  const pending = service.startUpload(selected, { onProgress, onStatusChange }); await flush();
  expect(onProgress).not.toHaveBeenCalled();
  const xhr = FakeXHR.instances[0]!;
  expect(xhr.body?.get('file')).toBe(selected.file);
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 10 });
  expect(onProgress).toHaveBeenCalledWith('local-1',40);
  xhr.onload?.(); await pending;
  expect(onStatusChange.mock.calls.map(call => call[1])).toEqual(['AUTHORIZING','UPLOADING','CONFIRMING','RECEIVED']);
  const init = vi.mocked(fetch).mock.calls[0]![1]!;
  expect(JSON.parse(String(init.body)).files[0]).toMatchObject({ idempotencyKey: expect.stringMatching(/^[a-f0-9-]{36}$/), type: 'image/jpeg' });
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1]![1]!.body))).toEqual({ attemptId: 'attempt-1' });
 });
 it('confirmation uncertainty retries only the same attempt without uploading bytes again', async () => {
  vi.mocked(fetch).mockReset().mockResolvedValueOnce(response(grant) as Response).mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(response(receipt) as Response);
  const service = new UploadOrchestratorService(); const selected=file(); const callbacks = { onProgress: vi.fn(), onStatusChange: vi.fn() };
  const pending=service.startUpload(selected,callbacks); await flush(); FakeXHR.instances[0]!.onload?.(); await pending;
  expect(selected.bytesTransferred).toBe(true);
  expect(callbacks.onStatusChange).toHaveBeenLastCalledWith('local-1','REJECTED',expect.objectContaining({canRetry:true}));
  await service.retryUpload(selected.id,selected,callbacks);
  expect(FakeXHR.instances.length).toBe(1);
  expect(vi.mocked(fetch).mock.calls[2]![0]).toContain('/confirm');
 });
 it('stable idempotency survives authorization network retry', async () => {
  vi.mocked(fetch).mockReset().mockRejectedValue(new TypeError('network'));
  const service = new UploadOrchestratorService(); const selected=file(); const callbacks = { onProgress: vi.fn(), onStatusChange: vi.fn() };
  await service.startUpload(selected,callbacks); await service.startUpload(selected,callbacks);
  expect(vi.mocked(fetch).mock.calls[0]![1]!.body).toEqual(vi.mocked(fetch).mock.calls[1]![1]!.body);
 });
 it('abort scopes to selected IDs and ignores late status/progress', async () => {
  const service = new UploadOrchestratorService(); const selected=file(); const callbacks = { onProgress: vi.fn(), onStatusChange: vi.fn() };
  const pending=service.startUpload(selected,callbacks); await flush(); service.abort([selected.id]); await pending;
  FakeXHR.instances[0]!.upload.onprogress?.({lengthComputable:true,loaded:5,total:5});
  expect(callbacks.onProgress).not.toHaveBeenCalled();
  expect(callbacks.onStatusChange.mock.calls.map(call=>call[1])).not.toContain('RECEIVED');
 });
 it('denied authorization is not retryable and cannot transfer bytes', async () => {
  vi.mocked(fetch).mockReset().mockResolvedValue(response({},403) as Response);
  const callbacks={onProgress:vi.fn(),onStatusChange:vi.fn()}; await new UploadOrchestratorService().startUpload(file(),callbacks);
  expect(FakeXHR.instances.length).toBe(0); expect(callbacks.onStatusChange).toHaveBeenLastCalledWith('local-1','REJECTED',expect.objectContaining({canRetry:false}));
 });
 it.each([
  ['INSUFFICIENT_FILE_CAPACITY', 'límite de archivos'],
  ['UPLOAD_ATTEMPT_EXPIRED', 'expiró']
 ])('explains %s without exposing server messages or proposing unsafe retry', async (code, expected) => {
  vi.mocked(fetch).mockReset().mockResolvedValue(response({ code, message: 'private storage key detail' },422) as Response);
  const callbacks={onProgress:vi.fn(),onStatusChange:vi.fn()};
  await new UploadOrchestratorService().startUpload(file(),callbacks);
  const options = callbacks.onStatusChange.mock.calls.at(-1)![2];
  expect(options.canRetry).toBe(false);
  expect(options.error).toContain(expected);
  expect(options.error).not.toContain('private storage');
  expect(FakeXHR.instances).toHaveLength(0);
 });
 it('rejects untrusted storage origins before sending bytes', async () => {
  vi.mocked(fetch).mockReset().mockResolvedValue(response({uploads:[{...grant.uploads[0],uploadUrl:'https://external.invalid/storage/private'}]}) as Response);
  const callbacks={onProgress:vi.fn(),onStatusChange:vi.fn()}; await new UploadOrchestratorService().startUpload(file(),callbacks);
  expect(FakeXHR.instances.length).toBe(0);
 });
});
