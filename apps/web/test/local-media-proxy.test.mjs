import { test } from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../proxy.conf.cjs';

test('local storage proxy exposes only the exact signed POST target', () => {
  const storage = proxy['/storage/**'];
  const bucket = process.env.MINIO_BUCKET || 'eventlens';
  assert.equal(storage.bypass({ method: 'POST', url: `/storage/${bucket}` }), undefined);
  for (const request of [ { method: 'GET', url: `/storage/${bucket}` },
    { method: 'HEAD', url: `/storage/${bucket}` }, { method: 'DELETE', url: `/storage/${bucket}` },
    { method: 'POST', url: '/storage/other' }, { method: 'POST', url: `/storage/${bucket}?list-type=2` },
    { method: 'POST', url: `/storage/${bucket}/original` } ]) {
    assert.equal(storage.bypass(request), false);
  }
  assert.equal(storage.pathRewrite['^/storage'], '');
});
