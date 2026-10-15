import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { initializeLocalMedia } from './local-media.mjs';

// Container-only: disposable MinIO, Angular's actual proxy and a different Host header.
// No requests or writes to the development application database.
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const bucket = `eventlens-test-${randomUUID()}`;
const config = { endpoint: 'http://test-minio:9000', bucket,
  accessKeyId: 'isolated-media', secretAccessKey: 'isolated-media-test-only' };
const port = 4215;
let child;
const client = new S3Client({ region: 'us-east-1', endpoint: config.endpoint, forcePathStyle: true,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
try {
  await initializeLocalMedia(config);
  child = spawn('pnpm', ['--filter', '@eventlens/web', 'start', '--port', String(port)], {
    detached: true, stdio: 'pipe', env: { ...process.env, NG_CLI_ANALYTICS: 'false',
      STORAGE_PROXY_TARGET: config.endpoint, MINIO_BUCKET: bucket } });
  child.stdout.on('data', () => {}); child.stderr.on('data', () => {});
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('ANGULAR_PROXY_START_FAILED');
    try { ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, 'Angular proxy must become ready');
  const bytes = Buffer.from('real signed POST through Angular proxy');
  const key = `staging/${randomUUID()}`;
  const signed = await createPresignedPost(client, { Bucket: bucket, Key: key, Expires: 60,
    Fields: { 'Content-Type': 'image/jpeg' },
    Conditions: [['content-length-range', bytes.length, bytes.length], ['eq', '$Content-Type', 'image/jpeg']] });
  const form = new FormData();
  for (const [name, value] of Object.entries(signed.fields)) form.append(name, value);
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'test.jpg');
  const response = await fetch(`${base}/storage/${bucket}`, {
    method: 'POST', body: form, headers: { Host: `192.0.2.10:${port}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(response.ok, true, `Signed POST proxy returned ${response.status}`);
  const stored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  assert.deepEqual(Buffer.from(await stored.Body.transformToByteArray()), bytes);
  assert.ok(stored.VersionId && stored.VersionId !== 'null');
  for (const path of [`/storage/${bucket}`, `/storage/${bucket}/${key}`, '/storage/other']) {
    assert.equal((await fetch(base + path)).status, 404, 'Storage reads/listing must be denied by proxy');
  }
  console.log('LOCAL_MEDIA_REAL_PROXY_PASS: byte-identical signed POST, alternate Host, versioning and denied reads');
} catch { console.error('LOCAL_MEDIA_REAL_PROXY_FAILED'); process.exitCode = 1; }
finally {
  client.destroy();
  if (child?.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
}
