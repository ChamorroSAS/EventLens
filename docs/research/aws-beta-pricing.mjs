// Read-only public pricing research. No AWS SDK, credentials, provisioning or account APIs.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const region = 'us-east-1';
const result = { retrievedAt: new Date().toISOString(), region, catalogs: [] };
for (const service of ['AmazonS3', 'AmazonDynamoDB']) {
  const source = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/${service}/current/${region}/index.json`;
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`PUBLIC_PRICING_HTTP_${response.status}`);
  const raw = await response.text();
  const catalog = JSON.parse(raw);
  const items = [];
  for (const [sku, product] of Object.entries(catalog.products)) {
    const a = product.attributes;
    const usage = a.usagetype || '';
    const selected = service === 'AmazonS3'
      ? /^(TimedStorage-ByteHrs|TimedStorage-SIA-ByteHrs|TimedStorage-GIR-ByteHrs|Requests-Tier[12]|Requests-(SIA|GIR)-Tier[12]|Retrieval-(SIA|GIR))$/.test(usage)
      : /^(WriteRequestUnits|ReadRequestUnits|TimedStorage-ByteHrs|USE1-TimedPITRStorage-ByteHrs)$/.test(usage);
    if (!selected) continue;
    for (const term of Object.values(catalog.terms.OnDemand[sku] || {})) {
      for (const [rateCode, d] of Object.entries(term.priceDimensions)) {
        items.push({ sku, rateCode, usage, storageClass: a.storageClass, group: a.group,
          begin: d.beginRange, end: d.endRange, unit: d.unit, usd: d.pricePerUnit.USD });
      }
    }
  }
  if (!items.length) throw new Error('PUBLIC_PRICING_SCHEMA_CHANGED');
  result.catalogs.push({ service, source, publicationDate: catalog.publicationDate,
    sourceSha256: createHash('sha256').update(raw).digest('hex'), items });
}
const source = 'https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/US%20East%20(N.%20Virginia)/Linux/index.json';
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`PUBLIC_EC2_PRICING_HTTP_${response.status}`);
const raw = await response.text();
const instances = [];
function scan(value) {
  if (!value || typeof value !== 'object') return;
  if (value['Instance Type'] === 't4g.medium' && value['Operating System'] === 'Linux') instances.push(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') scan(child);
}
scan(JSON.parse(raw));
if (!instances.length) throw new Error('PUBLIC_EC2_PRICING_SCHEMA_CHANGED');
result.catalogs.push({ service: 'AmazonEC2', source,
  sourceSha256: createHash('sha256').update(raw).digest('hex'), items: instances });
if (process.argv.includes('--write')) {
  const folder = new URL('../evidence/', import.meta.url);
  await mkdir(folder, { recursive: true });
  await writeFile(new URL('aws-beta-prices-us-east-1.json', folder), JSON.stringify(result, null, 2) + '\n');
  console.log('PUBLIC_AWS_PRICE_EVIDENCE_WRITTEN');
} else console.log(JSON.stringify(result, null, 2));
