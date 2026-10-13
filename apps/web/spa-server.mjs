import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
});

export function normalizeSpaBaseHref(baseHref = '/') {
  const trimmed = (baseHref || '/').trim();
  if (!trimmed.startsWith('/') || trimmed.includes('?') || trimmed.includes('#') || trimmed.includes('//')) {
    throw new Error('INVALID_BASE_HREF');
  }
  if (trimmed === '/') {
    return '/';
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function redactSpaLogLine(input) {
  if (typeof input !== 'string' || input.length === 0) {
    return '';
  }
  return input
    .replace(/(\/g\/)[A-Za-z0-9_-]{1,128}/g, '$1[redacted]')
    .replace(/(\/api\/v1\/public\/guest-entry\/)[A-Za-z0-9_-]{1,128}/g, '$1[redacted]')
    .replace(/(el_guest_session=)[^;\s&"']+/gi, '$1[redacted]')
    .replace(/(el_organizer_session=)[^;\s&"']+/gi, '$1[redacted]');
}

export function classifySpaRequestPath(rawUrlOrPath, baseHref = '/') {
  const normalizedBase = normalizeSpaBaseHref(baseHref);
  let pathname = '/';
  try {
    const parsed = new URL(
      rawUrlOrPath && rawUrlOrPath.startsWith('/') ? rawUrlOrPath : `/${rawUrlOrPath ?? ''}`,
      'https://eventlens.internal'
    );
    pathname = parsed.pathname || '/';
  } catch {
    return { action: 'NOT_FOUND_404', relativePath: '/', redactedPath: '/' };
  }

  const redactedPath = redactSpaLogLine(pathname);

  let stripped = pathname;
  if (normalizedBase !== '/') {
    const baseWithoutTrailing = normalizedBase.slice(0, -1);
    if (pathname === baseWithoutTrailing) {
      stripped = '/';
    } else if (pathname.startsWith(normalizedBase)) {
      stripped = `/${pathname.slice(normalizedBase.length)}`;
    } else {
      return { action: 'NOT_FOUND_404', relativePath: pathname, redactedPath };
    }
  }

  if (
    stripped === '/api' ||
    stripped.startsWith('/api/') ||
    stripped === '/media' ||
    stripped.startsWith('/media/')
  ) {
    return { action: 'REJECT_API_OR_MEDIA_404', relativePath: stripped, redactedPath };
  }

  if (stripped === '/assets' || stripped.startsWith('/assets/')) {
    return { action: 'STATIC_FILE_ONLY', relativePath: stripped, redactedPath };
  }

  const lastSegment = stripped.split('/').filter(Boolean).pop() ?? '';
  if (lastSegment.includes('.')) {
    return { action: 'STATIC_FILE_ONLY', relativePath: stripped, redactedPath };
  }

  return { action: 'SERVE_SPA_INDEX', relativePath: stripped, redactedPath };
}

export function createSpaStaticServer(options = {}) {
  const defaultDistDir = resolve(
    fileURLToPath(new URL('.', import.meta.url)),
    'dist/web/browser'
  );
  const distDir = resolve(options.distDir || defaultDistDir);
  const baseHref = normalizeSpaBaseHref(options.baseHref || process.env.PUBLIC_BASE_HREF || '/');
  const onLog = typeof options.onLog === 'function' ? options.onLog : null;

  const server = createServer(async (req, res) => {
    const method = req.method || 'GET';
    const rawUrl = req.url || '/';
    const classification = classifySpaRequestPath(rawUrl, baseHref);

    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const logVisit = (statusCode) => {
      const safeLine = redactSpaLogLine(`${method} ${classification.redactedPath} ${statusCode}`);
      if (onLog) {
        onLog(safeLine);
      }
    };

    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 'METHOD_NOT_ALLOWED' }));
      logVisit(405);
      return;
    }

    if (classification.action === 'REJECT_API_OR_MEDIA_404') {
      res.writeHead(404, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(
        JSON.stringify({
          code: 'NOT_FOUND',
          message: 'API or media resource not found on static SPA server.'
        })
      );
      logVisit(404);
      return;
    }

    if (classification.action === 'NOT_FOUND_404') {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end('Not Found');
      logVisit(404);
      return;
    }

    if (classification.action === 'STATIC_FILE_ONLY') {
      const safeRel = normalize(classification.relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const candidatePath = resolve(join(distDir, safeRel));
      if (!candidatePath.startsWith(distDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        logVisit(403);
        return;
      }

      try {
        const fileStat = await stat(candidatePath);
        if (!fileStat.isFile()) {
          throw new Error('NOT_A_FILE');
        }
        const content = await readFile(candidatePath);
        const ext = extname(candidatePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(method === 'HEAD' ? undefined : content);
        logVisit(200);
        return;
      } catch {
        res.writeHead(404, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end('Asset Not Found');
        logVisit(404);
        return;
      }
    }

    // SERVE_SPA_INDEX
    try {
      const indexPath = join(distDir, 'index.html');
      let html = await readFile(indexPath, 'utf8');
      if (baseHref !== '/') {
        html = html.replace(/<base\s+href="[^"]*"\s*\/?>/i, `<base href="${baseHref}">`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache'
      });
      res.end(method === 'HEAD' ? undefined : html);
      logVisit(200);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('SPA index.html unavailable');
      logVisit(500);
    }
  });

  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.SPA_PORT || process.env.PORT || '4201', 10);
  const host = process.env.SPA_HOST || '127.0.0.1';
  const defaultDist = resolve(join(fileURLToPath(new URL('.', import.meta.url)), 'dist/web/browser'));
  const distDir = resolve(process.env.SPA_DIST_DIR || defaultDist);
  const server = createSpaStaticServer({ distDir, baseHref: '/' });
  server.listen(port, host, () => {
    console.log(`EventLens SPA Server listening at http://${host}:${port}`);
  });
}
