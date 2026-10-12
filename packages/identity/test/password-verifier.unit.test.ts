import { describe, it, expect, vi } from 'vitest';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PasswordVerifier,
  PasswordVerifierError,
  parseArgon2idPhc,
  serializeArgon2idPhc,
  toBase64NoPadding,
  fromBase64NoPadding,
  MOD001_ARGON2_MEMORY_KIB,
  MOD001_ARGON2_TIME_PASSES,
  MOD001_ARGON2_PARALLELISM,
  MOD001_SALT_BYTES,
  MOD001_TAG_BYTES,
  type Argon2Engine
} from '../src/password-verifier.js';
import { computeCredentialDigest } from '../src/contracts.js';

describe('EL-TK-185: PasswordVerifier (Unit Tests)', () => {
  describe('PHC Parsing and Serialization', () => {
    it('serializes and parses canonical MOD-001 PHC strings without padding', () => {
      const salt = randomBytes(MOD001_SALT_BYTES);
      const tag = randomBytes(MOD001_TAG_BYTES);

      const phc = serializeArgon2idPhc(salt, tag);

      expect(phc).toMatch(new RegExp(`^\\$argon2id\\$v=19\\$m=${MOD001_ARGON2_MEMORY_KIB},t=${MOD001_ARGON2_TIME_PASSES},p=${MOD001_ARGON2_PARALLELISM}\\$[A-Za-z0-9+/]+\\$[A-Za-z0-9+/]+$`));
      expect(phc.endsWith('=')).toBe(false);
      expect(phc.split('$')[4]).not.toContain('=');
      expect(phc.split('$')[5]).not.toContain('=');

      const parsed = parseArgon2idPhc(phc);
      expect(parsed.salt.equals(salt)).toBe(true);
      expect(parsed.tag.equals(tag)).toBe(true);
    });

    it('rejects malformed or non-canonical PHC strings', () => {
      expect(() => parseArgon2idPhc('not-a-phc')).toThrow(PasswordVerifierError);
      expect(() => parseArgon2idPhc('$argon2i$v=19$m=19456,t=2,p=1$aaaa$bbbb')).toThrow(PasswordVerifierError);
      expect(() => parseArgon2idPhc('$argon2id$v=13$m=19456,t=2,p=1$aaaa$bbbb')).toThrow(PasswordVerifierError);
      expect(() => parseArgon2idPhc('$argon2id$v=19$m=65536,t=2,p=1$aaaa$bbbb')).toThrow(PasswordVerifierError);

      // Wrong salt length
      const shortSalt = toBase64NoPadding(Buffer.alloc(8));
      const validTag = toBase64NoPadding(Buffer.alloc(32));
      expect(() =>
        parseArgon2idPhc(`$argon2id$v=19$m=19456,t=2,p=1$${shortSalt}$${validTag}`)
      ).toThrow(PasswordVerifierError);

      // Wrong tag length
      const validSalt = toBase64NoPadding(Buffer.alloc(16));
      const shortTag = toBase64NoPadding(Buffer.alloc(16));
      expect(() =>
        parseArgon2idPhc(`$argon2id$v=19$m=19456,t=2,p=1$${validSalt}$${shortTag}`)
      ).toThrow(PasswordVerifierError);
    });
  });

  describe('Password Hashing and Verification', () => {
    const verifier = new PasswordVerifier();

    it('Escenario 1: generates canonical Argon2id envelope and verifies password matches', async () => {
      const password = 'SuperSecretOrganizerPassword2026!';
      const hash = await verifier.hashPassword(password);

      expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);

      const isValid = await verifier.verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isWrongValid = await verifier.verifyPassword(hash, 'IncorrectPassword');
      expect(isWrongValid).toBe(false);
    });

    it('preserves exact UTF-8 without trim or normalization (DEC-108)', async () => {
      const passwordWithSpaces = '  SpacesAtEndsAndMiddle 123  ';
      const hash = await verifier.hashPassword(passwordWithSpaces);

      // Strict match with exact spaces
      expect(await verifier.verifyPassword(hash, passwordWithSpaces)).toBe(true);
      // Fails if trimmed
      expect(await verifier.verifyPassword(hash, passwordWithSpaces.trim())).toBe(false);
    });

    it('fails closed when envelope is corrupted without falling back to SHA', async () => {
      const invalidEnvelope = '$argon2id$v=19$m=19456,t=2,p=1$corrupted$invalid';
      const result = await verifier.verifyPassword(invalidEnvelope, 'SomePassword');
      expect(result).toBe(false);
    });
  });

  describe('Legacy SHA-256 Transitional Detection and Verification', () => {
    const verifier = new PasswordVerifier();

    it('Escenario 2: correctly identifies legacy SHA-256 digest vs Argon2id envelope', () => {
      const accountId = '00000000-0000-0000-0000-000000000001';
      const legacySha = computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, 'ValidPassword');
      expect(verifier.isLegacyShaDigest(legacySha)).toBe(true);
      expect(verifier.isLegacyShaDigest('$argon2id$v=19$m=19456,t=2,p=1$salt$tag')).toBe(false);
      expect(verifier.isLegacyShaDigest('too-short')).toBe(false);
    });

    it('verifies legacy domain-separated SHA-256 digest', () => {
      const accountId = '00000000-0000-0000-0000-000000000001';
      const password = 'LegacyPassword123!';
      const legacySha = computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password);

      expect(verifier.verifyLegacyDigest(legacySha, accountId, password)).toBe(true);
      expect(verifier.verifyLegacyDigest(legacySha, accountId, 'WrongPassword')).toBe(false);
      // Different accountId fails due to domain separation
      expect(verifier.verifyLegacyDigest(legacySha, '00000000-0000-0000-0000-000000000002', password)).toBe(false);
    });
  });

  describe('Admission Control and Bounded Resources', () => {
    it('limits in-flight crypto executions and queues callers', async () => {
      let activeCrypto = 0;
      let maxSimultaneousCrypto = 0;

      const mockEngine: Argon2Engine = {
        async deriveKey(params) {
          activeCrypto++;
          maxSimultaneousCrypto = Math.max(maxSimultaneousCrypto, activeCrypto);
          // Simulate crypto delay
          await new Promise((r) => setTimeout(r, 20));
          activeCrypto--;
          return Buffer.alloc(params.tagLength, 0x42);
        }
      };

      const limitedVerifier = new PasswordVerifier({
        engine: mockEngine,
        maxInFlight: 1,
        maxQueue: 5
      });

      // Run 3 hashing jobs concurrently
      const jobs = Promise.all([
        limitedVerifier.hashPassword('pass1'),
        limitedVerifier.hashPassword('pass2'),
        limitedVerifier.hashPassword('pass3')
      ]);

      await jobs;

      // Ensure that at no point were more than 1 in-flight jobs executing concurrently
      expect(maxSimultaneousCrypto).toBe(1);
    });

    it('rejects with ADMISSION_SATURATED when queue capacity is exceeded', async () => {
      const mockEngine: Argon2Engine = {
        async deriveKey(params) {
          await new Promise((r) => setTimeout(r, 50));
          return Buffer.alloc(params.tagLength, 0x42);
        }
      };

      const tightVerifier = new PasswordVerifier({
        engine: mockEngine,
        maxInFlight: 1,
        maxQueue: 1
      });

      // 1 in flight + 1 in queue = 2 slots max
      const p1 = tightVerifier.hashPassword('pass1');
      const p2 = tightVerifier.hashPassword('pass2');

      // 3rd should be rejected immediately due to saturated queue
      await expect(tightVerifier.hashPassword('pass3')).rejects.toThrow(
        expect.objectContaining({ code: 'ADMISSION_SATURATED' })
      );

      await Promise.all([p1, p2]);
    });
  });

  describe('Constant-Time Dummy Verification', () => {
    it('executes dummy verification pass under the same admission control', async () => {
      const verifier = new PasswordVerifier();
      await expect(verifier.verifyDummy('randomPassword')).resolves.toBeUndefined();
    });
  });
});
