import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { S3Client, HeadBucketCommand, CreateBucketCommand, GetBucketPolicyCommand,
  GetBucketVersioningCommand, PutBucketVersioningCommand } = require('@aws-sdk/client-s3');

/** Local development bootstrap only. No AWS endpoints and no public bucket policy. */
export async function initializeLocalMedia(config) {
  const url = new URL(config.endpoint);
  if (!['minio', 'test-minio', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol)) throw new Error('LOCAL_MEDIA_ENDPOINT_REQUIRED');
  const client = new S3Client({ region: 'us-east-1', endpoint: url.origin, forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  try {
    try { await client.send(new HeadBucketCommand({ Bucket: config.bucket })); }
    catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
    }
    // An unexpected policy is not silently replaced. Empty private bucket is the baseline.
    try {
      const existing = await client.send(new GetBucketPolicyCommand({ Bucket: config.bucket }));
      if (existing.Policy) throw new Error('LOCAL_MEDIA_BUCKET_POLICY_REQUIRES_REVIEW');
    } catch (error) {
      if (!['NoSuchBucketPolicy', 'NoSuchPolicy'].includes(error.name) && error.$metadata?.httpStatusCode !== 404) throw error;
    }
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }));
    if (versioning.Status !== 'Enabled') await client.send(new PutBucketVersioningCommand({ Bucket: config.bucket,
      VersioningConfiguration: { Status: 'Enabled' } }));
    const verified = await client.send(new GetBucketVersioningCommand({ Bucket: config.bucket }));
    if (verified.Status !== 'Enabled') throw new Error('LOCAL_MEDIA_VERSIONING_REQUIRED');
  } finally { client.destroy(); }
}

if (process.argv[1]?.endsWith('local-media.mjs')) {
  const { readConfig } = await import('../apps/api/dist/platform/config/config.js');
  try {
    const config = readConfig(process.env);
    if (config.localMedia) await initializeLocalMedia(config.localMedia);
    console.log(config.localMedia ? 'LOCAL_MEDIA_PRIVATE_VERSIONED_READY' : 'LOCAL_MEDIA_DISABLED');
  } catch { console.error('LOCAL_MEDIA_INITIALIZATION_FAILED'); process.exitCode = 1; }
}
