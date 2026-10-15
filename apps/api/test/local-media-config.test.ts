import { expect, it } from 'vitest';
import { readConfig } from '../src/platform/config/config.js';

const env = { DATABASE_URL: 'postgresql://local:local@postgres:5432/local', NODE_ENV: 'development',
  LOCAL_MEDIA_UPLOAD_ENABLED: 'true', MINIO_ROOT_USER: 'isolated-media', MINIO_ROOT_PASSWORD: 'isolated-media-test-only' };
it('only enables explicit local development media with private credentials', () => {
  expect(readConfig(env).localMedia?.endpoint).toBe('http://minio:9000');
  expect(readConfig({ ...env, LOCAL_MEDIA_UPLOAD_ENABLED: 'false' }).localMedia).toBeUndefined();
  for (const override of [{ NODE_ENV: 'production' }, { MINIO_ENDPOINT: 'https://s3.amazonaws.com' },
    { MINIO_ENDPOINT: 'http://user:secret@minio:9000' }, { MINIO_BUCKET: '../other' },
    { MINIO_ROOT_PASSWORD: undefined }, { LOCAL_MEDIA_UPLOAD_ENABLED: 'yes' }]) {
    expect(() => readConfig({ ...env, ...override })).toThrow('INVALID_CONFIG:');
  }
});
