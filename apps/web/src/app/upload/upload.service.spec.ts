import { describe, it, expect } from 'vitest';
import { UploadService } from './upload.service.js';

describe('UploadService', () => {
  it('calculates SHA-256 hash of a file', async () => {
    const svc = new UploadService();
    const content = new TextEncoder().encode('hello world');
    const file = new File([content], 'test.txt', { type: 'text/plain' });
    const hash = await svc.calculateSha256(file);
    // sha256('hello world') = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});