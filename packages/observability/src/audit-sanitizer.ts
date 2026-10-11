import { AuditError } from './contracts.js';

export interface SanitizerOptions {
  maxDepth?: number;
  maxStringLength?: number;
  maxObjectKeys?: number;
  maxPayloadBytes?: number;
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_STRING_LENGTH = 512;
const DEFAULT_MAX_OBJECT_KEYS = 30;
const DEFAULT_MAX_PAYLOAD_BYTES = 4096;

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /^auth/i,
  /authorization/i,
  /cookie/i,
  /apikey/i,
  /api_key/i,
  /privatekey/i,
  /private_key/i,
  /pin/i,
  /sessiontoken/i,
  /refreshtoken/i,
  /accesstoken/i,
  /jwt/i,
  /salt/i,
  /creditcard/i,
  /cvv/i,
  /cardnumber/i
];

const MULTIMEDIA_OR_BINARY_KEY_PATTERNS = [
  /buffer/i,
  /bytes/i,
  /datauri/i,
  /filedata/i,
  /mediabytes/i,
  /photobytes/i,
  /videobytes/i,
  /rawimage/i,
  /rawvideo/i,
  /stream/i,
  /blob/i
];

const JWT_REGEX = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const BEARER_REGEX = /^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i;
const CONNECTION_STRING_REGEX = /([a-z]+:\/\/)([^@]+)(@.+)/gi;

export class AuditSanitizer {
  private readonly maxDepth: number;
  private readonly maxStringLength: number;
  private readonly maxObjectKeys: number;
  private readonly maxPayloadBytes: number;

  constructor(options: SanitizerOptions = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
    this.maxObjectKeys = options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS;
    this.maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  public sanitizeMetadata(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!input || typeof input !== 'object') {
      return {};
    }

    const sanitized = this.sanitizeValue(input, 0) as Record<string, unknown>;
    const serialized = JSON.stringify(sanitized);

    if (Buffer.byteLength(serialized, 'utf8') > this.maxPayloadBytes) {
      throw new AuditError(
        'METADATA_TOO_LARGE',
        `Sanitized metadata exceeds maximum allowed size of ${this.maxPayloadBytes} bytes`
      );
    }

    return sanitized;
  }

  public sanitizeReason(reason: string | Error | null | undefined): string | null {
    if (!reason) {
      return null;
    }

    let message: string;
    if (reason instanceof Error) {
      // Extract error name and message, NEVER record stack trace
      message = reason.name === 'Error' ? reason.message : `[${reason.name}] ${reason.message}`;
    } else {
      message = String(reason);
    }

    // Mask sensitive connection strings or bearer tokens
    message = message.replace(CONNECTION_STRING_REGEX, '$1[REDACTED]$3');
    message = message.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    message = message.replace(/password\s*[:=]\s*[^\s,]+/gi, 'password=[REDACTED]');

    if (message.length > this.maxStringLength) {
      message = `${message.slice(0, this.maxStringLength)}...[TRUNCATED]`;
    }

    return message;
  }

  private sanitizeValue(val: unknown, currentDepth: number): unknown {
    if (val === null || val === undefined) {
      return null;
    }

    if (typeof val === 'string') {
      return this.sanitizeString(val);
    }

    if (typeof val === 'number' || typeof val === 'boolean') {
      return val;
    }

    if (typeof val === 'bigint') {
      return val.toString();
    }

    if (val instanceof Date) {
      return val.toISOString();
    }

    // Binary / Buffer check
    if (Buffer.isBuffer(val) || val instanceof Uint8Array || val instanceof ArrayBuffer) {
      return '[BINARY_OMITTED]';
    }

    if (currentDepth >= this.maxDepth) {
      return '[DEPTH_EXCEEDED]';
    }

    if (Array.isArray(val)) {
      return val.slice(0, this.maxObjectKeys).map((item) => this.sanitizeValue(item, currentDepth + 1));
    }

    if (typeof val === 'object') {
      const result: Record<string, unknown> = {};
      const keys = Object.keys(val).slice(0, this.maxObjectKeys);

      for (const key of keys) {
        // Prevent prototype pollution
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue;
        }

        const child = (val as Record<string, unknown>)[key];
        if (Buffer.isBuffer(child) || child instanceof Uint8Array || child instanceof ArrayBuffer) {
          result[key] = '[BINARY_OMITTED]';
          continue;
        }

        if (this.isSensitiveKey(key)) {
          result[key] = '[REDACTED]';
          continue;
        }

        if (this.isMultimediaKey(key)) {
          result[key] = '[MULTIMEDIA_OMITTED]';
          continue;
        }

        result[key] = this.sanitizeValue(child, currentDepth + 1);
      }

      return result;
    }

    return '[UNSUPPORTED_TYPE]';
  }

  private sanitizeString(str: string): string {
    if (JWT_REGEX.test(str.trim())) {
      return '[REDACTED_JWT]';
    }

    if (BEARER_REGEX.test(str.trim())) {
      return '[REDACTED_BEARER]';
    }

    let sanitized = str.replace(CONNECTION_STRING_REGEX, '$1[REDACTED]$3');

    if (sanitized.length > this.maxStringLength) {
      sanitized = `${sanitized.slice(0, this.maxStringLength)}...[TRUNCATED]`;
    }

    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }

  private isMultimediaKey(key: string): boolean {
    return MULTIMEDIA_OR_BINARY_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }
}
