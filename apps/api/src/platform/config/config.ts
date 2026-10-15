import { readDatabaseUrl } from '@eventlens/database';
import { validateTrustedPublicEntryBaseUrl } from './public-entry-serving.js';

export interface PlatformConfig {
  port: number;
  host: string;
  databaseUrl: string;
  databaseTimeoutMs: number;
  webOrigin: string;
  publicEntryBaseUrl: string;
  allowPrivateNetworkPublicEntryHttp?: boolean;
  identityPepperSecret: string;
  localAdminAuthorityDir?: string;
  /** Development-only private MinIO receiver; never an AWS/Beta provider choice. */
  localMedia?: { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string };
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
    env.PUBLIC_ENTRY_BASE_URL ?? webOrigin,
    { allowPrivateNetworkHttp: env.NODE_ENV === 'development' }
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
  let localMedia: PlatformConfig['localMedia'];
  if (env.LOCAL_MEDIA_UPLOAD_ENABLED === 'true') {
    if (env.NODE_ENV !== 'development') throw new Error('INVALID_CONFIG:LOCAL_MEDIA_UPLOAD_ENABLED');
    const endpoint = env.MINIO_ENDPOINT ?? 'http://minio:9000';
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash ||
        !['minio', 'test-minio', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('INVALID_CONFIG:MINIO_ENDPOINT');
    const bucket = env.MINIO_BUCKET ?? 'eventlens';
    if (!/^[a-z][a-z0-9-]{2,62}$/.test(bucket)) throw new Error('INVALID_CONFIG:MINIO_BUCKET');
    const accessKeyId = env.MINIO_ROOT_USER;
    const secretAccessKey = env.MINIO_ROOT_PASSWORD;
    if (!accessKeyId || !secretAccessKey || secretAccessKey.length < 8) throw new Error('INVALID_CONFIG:MINIO_CREDENTIALS');
    localMedia = { endpoint: url.origin, bucket, accessKeyId, secretAccessKey };
  } else if (env.LOCAL_MEDIA_UPLOAD_ENABLED && env.LOCAL_MEDIA_UPLOAD_ENABLED !== 'false') {
    throw new Error('INVALID_CONFIG:LOCAL_MEDIA_UPLOAD_ENABLED');
  }
  return {
    port: integer(env.API_PORT, 3000, 1, 65535, 'API_PORT'),
    host,
    databaseUrl,
    databaseTimeoutMs: integer(env.DATABASE_TIMEOUT_MS, 2000, 100, 30000, 'DATABASE_TIMEOUT_MS'),
    webOrigin,
    publicEntryBaseUrl,
    allowPrivateNetworkPublicEntryHttp: env.NODE_ENV === 'development',
    identityPepperSecret,
    localAdminAuthorityDir,
    localMedia
  };
}
