import { APPROVED_PUBLIC_ENTRY_PATHS } from './public-entry-routes.contract';

const ALLOWED_INTERNAL_RETURN_PATHS = new Set<string>([
  APPROVED_PUBLIC_ENTRY_PATHS.HOME,
  APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_ACCOUNT,
  APPROVED_PUBLIC_ENTRY_PATHS.ORGANIZER_DASHBOARD
]);

const FORBIDDEN_FILE_EXTENSION_PATTERN =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|m?js|map|json|txt|xml|pdf|woff2?|ttf|otf|mp4|webm|mov|zip)$/i;

const CONTROL_OR_BACKSLASH_PATTERN = /[\u0000-\u001F\u007F\\]/;
const ENCODED_DANGEROUS_SEQUENCE_PATTERN = /%(?:00|0a|0d|2f|5c|25)/i;
const SCHEME_PREFIX_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * Pure canonicalization of an internal returnUrl candidate (EL-TK-206).
 * Rejects external URLs, protocol-relative URLs, schemes, encodings of slashes/backslashes,
 * path traversal, API/media/assets paths, guest QR (/g/:lookupKey), admin (/admin),
 * and authentication/entry cycles (/ingresar, /solicitar-acceso).
 * Always falls back to '/' when invalid or unauthorized as a return target.
 * Note: Returning a path here does not grant session authority; the consumer re-validates with MOD-001 (EL-TK-205).
 */
export function canonicalizeInternalReturnUrl(candidate: unknown): string {
  if (typeof candidate !== 'string') {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  if (
    CONTROL_OR_BACKSLASH_PATTERN.test(trimmed) ||
    ENCODED_DANGEROUS_SEQUENCE_PATTERN.test(trimmed) ||
    SCHEME_PREFIX_PATTERN.test(trimmed)
  ) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  if (
    CONTROL_OR_BACKSLASH_PATTERN.test(decoded) ||
    decoded.startsWith('//') ||
    SCHEME_PREFIX_PATTERN.test(decoded)
  ) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, 'https://eventlens.internal');
  } catch {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  if (
    parsed.origin !== 'https://eventlens.internal' ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  const rawPathname = trimmed.split(/[?#]/, 1)[0] ?? '';
  if (rawPathname.includes('//') || rawPathname.includes('/.') || rawPathname.includes('..')) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  const normalizedPathname =
    parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
      ? parsed.pathname.replace(/\/+$/, '')
      : parsed.pathname;

  if (
    normalizedPathname.startsWith('/api') ||
    normalizedPathname === '/g' ||
    normalizedPathname.startsWith('/g/') ||
    normalizedPathname === '/admin' ||
    normalizedPathname.startsWith('/admin/') ||
    normalizedPathname === APPROVED_PUBLIC_ENTRY_PATHS.LOGIN ||
    normalizedPathname.startsWith(`${APPROVED_PUBLIC_ENTRY_PATHS.LOGIN}/`) ||
    normalizedPathname === APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS ||
    normalizedPathname.startsWith(`${APPROVED_PUBLIC_ENTRY_PATHS.BETA_ACCESS}/`) ||
    FORBIDDEN_FILE_EXTENSION_PATTERN.test(normalizedPathname)
  ) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  if (!ALLOWED_INTERNAL_RETURN_PATHS.has(normalizedPathname)) {
    return APPROVED_PUBLIC_ENTRY_PATHS.HOME;
  }

  return normalizedPathname;
}
