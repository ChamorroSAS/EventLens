import { readDatabaseUrl } from '@eventlens/database';
import { validateTrustedPublicEntryBaseUrl } from './public-entry-serving.js';

export interface PlatformConfig {
  port: number;
  host: string;
  databaseUrl: string;
  databaseTimeoutMs: number;
  webOrigin: string;
  publicEntryBaseUrl: string;
  identityPepperSecret: string;
  localAdminAuthorityDir?: string;
}

function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  field: string
): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max)
    throw new Error(`INVALID_CONFIG:${field}`);
  return result;
}

/** Validate configuration at startup without printing secret values. */
export function readConfig(env: NodeJS.ProcessEnv): PlatformConfig {
  const databaseUrl = readDatabaseUrl(env);
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:4200';
  try {
    const url = new URL(webOrigin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== webOrigin ||
      url.username ||
      url.password
    )
      throw new Error();
  } catch {
    throw new Error('INVALID_CONFIG:WEB_ORIGIN');
  }
  const publicEntryBaseUrl = validateTrustedPublicEntryBaseUrl(
    env.PUBLIC_ENTRY_BASE_URL ?? webOrigin
  );
  const host = env.API_HOST ?? '0.0.0.0';
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('INVALID_CONFIG:API_HOST');
  const identityPepperSecret =
    env.IDENTITY_PEPPER_SECRET ?? 'eventlens-local-dev-pepper-secret-0123456789abcdef';
  if (identityPepperSecret.trim().length < 32)
    throw new Error('INVALID_CONFIG:IDENTITY_PEPPER_SECRET');
  let localAdminAuthorityDir: string | undefined;
  if (env.LOCAL_ADMIN_ENABLED === 'true') {
    if (env.NODE_ENV !== 'development' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(webOrigin).hostname) ||
        env.LOCAL_ADMIN_AUTHORITY_DIR !== '/home/node/.eventlens/admin-authority') {
      throw new Error('INVALID_CONFIG:LOCAL_ADMIN');
    }
    localAdminAuthorityDir = env.LOCAL_ADMIN_AUTHORITY_DIR;
  } else if (env.LOCAL_ADMIN_ENABLED && env.LOCAL_ADMIN_ENABLED !== 'false') {
    throw new Error('INVALID_CONFIG:LOCAL_ADMIN');
  }
  return {
    port: integer(env.API_PORT, 3000, 1, 65535, 'API_PORT'),
    host,
    databaseUrl,
    databaseTimeoutMs: integer(env.DATABASE_TIMEOUT_MS, 2000, 100, 30000, 'DATABASE_TIMEOUT_MS'),
    webOrigin,
    publicEntryBaseUrl,
    identityPepperSecret,
    localAdminAuthorityDir
  };
}
