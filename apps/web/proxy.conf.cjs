// Compose sets http://api:3000; direct desktop development uses localhost.
const target = process.env.API_PROXY_TARGET || 'http://localhost:3000';
const url = new URL(target);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
  throw new Error('API_PROXY_TARGET must be an HTTP origin without credentials.');
}

function redactProxyUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return '';
  return rawUrl
    .replace(/(\/g\/)[A-Za-z0-9_-]{1,128}/g, '$1[redacted]')
    .replace(/(\/api\/v1\/public\/guest-entry\/)[A-Za-z0-9_-]{1,128}/g, '$1[redacted]');
}

module.exports = {
  '/storage/**': {
    target: process.env.STORAGE_PROXY_TARGET || 'http://127.0.0.1:19000',
    changeOrigin: true,
    pathRewrite: { '^/storage': '' },
    // This development gateway accepts signed multipart POST only. No object reads/listing.
    bypass(req) {
      const bucket = process.env.MINIO_BUCKET || 'eventlens';
      if (req.method !== 'POST' || ![ `/storage/${bucket}`, `/storage/${bucket}/` ].includes(req.url)) {
        return false;
      }
    }
  },
  '/api/**': {
    target: url.origin,
    changeOrigin: false
  },
  '/media/**': {
    target: url.origin,
    changeOrigin: false
  },
  redactProxyUrl
};
