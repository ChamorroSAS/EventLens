import { expect, it } from 'vitest';
import { readConfig } from '../src/platform/config/config.js';
it('validates secrets without printing their values',() => {
  expect(() => readConfig({DATABASE_URL:'secret-invalid'})).toThrow('INVALID_CONFIG:DATABASE_URL');
  expect(() => readConfig({DATABASE_URL:'postgresql://local:local@postgres:5432/local',API_PORT:'1.5'})).toThrow('INVALID_CONFIG:API_PORT');
  expect(() => readConfig({DATABASE_URL:'postgresql://local:local@postgres:5432/local',WEB_ORIGIN:'https://user:password@example.test'})).toThrow('INVALID_CONFIG:WEB_ORIGIN');
});
it('accepts bounded valid local configuration',() => {
  expect(readConfig({DATABASE_URL:'postgresql://local:local@postgres:5432/local'}).databaseTimeoutMs).toBe(2000);
});
it('accepts PostgreSQL fields without treating password characters as URL syntax',() => {
  const config = readConfig({PGHOST:'postgres',PGPORT:'5432',PGUSER:'local',PGPASSWORD:'p%@#/:',PGDATABASE:'eventlens'});
  expect(decodeURIComponent(new URL(config.databaseUrl).password)).toBe('p%@#/:');
});
it('only enables local administrative authority explicitly in loopback development', () => {
  const env = { DATABASE_URL: 'postgresql://local:local@postgres:5432/local', NODE_ENV: 'development', LOCAL_ADMIN_ENABLED: 'true', LOCAL_ADMIN_AUTHORITY_DIR: '/home/node/.eventlens/admin-authority' };
  expect(readConfig(env).localAdminAuthorityDir).toBe(env.LOCAL_ADMIN_AUTHORITY_DIR);
  for (const override of [{ NODE_ENV: 'production' }, { NODE_ENV: undefined }, { WEB_ORIGIN: 'https://public.example.test' }, { LOCAL_ADMIN_AUTHORITY_DIR: '/tmp/authority' }, { LOCAL_ADMIN_ENABLED: 'yes' }]) {
    expect(() => readConfig({ ...env, ...override })).toThrow('INVALID_CONFIG:LOCAL_ADMIN');
  }
  expect(readConfig({ ...env, LOCAL_ADMIN_ENABLED: 'false' }).localAdminAuthorityDir).toBeUndefined();
});
