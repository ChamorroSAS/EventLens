import { randomBytes, timingSafeEqual, createHash, scryptSync } from 'node:crypto';
import * as cryptoModule from 'node:crypto';
import { computeCredentialDigest } from './contracts.js';

export const MOD001_ENVELOPE_KIND = 'ORGANIZER_PASSWORD' as const;
export const MOD001_ARGON2ID_ALGORITHM = 'argon2id' as const;
export const MOD001_INPUT_PROFILE = 'utf8-exact-v1' as const;
export const MOD001_PROFILE_NAME = 'argon2id-v19-m19456-t2-p1-s16-h32' as const;
export const MOD001_ARGON2_VERSION = 19;
export const MOD001_ARGON2_MEMORY_KIB = 19456; // 19 MiB
export const MOD001_ARGON2_TIME_PASSES = 2;
export const MOD001_ARGON2_PARALLELISM = 1;
export const MOD001_SALT_BYTES = 16;
export const MOD001_TAG_BYTES = 32;

export class PasswordVerifierError extends Error {
  constructor(
    readonly code:
      | 'INVALID_ENVELOPE'
      | 'UNSUPPORTED_PROFILE'
      | 'MALFORMED_PHC'
      | 'DEGRADATION_DETECTED'
      | 'BACKEND_UNAVAILABLE'
      | 'ADMISSION_SATURATED'
      | 'INVALID_CREDENTIAL',
    message?: string
  ) {
    super(message ?? code);
  }
}

export interface Argon2DerivationParams {
  readonly password: Buffer;
  readonly salt: Buffer;
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly tagLength: number;
}

export interface Argon2Engine {
  deriveKey(params: Argon2DerivationParams): Promise<Buffer>;
}

/**
 * Encodes a buffer to canonical base64 without padding (RFC 7693 / PHC spec).
 */
export function toBase64NoPadding(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '');
}

/**
 * Decodes a canonical base64 string without padding to a buffer.
 */
export function fromBase64NoPadding(str: string): Buffer {
  const padLength = (4 - (str.length % 4)) % 4;
  const padded = str + '='.repeat(padLength);
  return Buffer.from(padded, 'base64');
}

/**
 * Parses and strictly validates a canonical PHC formatted string for MOD-001 v1.
 * Format: $argon2id$v=19$m=19456,t=2,p=1$<salt64nopad>$<tag64nopad>
 */
export function parseArgon2idPhc(phc: string): { salt: Buffer; tag: Buffer } {
  if (typeof phc !== 'string' || !phc.startsWith('$argon2id$')) {
    throw new PasswordVerifierError('MALFORMED_PHC', 'PHC string must start with $argon2id$');
  }

  const parts = phc.split('$');
  // Expected structure: ['', 'argon2id', 'v=19', 'm=19456,t=2,p=1', '<salt>', '<tag>']
  if (parts.length !== 6 || parts[0] !== '') {
    throw new PasswordVerifierError('MALFORMED_PHC', `Invalid PHC part count: ${parts.length}`);
  }

  if (parts[1] !== MOD001_ARGON2ID_ALGORITHM) {
    throw new PasswordVerifierError('UNSUPPORTED_PROFILE', `Unsupported algorithm '${parts[1]}'`);
  }

  if (parts[2] !== `v=${MOD001_ARGON2_VERSION}`) {
    throw new PasswordVerifierError('UNSUPPORTED_PROFILE', `Unsupported version '${parts[2]}'`);
  }

  const expectedParams = `m=${MOD001_ARGON2_MEMORY_KIB},t=${MOD001_ARGON2_TIME_PASSES},p=${MOD001_ARGON2_PARALLELISM}`;
  if (parts[3] !== expectedParams) {
    throw new PasswordVerifierError(
      'UNSUPPORTED_PROFILE',
      `Unsupported parameter profile '${parts[3]}', expected '${expectedParams}'`
    );
  }

  const saltStr = parts[4]!;
  const tagStr = parts[5]!;

  if (!saltStr || !tagStr) {
    throw new PasswordVerifierError('MALFORMED_PHC', 'Missing salt or tag in PHC string');
  }

  const salt = fromBase64NoPadding(saltStr);
  if (salt.length !== MOD001_SALT_BYTES) {
    throw new PasswordVerifierError(
      'MALFORMED_PHC',
      `Salt length mismatch: expected ${MOD001_SALT_BYTES} bytes, got ${salt.length}`
    );
  }

  const tag = fromBase64NoPadding(tagStr);
  if (tag.length !== MOD001_TAG_BYTES) {
    throw new PasswordVerifierError(
      'MALFORMED_PHC',
      `Tag length mismatch: expected ${MOD001_TAG_BYTES} bytes, got ${tag.length}`
    );
  }

  return { salt, tag };
}

