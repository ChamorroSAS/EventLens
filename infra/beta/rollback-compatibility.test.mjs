#!/usr/bin/env node
/**
 * Tests for infra/beta/rollback-compatibility.mjs.
 *
 * The module decides whether a release may be activated (forward) or restored
 * (backward) against the migrations the database actually applied. These tests
 * cover both decisions, the shipped declaration file, and the command line.
 *
 * Run with: node --test infra/beta/rollback-compatibility.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import {
  COMPATIBILITY_FILE,
  RELEASE_MANIFEST_FILE,
  compatibilityDeclarations,
  decide,
  migrationIds,
  parseApplied
} from './rollback-compatibility.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const command = join(here, 'rollback-compatibility.mjs');

describe('migrationIds', () => {
  it('reads the ids of an assembled manifest', () => {
    assert.deepEqual(
      migrationIds({
        schemaVersion: 1,
        migrations: [
          { id: 'a', source: 'x', sha256: '1' },
          { id: 'b', source: 'y', sha256: '2' }
        ]
      }),
      ['a', 'b']
    );
  });

  it('refuses a manifest that is not the declared shape', () => {
    for (const broken of [null, {}, { schemaVersion: 2, migrations: [] }, { schemaVersion: 1 }]) {
      assert.throws(() => migrationIds(broken), /migration manifest/);
    }
    assert.throws(
      () => migrationIds({ schemaVersion: 1, migrations: [{ source: 'x' }] }),
      /needs an id/
    );
  });
});

describe('compatibilityDeclarations', () => {
  it('accepts a reviewable document and normalises object entries', () => {
    assert.deepEqual(
      compatibilityDeclarations({
        schemaVersion: 1,
        default: 'forward-only',
        reviewed: {
          a: 'backward-compatible',
          b: { compatibility: 'forward-only', evidence: 'dropped a column' }
        }
      }),
      { default: 'forward-only', reviewed: { a: 'backward-compatible', b: 'forward-only' } }
    );
  });

  it('refuses an unverifiable verdict', () => {
    assert.throws(
      () => compatibilityDeclarations({ schemaVersion: 1, default: 'maybe' }),
      /unknown verdict/
    );
    assert.throws(
      () =>
        compatibilityDeclarations({
          schemaVersion: 1,
          default: 'forward-only',
          reviewed: { a: 'likely' }
        }),
      /unknown verdict/
    );
    assert.throws(
      () => compatibilityDeclarations({ schemaVersion: 1, default: 'forward-only', reviewed: [] }),
      /reviewed must be an object/
    );
  });
});

describe('parseApplied', () => {
  it('splits the database report into ids', () => {
    assert.deepEqual(parseApplied('a\nb\n'), ['a', 'b']);
    assert.deepEqual(parseApplied('a\r\nb\r\n'), ['a', 'b']);
  });

  it('treats an empty database as no migrations applied', () => {
    assert.deepEqual(parseApplied(''), []);
    assert.deepEqual(parseApplied('\n'), []);
  });
});

describe('decide forward (activation)', () => {
  it('allows a release that knows every applied migration', () => {
    const outcome = decide({ mode: 'forward', applied: ['a', 'b'], release: ['a', 'b', 'c'] });
    assert.equal(outcome.allowed, true, outcome.detail);
    assert.deepEqual(outcome.blocked, []);
  });

  it('accepts a database that was never migrated', () => {
    const outcome = decide({ mode: 'forward', applied: [], release: ['a'] });
    assert.equal(outcome.allowed, true, outcome.detail);
  });

  it('refuses a release that is behind the database', () => {
    const outcome = decide({ mode: 'forward', applied: ['a', 'b', 'c'], release: ['a', 'b'] });
    assert.equal(outcome.allowed, false);
    assert.deepEqual(outcome.blocked, ['c']);
    assert.match(outcome.detail, /does not know/);
  });
});

describe('backward rollback', () => {
  const applied = ['a', 'b', 'c'];
  const release = ['a', 'b'];

  it('allows a rollback when the database equals the target', () => {
    const outcome = decide({ mode: 'backward', applied: ['a', 'b'], release });
    assert.equal(outcome.allowed, true, outcome.detail);
  });

  it('refuses a rollback across an undeclared migration', () => {
    const outcome = decide({ mode: 'backward', applied, release });
    assert.equal(outcome.allowed, false);
    assert.deepEqual(outcome.blocked, ['c']);
    assert.deepEqual(outcome.declarations, [{ id: 'c', verdict: 'unlisted' }]);
  });

  it('refuses a rollback whose extra migration is declared forward-only', () => {
    const outcome = decide({
      mode: 'backward',
      applied,
      release,
      compatibility: { default: 'backward-compatible', reviewed: { c: 'forward-only' } }
    });
    assert.equal(outcome.allowed, false);
    assert.deepEqual(outcome.blocked, ['c']);
  });

  it('allows a rollback whose extra migrations are declared', () => {
    const outcome = decide({
      mode: 'backward',
      applied,
      release,
      compatibility: { default: 'forward-only', reviewed: { c: 'backward-compatible' } }
    });
    assert.equal(outcome.allowed, true, outcome.detail);
    assert.deepEqual(outcome.declarations, [{ id: 'c', verdict: 'backward-compatible' }]);
  });

  it('refuses a target that still expects unapplied migrations', () => {
    const outcome = decide({
      mode: 'backward',
      applied: ['a'],
      release: ['a', 'b'],
      compatibility: { default: 'backward-compatible', reviewed: {} }
    });
    assert.equal(outcome.allowed, false);
    assert.deepEqual(outcome.blocked, ['b']);
  });

  it('refuses an unknown mode', () => {
    assert.throws(() => decide({ mode: 'sideways', applied: [], release: [] }), /unknown mode/);
  });
});

describe('paths', () => {
  it('reads the file next to it and the assembled manifest two levels up', () => {
    assert.equal(COMPATIBILITY_FILE, join(here, 'migration-compatibility.json'));
    assert.equal(
      RELEASE_MANIFEST_FILE,
      join(here, '..', '..', 'packages', 'database', 'prisma', 'migration-manifest.json')
    );
  });

  it('ships declarations that certify nothing by default', async () => {
    const document = JSON.parse(await readFile(COMPATIBILITY_FILE, 'utf8'));
    const declarations = compatibilityDeclarations(document);
    assert.equal(declarations.default, 'forward-only');
    assert.deepEqual(declarations.reviewed, {});
  });
});

describe('command line', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'phoeve-compatibility-'));
  const manifest = join(scratch, 'migration-manifest.json');
  const reviewed = join(scratch, 'migration-compatibility.json');
  writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, migrations: [{ id: 'a' }, { id: 'b' }] }));
  writeFileSync(reviewed, JSON.stringify({ schemaVersion: 1, default: 'forward-only', reviewed: { c: 'backward-compatible' } }));
  after(() => rmSync(scratch, { recursive: true, force: true }));

  const run = (args, input = '') =>
    spawnSync(process.execPath, [command, ...args], { encoding: 'utf8', input });

  it('requires a mode and a source', () => {
    const result = run([]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });

  it('refuses backward mode without a target manifest', () => {
    const result = run(['--mode', 'backward', '--applied', '-']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--release-manifest is required/);
  });

  it('accepts a forward move it can verify', () => {
    const result = run(['--mode', 'forward', '--applied', '-', '--manifest', manifest], 'a\nb\n');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /compatible: the release knows every applied migration/);
  });

  it('refuses a forward move onto a newer database', () => {
    const result = run(['--mode', 'forward', '--applied', '-', '--manifest', manifest], 'a\nb\nc\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REFUSED: the release does not know/);
    assert.match(result.stderr, /- c/);
  });

  it('refuses a rollback across an unlisted migration', () => {
    const result = run(
      ['--mode', 'backward', '--applied', '-', '--release-manifest', manifest],
      'a\nb\nc\n'
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /c: forward-only/);
    assert.match(result.stderr, /REFUSED: the migrations beyond this release/);
  });

  it('accepts a rollback across a reviewed migration', () => {
    const result = run(
      [
        '--mode',
        'backward',
        '--applied',
        '-',
        '--release-manifest',
        manifest,
        '--compatibility',
        reviewed
      ],
      'a\nb\nc\n'
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /c: backward-compatible/);
  });

  it('refuses an invalid declaration file', () => {
    const broken = join(scratch, 'broken.json');
    writeFileSync(broken, JSON.stringify({ schemaVersion: 1, default: 'probably' }));
    const result = run([
      '--mode',
      'backward',
      '--applied',
      '-',
      '--release-manifest',
      manifest,
      '--compatibility',
      broken
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /invalid compatibility file/);
  });
});
