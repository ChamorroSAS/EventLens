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