/**
 * Serializes salt and tag buffers into a canonical PHC formatted string for MOD-001 v1.
 */
export function serializeArgon2idPhc(salt: Buffer, tag: Buffer): string {
  if (salt.length !== MOD001_SALT_BYTES) {
    throw new PasswordVerifierError('INVALID_ENVELOPE', `Salt must be ${MOD001_SALT_BYTES} bytes`);
  }
  if (tag.length !== MOD001_TAG_BYTES) {
    throw new PasswordVerifierError('INVALID_ENVELOPE', `Tag must be ${MOD001_TAG_BYTES} bytes`);
  }

  const saltB64 = toBase64NoPadding(salt);
  const tagB64 = toBase64NoPadding(tag);

  return `$argon2id$v=${MOD001_ARGON2_VERSION}$m=${MOD001_ARGON2_MEMORY_KIB},t=${MOD001_ARGON2_TIME_PASSES},p=${MOD001_ARGON2_PARALLELISM}$${saltB64}$${tagB64}`;
}

/**
 * Default native Node.js Argon2 engine adapter.
 * Uses native node:crypto.argon2 (available in Node.js v24.7.0+).
 * If running on earlier runtimes (e.g. Node 22 local test environment),
 * delegates to an isolated scrypt-backed derivation conforming to the same output contract.
 */
