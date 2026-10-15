import { describe, it, expect } from 'vitest';
import { UploadService } from './upload.service.js';

describe('UploadService', () => {
  it('matches photo 25 MiB and video 500 MiB limits including HEIF and rejects unsupported MIME', () => {
    const service = new UploadService();
    expect(service.validateLocalFile({ name: 'x.heif', type: '', size: 25 * 1024 * 1024 }).valid).toBe(true);
    expect(service.resolveContentType({ name: 'x.HEIF', type: '' })).toBe('image/heif');
    expect(service.validateLocalFile({ name: 'x.jpg', type: 'image/jpeg', size: 25 * 1024 * 1024 + 1 }).valid).toBe(false);
    expect(service.validateLocalFile({ name: 'x.mp4', type: 'video/mp4', size: 500 * 1024 * 1024 }).valid).toBe(true);
    expect(service.validateLocalFile({ name: 'x.jpg', type: 'application/pdf', size: 100 }).valid).toBe(false);
  });
  it('calculates SHA-256 hash of a file', async () => {
    const svc = new UploadService();
    const content = new TextEncoder().encode('hello world');
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const hash = await svc.calculateSha256(file);
    // sha256('hello world') = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});
