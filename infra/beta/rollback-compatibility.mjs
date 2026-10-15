#!/usr/bin/env node
/**
 * Phoeve Beta — migration and schema compatibility gate.
 *
 * Two questions, both answered fail-closed:
 *
 *   forward  — may this release be activated on the current database? Only when
 *              it knows every migration already applied.
 *   backward — may the previous release be restored with the current database?
 *              Only when every migration beyond that release is declared
 *              backward-compatible.
 *
 * The declarations live in `migration-compatibility.json`, next to this file, and
 * travel inside the release image. Nothing is inferred: an unlisted migration is
 * forward-only, so adding a migration cannot silently make rollback possible.
 *
 * The file is executed inside the release image, where the bundle and the
 * assembled Prisma manifest sit at the same relative paths as in the repository:
 *   /workspace/infra/beta/rollback-compatibility.mjs
 *   /workspace/infra/beta/migration-compatibility.json
 *   /workspace/packages/database/prisma/migration-manifest.json
 *
 * Usage:
 *   node rollback-compatibility.mjs --mode forward  --applied -
 *   node rollback-compatibility.mjs --mode backward --applied - \
 *     --release-manifest /target/migration-manifest.json
 *
 * Exit codes: 0 compatible, 1 refused, 2 invalid input.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

/** Where this release keeps what the gate reads. Same layout as the repository. */
export const COMPATIBILITY_FILE = resolve(scriptDir, 'migration-compatibility.json');
export const RELEASE_MANIFEST_FILE = resolve(
  scriptDir,
  '../../packages/database/prisma/migration-manifest.json'
);

export const VERDICTS = ['backward-compatible', 'forward-only'];

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_INPUT';
  return error;
}

/** Migration ids of a `migration-manifest.json` document, in assembly order. */
export function migrationIds(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== 1) {
    throw invalid('migration manifest: expected { schemaVersion: 1 }');
  }
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) {
    throw invalid('migration manifest: expected a non-empty migrations array');
  }
  return manifest.migrations.map((entry) => {
    if (!entry || typeof entry.id !== 'string' || entry.id === '') {
      throw invalid('migration manifest: every migration needs an id');
    }
    return entry.id;
  });
}

/** The reviewed declarations of the release that ships this file. */
export function compatibilityDeclarations(document) {
  if (!document || typeof document !== 'object' || document.schemaVersion !== 1) {
    throw invalid('migration compatibility: expected { schemaVersion: 1 }');
  }
  const verdictFor = (id, value) => {
    const verdict = typeof value === 'string' ? value : value?.compatibility;
    if (!VERDICTS.includes(verdict)) {
      throw invalid(`migration compatibility: "${id}" declares an unknown verdict`);
    }
    return verdict;
  };
  const reviewed = document.reviewed ?? {};
  if (typeof reviewed !== 'object' || Array.isArray(reviewed)) {
    throw invalid('migration compatibility: reviewed must be an object');
  }
  return {
    default: verdictFor('default', document.default),
    reviewed: Object.fromEntries(Object.entries(reviewed).map(([id, v]) => [id, verdictFor(id, v)]))
  };
}

/** The migration ids the database reports, one per line. */
export function parseApplied(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Decide whether a release may be activated (forward) or restored (backward).
 *
 * @param {{mode: 'forward'|'backward', applied: string[], release: string[],
 *   compatibility?: {default: string, reviewed: Record<string,string>}}} input
 */
export function decide({ mode, applied, release, compatibility }) {
  if (mode !== 'forward' && mode !== 'backward') throw new Error(`unknown mode "${mode}"`);
  const releaseSet = new Set(release);
  const appliedSet = new Set(applied);
  const beyondRelease = applied.filter((id) => !releaseSet.has(id));
  const notApplied = release.filter((id) => !appliedSet.has(id));

  if (mode === 'forward') {
    return {
      allowed: beyondRelease.length === 0,
      mode,
      applied,
      release,
      blocked: beyondRelease,
      declarations: [],
      detail:
        beyondRelease.length === 0
          ? 'the release knows every applied migration'
          : 'the release does not know every migration the database already has'
    };
  }

  const verdicts = beyondRelease.map((id) => ({
    id,
    verdict: compatibility?.reviewed?.[id] ?? compatibility?.default ?? 'unlisted'
  }));
  const refused = verdicts.filter((entry) => entry.verdict !== 'backward-compatible');

  return {
    allowed: notApplied.length === 0 && refused.length === 0,
    mode,
    applied,
    release,
    blocked: notApplied.length > 0 ? notApplied : refused.map((entry) => entry.id),
    declarations: verdicts,
    detail:
      notApplied.length > 0
        ? `restoring this release would demand ${notApplied.length} migration(s) it never received`
        : refused.length > 0
          ? 'the migrations beyond this release are not declared backward-compatible'
          : 'every migration beyond this release is declared backward-compatible'
  };
}

function requireValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function readInput(path) {
  if (path === '-') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(path, 'utf8');
}

function usage() {
  console.error(
    [
      'usage:',
      '  rollback-compatibility.mjs --mode forward  --applied <file|-> [--manifest <file>]',
      '  rollback-compatibility.mjs --mode backward --applied <file|->',
      '      --release-manifest <file> [--compatibility <file>]'
    ].join('\n')
  );
}

async function main() {
  const args = process.argv.slice(2);
  const mode = requireValue(args, '--mode');
  const appliedPath = requireValue(args, '--applied');
  if (!mode || !appliedPath) {
    usage();
    process.exitCode = 2;
    return;
  }

  const manifestPath =
    mode === 'forward'
      ? (requireValue(args, '--manifest') ?? RELEASE_MANIFEST_FILE)
      : requireValue(args, '--release-manifest');
  if (!manifestPath) {
    console.error('backward compatibility: --release-manifest is required');
    process.exitCode = 2;
    return;
  }

  // The declarations of whichever release runs this file: for a rollback that is
  // the release being replaced, which is exactly the one that reviewed them.
  let declarations;
  const compatibilityPath = requireValue(args, '--compatibility') ?? COMPATIBILITY_FILE;
  try {
    declarations = compatibilityDeclarations(JSON.parse(await readFile(compatibilityPath, 'utf8')));
  } catch (error) {
    console.error(`invalid compatibility file ${compatibilityPath}: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const release = migrationIds(JSON.parse(await readFile(manifestPath, 'utf8')));
  const applied = parseApplied(await readInput(appliedPath));
  const outcome = decide({ mode, applied, release, compatibility: declarations });

  console.log(`mode            : ${mode}`);
  console.log(`applied        : ${outcome.applied.length}`);
  console.log(`release        : ${outcome.release.length}`);
  if (outcome.declarations.length > 0) {
    for (const { id, verdict } of outcome.declarations) {
      console.log(`  ${id}: ${verdict}`);
    }
  }
  if (!outcome.allowed) {
    console.error(`REFUSED: ${outcome.detail}`);
    for (const id of outcome.blocked) console.error(`  - ${id}`);
    process.exitCode = 1;
    return;
  }
  console.log(`compatible: ${outcome.detail}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`rollback-compatibility: ${error.message}`);
    process.exitCode = 2;
  }
}
