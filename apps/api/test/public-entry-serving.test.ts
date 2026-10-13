import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  evaluateSpaServingDecision,
  normalizeBaseHref,
  redactLookupKeyInText,
  resolveAuthoritativeShareBaseUrl,
  validateTrustedPublicEntryBaseUrl
} from '../src/platform/config/public-entry-serving.js';
import { readConfig } from '../src/platform/config/config.js';
import { createSpaStaticServer } from '../../web/spa-server.mjs';

describe('Public entry serving, trusted QR base URL, and lookupKey redaction (EL-TK-212)', () => {
  it('validates trusted public entry base URLs (HTTPS external, HTTP local/lab only, no reserved prefixes)', () => {
    expect(validateTrustedPublicEntryBaseUrl('https://eventos.eventlens.app')).toBe(
      'https://eventos.eventlens.app'
    );
    expect(validateTrustedPublicEntryBaseUrl('https://eventos.eventlens.app/portal/')).toBe(
      'https://eventos.eventlens.app/portal'
    );
    expect(validateTrustedPublicEntryBaseUrl('http://localhost:4200/')).toBe(
      'http://localhost:4200'
    );
    expect(validateTrustedPublicEntryBaseUrl('http://web:4200')).toBe('http://web:4200');

    // Rejects HTTP on non-local external domains
    expect(() =>
      validateTrustedPublicEntryBaseUrl('http://eventos.eventlens.app')
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');

    // Rejects credentials, query params, hashes, and reserved prefixes
    expect(() =>
      validateTrustedPublicEntryBaseUrl('https://user:pass@eventos.eventlens.app')
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
    expect(() =>
      validateTrustedPublicEntryBaseUrl('https://eventos.eventlens.app?foo=bar')
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
    expect(() =>
      validateTrustedPublicEntryBaseUrl('https://eventos.eventlens.app/api')
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
    expect(() =>
      validateTrustedPublicEntryBaseUrl('https://eventos.eventlens.app/g')
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  });

  it('rejects untrusted Host or payload baseUrl overrides when resolving authoritative QR share base URL', () => {
    const trusted = 'https://eventos.eventlens.app';
    expect(
      resolveAuthoritativeShareBaseUrl({
        trustedPublicEntryBaseUrl: trusted
      })
    ).toBe('https://eventos.eventlens.app');

    expect(() =>
      resolveAuthoritativeShareBaseUrl({
        trustedPublicEntryBaseUrl: trusted,
        untrustedBaseUrlOverride: 'https://evil.attacker.example'
      })
    ).toThrow('UNTRUSTED_SHARE_BASE_OVERRIDE');

    expect(() =>
      resolveAuthoritativeShareBaseUrl({
        trustedPublicEntryBaseUrl: trusted,
        untrustedHostOverride: 'evil.attacker.example'
      })
    ).toThrow('UNTRUSTED_SHARE_HOST_OVERRIDE');

    expect(() =>
      readConfig({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/eventlens',
        WEB_ORIGIN: 'http://localhost:4200',
        PUBLIC_ENTRY_BASE_URL: 'http://untrusted-external-domain.org'
      })
    ).toThrow('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  });

  it('redacts lookupKey and session cookies from operational logs and error stack traces', () => {
    const secretLookupKey = 'aB3_9xK1L0mZ4qP8rT2vW5yX';
    const rawLog =
      `GET /g/${secretLookupKey}?returnUrl=/mis-eventos 404 - ` +
      `upstream /api/v1/public/guest-entry/${secretLookupKey}/session ` +
      `Cookie: el_guest_session=raw_guest_secret_token_999; el_organizer_session=raw_org_token_888`;

    const redacted = redactLookupKeyInText(rawLog);
    expect(redacted).not.toContain(secretLookupKey);
    expect(redacted).not.toContain('raw_guest_secret_token_999');
    expect(redacted).not.toContain('raw_org_token_888');
    expect(redacted).toContain('/g/[REDACTED_LOOKUP_KEY]');
    expect(redacted).toContain('/api/v1/public/guest-entry/[REDACTED_LOOKUP_KEY]/session');
    expect(redacted).toContain('el_guest_session=[REDACTED_GUEST_SESSION]');
    expect(redacted).toContain('el_organizer_session=[REDACTED_ORGANIZER_SESSION]');
  });

  it('evaluates SPA fallback decisions excluding /api, /media, /assets, and static file extensions', () => {
    expect(normalizeBaseHref('/')).toBe('/');
    expect(normalizeBaseHref('/evento-app')).toBe('/evento-app/');

    expect(evaluateSpaServingDecision('/', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/ingresar', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/solicitar-acceso', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/mi-cuenta', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/mis-eventos', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/g/aB3_9xK1L0mZ4qP8rT2vW5yX', '/').action).toBe('SERVE_INDEX');
    expect(evaluateSpaServingDecision('/ruta-no-existente', '/').action).toBe('SERVE_INDEX');

    expect(evaluateSpaServingDecision('/api/v1/health/liveness', '/').action).toBe(
      'REJECT_API_OR_MEDIA_404'
    );
    expect(evaluateSpaServingDecision('/media/event-1/photo.jpg', '/').action).toBe(
      'REJECT_API_OR_MEDIA_404'
    );
    expect(evaluateSpaServingDecision('/assets/branding/favicon.svg', '/').action).toBe(
      'PASS_STATIC_OR_404'
    );
    expect(evaluateSpaServingDecision('/main-HASH123.js', '/').action).toBe('PASS_STATIC_OR_404');
  });

  it('serves SPA index on deep links/refresh, never absorbs /api, /media or missing assets, and supports alternate baseHref with log redaction', async () => {
    const tempDist = await mkdtemp(join(tmpdir(), 'el-spa-test-'));
    try {
      await mkdir(join(tempDist, 'assets', 'branding'), { recursive: true });
      await writeFile(
        join(tempDist, 'index.html'),
        '<!doctype html><html lang="es"><head><base href="/"><title>EventLens</title></head><body><eventlens-root></eventlens-root></body></html>',
        'utf8'
      );
      await writeFile(
        join(tempDist, 'assets', 'branding', 'favicon.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        'utf8'
      );

      const logs: string[] = [];
      const server = createSpaStaticServer({
        distDir: tempDist,
        baseHref: '/subapp/',
        onLog: (line: string) => logs.push(line)
      });

      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;

      try {
        // 1. Deep link to guest route under /subapp/g/:lookupKey serves index.html with updated <base href="/subapp/">
        const secretKey = 'secret_lookup_key_777888999';
        const guestRes = await fetch(`${base}/subapp/g/${secretKey}`);
        expect(guestRes.status).toBe(200);
        expect(guestRes.headers.get('content-type')).toContain('text/html');
        expect(guestRes.headers.get('referrer-policy')).toBe('no-referrer');
        const guestHtml = await guestRes.text();
        expect(guestHtml).toContain('<base href="/subapp/">');
        expect(guestHtml).toContain('<eventlens-root></eventlens-root>');

        // 2. Existing static asset under /subapp/assets/... returns SVG
        const assetRes = await fetch(`${base}/subapp/assets/branding/favicon.svg`);
        expect(assetRes.status).toBe(200);
        expect(assetRes.headers.get('content-type')).toContain('image/svg+xml');

        // 3. Missing static asset returns 404 (not index.html)
        const missingAssetRes = await fetch(`${base}/subapp/assets/branding/missing.svg`);
        expect(missingAssetRes.status).toBe(404);
        const missingAssetBody = await missingAssetRes.text();
        expect(missingAssetBody).not.toContain('<eventlens-root>');

        // 4. API and media routes return 404 (not index.html)
        const apiRes = await fetch(`${base}/subapp/api/v1/unknown`);
        expect(apiRes.status).toBe(404);
        expect(apiRes.headers.get('content-type')).toContain('application/json');

        const mediaRes = await fetch(`${base}/subapp/media/photo-1.jpg`);
        expect(mediaRes.status).toBe(404);
        expect(mediaRes.headers.get('content-type')).toContain('application/json');

        // 5. Server logs never contain the raw lookupKey
        const combinedLogs = logs.join('\n');
        expect(combinedLogs).not.toContain(secretKey);
        expect(combinedLogs).toContain('/g/[redacted]');
      } finally {
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      }
    } finally {
      await rm(tempDist, { recursive: true, force: true });
    }
  });
});
