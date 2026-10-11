import { describe, expect, it } from 'vitest';
import { AuditSanitizer, AuditError } from '../src/index.js';

describe('AuditSanitizer (Unit Tests)', () => {
  const sanitizer = new AuditSanitizer();

  it('redacts sensitive keys such as passwords, tokens, pins and cookies', () => {
    const input = {
      username: 'alice',
      password: 'super-secret-password',
      accessToken: 'xyz-secret-token',
      sessionCookie: 'sid=12345',
      userPin: '1234',
      apiKey: 'api-key-999',
      creditCard: '4111222233334444',
      cvv: '123'
    };

    const sanitized = sanitizer.sanitizeMetadata(input);

    expect(sanitized.username).toBe('alice');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.sessionCookie).toBe('[REDACTED]');
    expect(sanitized.userPin).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.creditCard).toBe('[REDACTED]');
    expect(sanitized.cvv).toBe('[REDACTED]');
  });

  it('omits multimedia byte streams and buffer fields without storing binary content', () => {
    const input = {
      fileName: 'photo1.jpg',
      rawBytes: Buffer.from('image content binary stream'),
      photoBytes: 'pretend-bytes',
      videoBytes: 'pretend-video',
      mediaBytes: 'pretend-media',
      dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
      fileData: 'pretend-file-data'
    };

    const sanitized = sanitizer.sanitizeMetadata(input);

    expect(sanitized.fileName).toBe('photo1.jpg');
    expect(sanitized.rawBytes).toBe('[BINARY_OMITTED]');
    expect(sanitized.photoBytes).toBe('[MULTIMEDIA_OMITTED]');
    expect(sanitized.videoBytes).toBe('[MULTIMEDIA_OMITTED]');
    expect(sanitized.mediaBytes).toBe('[MULTIMEDIA_OMITTED]');
    expect(sanitized.dataUri).toBe('[MULTIMEDIA_OMITTED]');
    expect(sanitized.fileData).toBe('[MULTIMEDIA_OMITTED]');
  });

  it('prevents prototype pollution keys from being retained', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"name":"attacker"},"safeKey":"safe"}');

    const sanitized = sanitizer.sanitizeMetadata(input);

    expect(sanitized.safeKey).toBe('safe');
    expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, 'constructor')).toBe(false);
  });

  it('bounds nested object depth to maxDepth (3 levels)', () => {
    const input = {
      lvl1: {
        lvl2: {
          lvl3: {
            lvl4: {
              tooDeep: 'value'
            }
          }
        }
      }
    };

    const sanitized = sanitizer.sanitizeMetadata(input) as any;

    expect(sanitized.lvl1.lvl2.lvl3).toBe('[DEPTH_EXCEEDED]');
  });

  it('truncates excessively long string values', () => {
    const veryLongString = 'a'.repeat(600);
    const input = {
      detail: veryLongString
    };

    const sanitized = sanitizer.sanitizeMetadata(input);

    expect(typeof sanitized.detail).toBe('string');
    expect((sanitized.detail as string).endsWith('...[TRUNCATED]')).toBe(true);
    expect((sanitized.detail as string).length).toBe(512 + '...[TRUNCATED]'.length);
  });

  it('masks inline database connection strings and bearer tokens', () => {
    const input = {
      dbRef: 'postgresql://eventlens:secretpassword123@postgres.internal:5432/eventlens',
      clientHeader: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M'
    };

    const sanitized = sanitizer.sanitizeMetadata(input);

    expect(sanitized.dbRef).toBe('postgresql://[REDACTED]@postgres.internal:5432/eventlens');
    expect(sanitized.clientHeader).toBe('[REDACTED_BEARER]');
  });

  it('throws METADATA_TOO_LARGE when serialized payload exceeds maximum size', () => {
    const hugeObject: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) {
      hugeObject[`field_${i}`] = 'x'.repeat(400);
    }

    expect(() => sanitizer.sanitizeMetadata(hugeObject)).toThrow(AuditError);
    expect(() => sanitizer.sanitizeMetadata(hugeObject)).toThrowError(/exceeds maximum allowed size/);
  });

  it('sanitizes Error objects into messages without leaking stack traces or connection passwords', () => {
    const error = new Error('Connection failed to postgresql://user:mysecretpwd@host:5432/db');
    error.stack = 'Error: Connection failed\n    at internal/db.js:42:15\n    at /secret/path/app.js:10';

    const sanitizedReason = sanitizer.sanitizeReason(error);

    expect(sanitizedReason).toBe('Connection failed to postgresql://[REDACTED]@host:5432/db');
    expect(sanitizedReason).not.toContain('stack');
    expect(sanitizedReason).not.toContain('internal/db.js');
    expect(sanitizedReason).not.toContain('mysecretpwd');
  });

  it('sanitizes custom Error classes preserving name prefix without stack trace', () => {
    class DatabaseConnectionError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'DatabaseConnectionError';
      }
    }

    const error = new DatabaseConnectionError('Database timeout');
    const sanitizedReason = sanitizer.sanitizeReason(error);

    expect(sanitizedReason).toBe('[DatabaseConnectionError] Database timeout');
  });

  it('returns null for empty or null reason', () => {
    expect(sanitizer.sanitizeReason(null)).toBeNull();
    expect(sanitizer.sanitizeReason(undefined)).toBeNull();
    expect(sanitizer.sanitizeReason('')).toBeNull();
  });
});
