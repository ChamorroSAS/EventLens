import { HealthSignal, OperationalMetric } from './contracts.js';

const SENSITIVE_DIMENSION_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /^auth/i,
  /cookie/i,
  /apikey/i,
  /api_key/i,
  /privatekey/i,
  /pin/i,
  /email/i,
  /user_id/i,
  /userId/i,
  /session/i,
  /creditcard/i,
  /card/i,
  /payload/i,
  /body/i
];

const JWT_PATTERN = /^[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}$/;
const BEARER_PATTERN = /^Bearer\s+/i;
const CONNECTION_STRING_PATTERN = /([a-z]+:\/\/)([^@]+)(@.+)/gi;

const MAX_DIMENSION_COUNT = 10;
const MAX_KEY_LENGTH = 64;
const MAX_VALUE_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 256;

export class TelemetrySanitizer {
  public sanitizeDimensions(
    dimensions?: Record<string, string | number | boolean>
  ): Record<string, string | number | boolean> {
    if (!dimensions || typeof dimensions !== 'object') {
      return {};
    }

    const sanitized: Record<string, string | number | boolean> = {};
    const keys = Object.keys(dimensions).slice(0, MAX_DIMENSION_COUNT);

    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      const truncatedKey = key.slice(0, MAX_KEY_LENGTH);

      if (this.isSensitiveKey(truncatedKey)) {
        sanitized[truncatedKey] = '[REDACTED]';
        continue;
      }

      const val = dimensions[key];

      if (typeof val === 'number' || typeof val === 'boolean') {
        sanitized[truncatedKey] = val;
        continue;
      }

      if (typeof val === 'string') {
        sanitized[truncatedKey] = this.sanitizeDimensionValue(val);
        continue;
      }

      // Drop non-primitive values to prevent cardinality explosion
      sanitized[truncatedKey] = '[UNSUPPORTED_DIMENSION]';
    }

    return sanitized;
  }

  public sanitizeMessage(message?: string): string | undefined {
    if (!message) {
      return undefined;
    }

    let sanitized = message.replace(CONNECTION_STRING_PATTERN, '$1[REDACTED]$3');
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(
      /(password|secret|token|apiKey|api_key|secret_token|access_key|secret_key|AWSSecretKey|AWSAccessKeyId|Signature|X-Amz-Signature|key)\s*[:=\s]\s*[^\s,]+/gi,
      '$1=[REDACTED]'
    );
    sanitized = sanitized.replace(/password\s+authentication\s+failed\s+for\s+user\s+"[^"]+"/gi, 'authentication failed for user "[REDACTED]"');
    sanitized = sanitized.replace(/(s3|gs|minio):\/\/[^\s/]+\/([^\s]+)/gi, '$1://[REDACTED_BUCKET]/[REDACTED_KEY]');

    // Strip stack traces
    if (sanitized.includes('\n') || sanitized.includes(' at ')) {
      sanitized = sanitized.split('\n')[0] ?? sanitized;
    }

    if (sanitized.length > MAX_MESSAGE_LENGTH) {
      sanitized = `${sanitized.slice(0, MAX_MESSAGE_LENGTH)}...[TRUNCATED]`;
    }

    return sanitized;
  }

  public sanitizeMetric(metric: OperationalMetric): OperationalMetric {
    return {
      name: metric.name.slice(0, MAX_KEY_LENGTH),
      type: metric.type,
      value: Number.isFinite(metric.value) ? metric.value : 0,
      unit: metric.unit?.slice(0, 16),
      dimensions: this.sanitizeDimensions(metric.dimensions),
      timestamp: metric.timestamp instanceof Date ? metric.timestamp : new Date()
    };
  }

  public sanitizeHealthSignal(signal: HealthSignal): HealthSignal {
    return {
      component: signal.component,
      status: signal.status,
      latencyMs: signal.latencyMs !== undefined && Number.isFinite(signal.latencyMs) ? signal.latencyMs : undefined,
      message: this.sanitizeMessage(signal.message),
      dimensions: this.sanitizeDimensions(signal.dimensions),
      timestamp: signal.timestamp instanceof Date ? signal.timestamp : new Date()
    };
  }

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_DIMENSION_KEY_PATTERNS.some((p) => p.test(key));
  }

  private sanitizeDimensionValue(val: string): string {
    if (JWT_PATTERN.test(val.trim())) {
      return '[REDACTED_JWT]';
    }

    if (BEARER_PATTERN.test(val.trim())) {
      return '[REDACTED_BEARER]';
    }

    let result = val.replace(CONNECTION_STRING_PATTERN, '$1[REDACTED]$3');

    if (result.length > MAX_VALUE_LENGTH) {
      result = `${result.slice(0, MAX_VALUE_LENGTH)}...[TRUNCATED]`;
    }

    return result;
  }
}
