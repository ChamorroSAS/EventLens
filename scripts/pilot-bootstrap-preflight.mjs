#!/usr/bin/env node
// Read-only reservation validation. There is deliberately no persistence adapter.
import { createHash, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const limit = 8192;
const fields = ['version', 'organizerEmail', 'eventName', 'startsAt', 'timezone', 'location', 'publicOrigin', 'lookupKey', 'tokenHash'];
export const BLOCKERS = Object.freeze([
  'RESERVED_CREDENTIAL_DOMAIN_OPERATION_MISSING',
  'AUTHORIZED_EVENT_PROVISIONING_CONTRACT_MISSING',
  'PUBLIC_CREDENTIAL_RECOVERY_RECONCILIATION_MISSING',
  'BETA_RECOVERY_AUTHORITY_GATE_PENDING',
  'DEPLOYED_EDGE_CREDENTIAL_REDACTION_UNVERIFIED'
]);

export class ReservationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const reject = code => { throw new ReservationError(code); };

/** Returns no credential, digest, URL, PII or caller-provided text. */
export function validateReservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) reject('INVALID_RESERVATION_SCHEMA');
  if (value.version !== 1) reject('UNSUPPORTED_RESERVATION_VERSION');
  for (const key of fields.filter(key => key !== 'version')) {
    if (typeof value[key] !== 'string' || value[key] !== value[key].trim() || !value[key] || /[\u0000-\u001f\u007f]/.test(value[key])) reject('INVALID_RESERVATION_FIELD');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.organizerEmail) || value.organizerEmail.length > 254 || value.organizerEmail !== value.organizerEmail.toLowerCase()) reject('INVALID_ORGANIZER_EMAIL');
  if (value.eventName.length > 120 || value.location.length > 240) reject('INVALID_EVENT_METADATA');
  if (value.publicOrigin !== 'https://beta.phoeve.com') reject('RESERVED_ORIGIN_MISMATCH');
  // This tool is narrowly scoped to the confirmed pilot schedule, not a seed API.
  if (value.startsAt !== '2026-10-17T17:00:00-05:00' || value.timezone !== 'America/Bogota') reject('PILOT_SCHEDULE_MISMATCH');
  if (!/^[A-Za-z0-9_-]{24}$/.test(value.lookupKey)) reject('INVALID_LOOKUP_KEY');
  if (!/^[a-f0-9]{64}$/.test(value.tokenHash)) reject('INVALID_TOKEN_HASH');
  const actual = createHash('sha256').update(value.lookupKey, 'utf8').digest();
  if (!timingSafeEqual(actual, Buffer.from(value.tokenHash, 'hex'))) reject('TOKEN_HASH_MISMATCH');
  return Object.freeze({ reservation: 'VALID', bootstrap: 'BLOCKED', mutation: 'NOT_EXECUTED', deployedAccess: 'NOT_VERIFIED', blockers: BLOCKERS });
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

/** POSIX owner-only file, outside the checkout. Never writes, chmods or copies it. */
export async function readPrivateReservation(file) {
  if (typeof file !== 'string' || !isAbsolute(file)) reject('ABSOLUTE_PRIVATE_FILE_REQUIRED');
  // Windows mode bits do not establish ACL privacy. Do not silently accept them.
  if (process.platform === 'win32' || !process.geteuid) reject('PRIVATE_FILE_ACL_UNVERIFIED_USE_POSIX');
  let handle;
  let bytes;
  try {
    const parent = await realpath(dirname(file));
    const actualPath = resolve(parent, basename(file));
    if (inside(await realpath(repository), actualPath)) reject('PRIVATE_FILE_INSIDE_REPOSITORY');
    const before = await lstat(actualPath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) reject('PRIVATE_REGULAR_FILE_REQUIRED');
    handle = await open(actualPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const current = await handle.stat();
    if (before.dev !== current.dev || before.ino !== current.ino || !current.isFile() || current.nlink !== 1) reject('PRIVATE_FILE_CHANGED');
    if (current.uid !== process.geteuid() || (current.mode & 0o077) !== 0) reject('PRIVATE_FILE_PERMISSIONS_REQUIRED');
    if (current.size < 2 || current.size > limit) reject('PRIVATE_FILE_SIZE_INVALID');
    // Bounded read even if another process grows the same file after stat.
    bytes = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead !== current.size || after.size !== current.size || after.mtimeMs !== current.mtimeMs || after.ctimeMs !== current.ctimeMs) reject('PRIVATE_FILE_CHANGED');
    if (bytesRead > limit) reject('PRIVATE_FILE_SIZE_INVALID');
    let manifest;
    try { manifest = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8')); }
    catch { reject('INVALID_PRIVATE_JSON'); }
    return validateReservation(manifest);
  } catch (error) {
    if (error instanceof ReservationError) throw error;
    // Native errors may contain paths, source contents or credentials.
    reject('PRIVATE_FILE_UNREADABLE');
  } finally {
    bytes?.fill(0);
    await handle?.close().catch(() => {});
  }
}

export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length !== 3 || args[0] !== '--check' || args[1] !== '--reservation-file') reject('USAGE_CHECK_PRIVATE_FILE_ONLY');
    console.log(JSON.stringify(await readPrivateReservation(args[2])));
    return 2; // Valid private input is not authorization or operational readiness.
  } catch (error) {
    console.error(JSON.stringify({ reservation: 'REJECTED', bootstrap: 'BLOCKED', mutation: 'NOT_EXECUTED', code: error instanceof ReservationError ? error.code : 'PREFLIGHT_FAILED' }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
