import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { BLOCKERS, readPrivateReservation, validateReservation } from './pilot-bootstrap-preflight.mjs';

const script = fileURLToPath(new URL('./pilot-bootstrap-preflight.mjs', import.meta.url));
function fixture() {
  const lookupKey = randomBytes(18).toString('base64url');
  return { version: 1, organizerEmail: 'pilot@example.test', eventName: 'Private test event', startsAt: '2026-10-17T17:00:00-05:00', timezone: 'America/Bogota', location: 'Test location', publicOrigin: 'https://beta.phoeve.com', lookupKey, tokenHash: createHash('sha256').update(lookupKey).digest('hex') };
}
const fails = (value, code) => assert.throws(() => validateReservation(value), error => error.code === code);

test('valid reservation is always blocked and emits no private data', () => {
  const input = fixture(), before = JSON.stringify(input), result = validateReservation(input);
  assert.equal(result.bootstrap, 'BLOCKED');
  assert.equal(result.mutation, 'NOT_EXECUTED');
  assert.equal(result.deployedAccess, 'NOT_VERIFIED');
  assert.deepEqual(result.blockers, BLOCKERS);
  assert.equal(JSON.stringify(input), before);
  for (const privateValue of [input.lookupKey, input.tokenHash, input.organizerEmail, input.eventName, input.location]) assert.ok(!JSON.stringify(result).includes(privateValue));
});
test('repeated and concurrent checks preserve input and cannot issue an alternative credential', async () => {
  const input = fixture(), before = JSON.stringify(input);
  const results = await Promise.all(Array.from({ length: 30 }, async () => validateReservation(input)));
  assert.ok(results.every(result => result.bootstrap === 'BLOCKED'));
  assert.equal(JSON.stringify(input), before);
});
test('strict schema rejects caller-supplied authority, revocation, associations and bypass flags', () => {
  for (const key of ['authorityReady', 'allowUnsafe', 'revokedAt', 'eventId', 'organizerId', 'force', 'execute', 'token']) fails({ ...fixture(), [key]: true }, 'INVALID_RESERVATION_SCHEMA');
  for (const input of [null, [], '', {}, { ...fixture(), version: 2 }]) assert.throws(() => validateReservation(input));
});
test('malformed, URL, padded and non-base64url keys are rejected without echo', () => {
  for (const lookupKey of ['', 'short', 'a'.repeat(25), ' '.repeat(24), 'a'.repeat(23) + '/', 'https://private.test/g/test', 'a'.repeat(23) + '\n']) {
    try { validateReservation({ ...fixture(), lookupKey }); assert.fail('expected rejection'); }
    catch (error) { assert.match(error.code, /INVALID_/); assert.ok(!error.message.includes('private.test')); }
  }
});
test('hash and key inconsistencies fail; no fallback hash or new random credential', () => {
  fails({ ...fixture(), tokenHash: '0'.repeat(64) }, 'TOKEN_HASH_MISMATCH');
  for (const tokenHash of ['x'.repeat(64), 'A'.repeat(64), '', '1'.repeat(63)]) assert.throws(() => validateReservation({ ...fixture(), tokenHash }));
  const input = fixture(); fails({ ...input, lookupKey: fixture().lookupKey }, 'TOKEN_HASH_MISMATCH');
});
test('origin and confirmed schedule cannot be silently changed', () => {
  for (const publicOrigin of ['https://phoeve.com', 'http://beta.phoeve.com', 'https://beta.phoeve.com/', 'https://beta.phoeve.com.evil.test']) fails({ ...fixture(), publicOrigin }, 'RESERVED_ORIGIN_MISMATCH');
  for (const change of [{ startsAt: '2026-10-17T18:00:00-05:00' }, { timezone: 'UTC' }]) fails({ ...fixture(), ...change }, 'PILOT_SCHEDULE_MISMATCH');
});
test('malformed event metadata and control characters are rejected', () => {
  for (const change of [{ organizerEmail: 'BAD@EXAMPLE.TEST' }, { organizerEmail: 'invalid' }, { eventName: 'a'.repeat(121) }, { location: 'a'.repeat(241) }, { eventName: 'private\nname' }, { location: '' }]) assert.throws(() => validateReservation({ ...fixture(), ...change }));
});
test('CLI rejects secrets as arguments without printing arguments or paths', () => {
  const input = fixture();
  for (const args of [['--lookup-key', input.lookupKey], ['--execute'], ['--check', '--reservation-file', input.lookupKey]]) {
    const child = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.ok(!`${child.stdout}${child.stderr}`.includes(input.lookupKey));
    assert.equal(JSON.parse(child.stderr).mutation, 'NOT_EXECUTED');
  }
});
test('Windows refuses to infer ACL privacy from POSIX mode bits', { skip: process.platform !== 'win32' }, async () => {
  await assert.rejects(readPrivateReservation('C:\\private\\pilot.reservation.private.json'), error => error.code === 'PRIVATE_FILE_ACL_UNVERIFIED_USE_POSIX');
});
test('POSIX private file: check-only replay, parallel reads, permissions, symlinks and invalid JSON', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'phoeve-reservation-'));
  try {
    await assert.rejects(readPrivateReservation(fileURLToPath(new URL('../private.reservation.private.json', import.meta.url))), error => error.code === 'PRIVATE_FILE_INSIDE_REPOSITORY');
    const path = join(directory, 'pilot.reservation.private.json'), input = fixture();
    await writeFile(path, JSON.stringify(input), { mode: 0o600 });
    const before = await readFile(path);
    const checks = await Promise.all(Array.from({ length: 10 }, () => readPrivateReservation(path)));
    assert.ok(checks.every(report => report.bootstrap === 'BLOCKED'));
    assert.deepEqual(await readFile(path), before);
    const child = spawnSync(process.execPath, [script, '--check', '--reservation-file', path], { encoding: 'utf8' });
    assert.equal(child.status, 2);
    assert.equal(JSON.parse(child.stdout).bootstrap, 'BLOCKED');
    assert.ok(!`${child.stdout}${child.stderr}`.includes(input.lookupKey));
    await chmod(path, 0o644);
    await assert.rejects(readPrivateReservation(path), error => error.code === 'PRIVATE_FILE_PERMISSIONS_REQUIRED');
    await chmod(path, 0o600);
    const link = join(directory, 'linked.json'); await symlink(path, link);
    await assert.rejects(readPrivateReservation(link), error => error.code === 'PRIVATE_REGULAR_FILE_REQUIRED');
    await writeFile(path, '{' + input.lookupKey);
    const invalid = spawnSync(process.execPath, [script, '--check', '--reservation-file', path], { encoding: 'utf8' });
    assert.equal(invalid.status, 1);
    assert.ok(!`${invalid.stdout}${invalid.stderr}`.includes(input.lookupKey));
    assert.equal(JSON.parse(invalid.stderr).code, 'INVALID_PRIVATE_JSON');
    await writeFile(path, 'x'.repeat(8193));
    await assert.rejects(readPrivateReservation(path), error => error.code === 'PRIVATE_FILE_SIZE_INVALID');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