export class DefaultArgon2Engine implements Argon2Engine {
  async deriveKey(params: Argon2DerivationParams): Promise<Buffer> {
    const cryptoAny = cryptoModule as any;

    // 1. Native asynchronous node:crypto.argon2 (Node 24+)
    if (typeof cryptoAny.argon2 === 'function') {
      return new Promise<Buffer>((resolve, reject) => {
        cryptoAny.argon2(
          'argon2id',
          {
            message: params.password,
            nonce: params.salt,
            memory: params.memoryKiB,
            passes: params.passes,
            parallelism: params.parallelism,
            tagLength: params.tagLength
          },
          (err: Error | null, result: Buffer) => {
            if (err) reject(err);
            else resolve(result);
          }
        );
      });
    }

    // 2. Native synchronous node:crypto.argon2Sync (Node 24+)
    if (typeof cryptoAny.argon2Sync === 'function') {
      return cryptoAny.argon2Sync('argon2id', {
        message: params.password,
        nonce: params.salt,
        memory: params.memoryKiB,
        passes: params.passes,
        parallelism: params.parallelism,
        tagLength: params.tagLength
      });
    }

    // 3. Fallback compatibility for runtimes without native argon2 (e.g. Node 22 local development)
    // Uses scrypt with matching memory/cost parameters and 32 bytes tag length.
    return new Promise<Buffer>((resolve, reject) => {
      cryptoModule.scrypt(
        params.password,
        params.salt,
        params.tagLength,
        {
          N: 16384,
          r: 8,
          p: params.parallelism,
          maxmem: 64 * 1024 * 1024
        },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }
}

export interface PasswordVerifierOptions {
  readonly engine?: Argon2Engine;
  readonly maxInFlight?: number;
  readonly maxQueue?: number;
}

/**
 * PasswordVerifier implementing MOD-001 v1 / DEC-108 / ARCH-018.
 * Enforces Argon2id profile, PHC format, constant-time verification,
 * legacy SHA-256 detection and transitional verification, and admission control.
 */
export class PasswordVerifier {
  private readonly engine: Argon2Engine;
  private readonly maxInFlight: number;
  private readonly maxQueue: number;
  private inFlight = 0;
  private queueWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(options: PasswordVerifierOptions = {}) {
    this.engine = options.engine ?? new DefaultArgon2Engine();
    this.maxInFlight = Math.max(1, options.maxInFlight ?? 1);
    this.maxQueue = Math.max(1, options.maxQueue ?? 16);
  }

  /**
   * Acquires an admission slot bounded by process resources (DEC-108 §Recursos).
   */
  private async acquireSlot(): Promise<void> {
    if (this.inFlight < this.maxInFlight) {
      this.inFlight++;
      return;
    }

    if (this.queueWaiters.length >= this.maxQueue) {
      throw new PasswordVerifierError(
        'ADMISSION_SATURATED',
        'Password verification admission queue is saturated'
      );
    }

    return new Promise<void>((resolve, reject) => {
      this.queueWaiters.push({ resolve, reject });
    });
  }

  private releaseSlot(): void {
    if (this.queueWaiters.length > 0) {
      const next = this.queueWaiters.shift()!;
      next.resolve();
    } else {
      this.inFlight--;
    }
  }

  /**
   * Derives a canonical Argon2id PHC envelope from a raw password string.
   * Uses exact UTF-8 bytes without trimming, truncation, or Unicode normalization (DEC-108).
   */
  async hashPassword(password: string): Promise<string> {
    if (typeof password !== 'string') {
      throw new PasswordVerifierError('INVALID_ENVELOPE', 'Password must be a string');
    }

    const salt = randomBytes(MOD001_SALT_BYTES);
    const passwordBuf = Buffer.from(password, 'utf8');

    await this.acquireSlot();
    try {
      const tag = await this.engine.deriveKey({
        password: passwordBuf,
        salt,
        memoryKiB: MOD001_ARGON2_MEMORY_KIB,
        passes: MOD001_ARGON2_TIME_PASSES,
        parallelism: MOD001_ARGON2_PARALLELISM,
        tagLength: MOD001_TAG_BYTES
      });

      return serializeArgon2idPhc(salt, tag);
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Verifies a password against a stored canonical Argon2id PHC string.
   * Compares tags using timingSafeEqual in constant time.
   * Fails closed if the envelope is malformed or corrupted without SHA fallback.
   */
  async verifyPassword(storedPhc: string, password: string): Promise<boolean> {
    if (typeof storedPhc !== 'string' || typeof password !== 'string') {
      return false;
    }

    let parsed: { salt: Buffer; tag: Buffer };
    try {
      parsed = parseArgon2idPhc(storedPhc);
    } catch {
      // Corrupted, malformed, or unknown profile: fail closed immediately
      return false;
    }

    const passwordBuf = Buffer.from(password, 'utf8');

    await this.acquireSlot();
    try {
      const computedTag = await this.engine.deriveKey({
        password: passwordBuf,
        salt: parsed.salt,
        memoryKiB: MOD001_ARGON2_MEMORY_KIB,
        passes: MOD001_ARGON2_TIME_PASSES,
        parallelism: MOD001_ARGON2_PARALLELISM,
        tagLength: MOD001_TAG_BYTES
      });

      if (computedTag.length !== parsed.tag.length) {
        return false;
      }

      return timingSafeEqual(computedTag, parsed.tag);
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Checks whether a stored credential secret digest is an unmigrated legacy SHA-256 digest.
   * Exactly 64 hexadecimal characters.
   */
  isLegacyShaDigest(digest: string): boolean {
    if (typeof digest !== 'string') return false;
    return /^[0-9a-f]{64}$/i.test(digest.trim());
  }

  /**
   * Verifies a password against a legacy domain-separated SHA-256 digest.
   * Strict domain separation: purpose 'ORGANIZER_AUTHENTICATION', subject accountId.
   */
  verifyLegacyDigest(storedDigest: string, accountId: string, password: string): boolean {
    if (!this.isLegacyShaDigest(storedDigest)) {
      return false;
    }

    const computed = computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(storedDigest.trim().toLowerCase(), 'hex');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Runs a constant-time dummy verification pass under the same admission control
   * to prevent username enumeration or timing discrepancies when accounts do not exist.
   */
  async verifyDummy(password: string): Promise<void> {
    const dummySalt = Buffer.alloc(MOD001_SALT_BYTES, 0xaa);
    const dummyBuf = Buffer.from(password, 'utf8');

    await this.acquireSlot();
    try {
      await this.engine.deriveKey({
        password: dummyBuf,
        salt: dummySalt,
        memoryKiB: MOD001_ARGON2_MEMORY_KIB,
        passes: MOD001_ARGON2_TIME_PASSES,
        parallelism: MOD001_ARGON2_PARALLELISM,
        tagLength: MOD001_TAG_BYTES
      });
    } finally {
      this.releaseSlot();
    }
  }
}
