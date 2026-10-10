// Compose sets http://api:3000; direct desktop development uses localhost.
const target = process.env.API_PROXY_TARGET || 'http://localhost:3000';
const url = new URL(target);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
  throw new Error('API_PROXY_TARGET must be an HTTP origin without credentials.');
}
module.exports = { '/api/**': { target: url.origin, changeOrigin: false } };
