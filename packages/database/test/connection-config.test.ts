import { expect, it } from 'vitest';
import { readDatabaseUrl } from '../src/index.js';
const fields = {PGHOST:'postgres',PGPORT:'5432',PGUSER:'local',PGPASSWORD:'local',PGDATABASE:'eventlens'};
it('encodes reserved credential and database characters without changing their meaning',() => {
  const credentials = 'value% @#/:?';
  const url = new URL(readDatabaseUrl({...fields,PGUSER:credentials,PGPASSWORD:credentials,PGDATABASE:credentials}));
  expect(url.hostname).toBe('postgres'); expect(url.port).toBe('5432');
  expect(decodeURIComponent(url.username)).toBe(credentials);
  expect(decodeURIComponent(url.password)).toBe(credentials);
  expect(decodeURIComponent(url.pathname.slice(1))).toBe(credentials);
  expect(url.hash).toBe(''); expect(url.search).toBe('');
});
it('preserves explicit DATABASE_URL compatibility and rejects an invalid explicit override',() => {
  const connection = 'postgresql://user:p%40ss@postgres:5432/eventlens?sslmode=disable';
  expect(readDatabaseUrl({...fields,DATABASE_URL:connection})).toBe(connection);
  expect(() => readDatabaseUrl({...fields,DATABASE_URL:'secret-invalid'})).toThrow('INVALID_CONFIG:DATABASE_URL');
});
it.each(['PGHOST','PGPORT','PGUSER','PGPASSWORD','PGDATABASE'])('requires %s when URI is not supplied',field => {
  expect(() => readDatabaseUrl({...fields,[field]:''})).toThrow(`INVALID_CONFIG:${field}`);
});
it.each(['0','65536','1.5','NaN','-1'])('rejects invalid PostgreSQL port %s',port => {
  expect(() => readDatabaseUrl({...fields,PGPORT:port})).toThrow('INVALID_CONFIG:PGPORT');
});
it('rejects host injection and supports IPv6',() => {
  expect(() => readDatabaseUrl({...fields,PGHOST:'host@other/private'})).toThrow('INVALID_CONFIG:PGHOST');
  expect(new URL(readDatabaseUrl({...fields,PGHOST:'::1'})).hostname).toBe('[::1]');
});
