const LOCAL_LAB_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'web', 'api']);

const RESERVED_PREFIX_SEGMENTS = new Set(['api', 'media', 'assets', 'g']);

const STATIC_ASSET_EXTENSION_REGEX =
  /\.(?:js|mjs|cjs|css|svg|png|jpe?g|webp|gif|ico|json|woff2?|ttf|otf|eot|map|txt|xml|wasm)$/i;

export interface ValidatePublicEntryBaseOptions {
  readonly allowInsecureLocalHttp?: boolean;
  readonly allowPrivateNetworkHttp?: boolean;
}

function isPrivateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some(value => value > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

/**
 * Validates and normalizes the trusted public base URL used to emit guest links and QR payloads
 * (EL-TK-212, public-entry-contract.md).
 * - Rejects credentials, query strings, fragments, and non-HTTP(S) schemes.
 * - Enforces HTTPS for non-local origins; allows HTTP only for local/laboratory fixtures.
 * - Private IPv4 HTTP additionally requires the trusted development-only policy.
 * - Supports root (`/`) or a clean sub-prefix (e.g. `/app`) while rejecting reserved prefixes (`/api`, `/media`, `/assets`, `/g`).
 * - Returns the normalized base URL without trailing slashes so `/g/:lookupKey` can be appended deterministically.
 */
export function validateTrustedPublicEntryBaseUrl(
  rawUrl: string | undefined,
  options: ValidatePublicEntryBaseOptions = {}
): string {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalFixtureHost =
    LOCAL_LAB_HOSTS.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.localhost');

  const allowInsecureLocal = options.allowInsecureLocalHttp ?? true;

  if (parsed.protocol === 'http:') {
    const allowedPrivateNetwork = options.allowPrivateNetworkHttp === true && isPrivateIpv4(hostname);
    if (!allowInsecureLocal || !(isLocalFixtureHost || allowedPrivateNetwork)) {
      throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  }

  // Validate optional path prefix
  const rawPathname = parsed.pathname || '/';
  if (rawPathname.includes('..') || rawPathname.includes('//') || rawPathname.includes('\\')) {
    throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
  }

  const trimmedPath = rawPathname.replace(/\/+$/, '');
  if (trimmedPath.length > 0) {
    const segments = trimmedPath.split('/').filter(Boolean);
    for (const seg of segments) {
      if (!/^[a-zA-Z0-9_-]+$/.test(seg)) {
        throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
      }
    }
    if (segments.length > 0 && RESERVED_PREFIX_SEGMENTS.has(segments[0].toLowerCase())) {
      throw new Error('INVALID_CONFIG:PUBLIC_ENTRY_BASE_URL');
    }
  }

  return `${parsed.origin}${trimmedPath}`;
}

/**
 * Enforces that guest link / QR issuance uses only the server's trusted configuration
 * and never derives its base URL from HTTP Host headers or client payload overrides (EL-TK-212).
 */
export function resolveAuthoritativeShareBaseUrl(params: {
  readonly trustedPublicEntryBaseUrl: string;
  readonly untrustedBaseUrlOverride?: unknown;
  readonly untrustedHostOverride?: unknown;
  readonly allowPrivateNetworkHttp?: boolean;
}): string {
  if (
    params.untrustedBaseUrlOverride !== undefined &&
    params.untrustedBaseUrlOverride !== null &&
    params.untrustedBaseUrlOverride !== ''
  ) {
    throw new Error('UNTRUSTED_SHARE_BASE_OVERRIDE');
  }

  if (
    params.untrustedHostOverride !== undefined &&
    params.untrustedHostOverride !== null &&
    params.untrustedHostOverride !== ''
  ) {
    throw new Error('UNTRUSTED_SHARE_HOST_OVERRIDE');
  }

  return validateTrustedPublicEntryBaseUrl(params.trustedPublicEntryBaseUrl, {
    allowPrivateNetworkHttp: params.allowPrivateNetworkHttp === true
  });
}

/**
 * Redacts guest lookupKey credentials and guest session tokens from operational logs,
 * proxy traces, and telemetry payloads (EL-TK-211, EL-TK-212).
 */
export function redactLookupKeyInText(
  input: string,
  extraSecrets: readonly string[] = []
): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  let redacted = input
    // Redact /g/:lookupKey in paths or full URLs
    .replace(/(\/g\/)([^/?#\s"'&]+)/gi, '$1[REDACTED_LOOKUP_KEY]')
    // Redact /api/v1/public/guest-entry/:lookupKey
    .replace(
      /(\/api\/v1\/public\/guest-entry\/)([^/?#\s"'&]+)/gi,
      '$1[REDACTED_LOOKUP_KEY]'
    )
    // Redact guest session cookies
    .replace(/(el_guest_session=)([^;\s"']+)/gi, '$1[REDACTED_GUEST_SESSION]')
    // Redact organizer session cookies
    .replace(/((?:__Host-)?el_organizer_session=)([^;\s"']+)/gi, '$1[REDACTED_ORGANIZER_SESSION]');

  for (const secret of extraSecrets) {
    if (secret && secret.trim().length >= 6) {
      redacted = redacted.split(secret.trim()).join('[REDACTED_LOOKUP_KEY]');
    }
  }

  return redacted;
}

export type SpaServingAction =
  | 'SERVE_INDEX'
  | 'PASS_STATIC_OR_404'
  | 'REJECT_API_OR_MEDIA_404';

export interface SpaServingDecision {
  readonly action: SpaServingAction;
  readonly relativePath: string | null;
}

/**
 * Evaluates whether an HTTP request path should receive the SPA `index.html` fallback
 * or be excluded fail-closed (EL-TK-212).
 * - Excludes `/api`, `/media`, `/assets`, and any path with a physical file extension.
 * - Supports `/` default baseHref as well as alternative test prefixes (e.g. `/app/`).
 */
export function evaluateSpaServingDecision(
  rawUrlOrPath: string,
  baseHref = '/'
): SpaServingDecision {
  const cleanBaseHref = normalizeBaseHref(baseHref);
  const pathOnly = (rawUrlOrPath || '/').split('?')[0].split('#')[0] || '/';

  let relativePath: string;
  if (cleanBaseHref === '/') {
    if (!pathOnly.startsWith('/')) {
      return { action: 'PASS_STATIC_OR_404', relativePath: null };
    }
    relativePath = pathOnly;
  } else {
    const baseWithoutTrailing = cleanBaseHref.slice(0, -1);
    if (pathOnly === baseWithoutTrailing) {
      relativePath = '/';
    } else if (pathOnly.startsWith(cleanBaseHref)) {
      relativePath = '/' + pathOnly.slice(cleanBaseHref.length);
    } else {
      // Check if it's a root /api or /media path even when baseHref has a prefix
      if (
        pathOnly === '/api' ||
        pathOnly.startsWith('/api/') ||
        pathOnly === '/media' ||
        pathOnly.startsWith('/media/')
      ) {
        return { action: 'REJECT_API_OR_MEDIA_404', relativePath: pathOnly };
      }
      return { action: 'PASS_STATIC_OR_404', relativePath: null };
    }
  }

  if (
    relativePath === '/api' ||
    relativePath.startsWith('/api/') ||
    relativePath === '/media' ||
    relativePath.startsWith('/media/')
  ) {
    return { action: 'REJECT_API_OR_MEDIA_404', relativePath };
  }

  if (
    relativePath === '/assets' ||
    relativePath.startsWith('/assets/') ||
    STATIC_ASSET_EXTENSION_REGEX.test(relativePath)
  ) {
    return { action: 'PASS_STATIC_OR_404', relativePath };
  }

  return { action: 'SERVE_INDEX', relativePath };
}

export function normalizeBaseHref(baseHref: string | undefined): string {
  if (!baseHref || typeof baseHref !== 'string' || baseHref.trim() === '' || baseHref.trim() === '/') {
    return '/';
  }
  let normalized = baseHref.trim();
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  if (!normalized.endsWith('/')) {
    normalized = normalized + '/';
  }
  return normalized.replace(/\/+/g, '/');
}
