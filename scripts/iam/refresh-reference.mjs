// Public documentation downloads only. No AWS SDK/account APIs or credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const actions = new Set(['iam:PutRolePolicy', 'iam:DeleteRolePolicy']);
for (const name of ['control', 'workload', 'dlm']) {
  const doc = JSON.parse(await readFile(new URL(`../../infra/terraform/environments/bootstrap/tests/fixtures/${name}-boundary.json`, import.meta.url), 'utf8'));
  for (const statement of doc.Statement) for (const action of [statement.Action].flat()) if (!action.includes('*')) actions.add(action);
}
const services = {};
const scope = {
  iam: ['role', 'instance-profile', 'policy'],
  ec2: ['vpc', 'subnet', 'internet-gateway', 'route-table', 'security-group', 'security-group-rule', 'instance', 'volume', 'elastic-ip', 'network-interface', 'snapshot', 'image'],
  ssm: ['parameter', 'document', 'managed-instance'], route53: ['hostedzone', 'change'],
  logs: ['log-group', 'log-stream'], cloudwatch: ['alarm'], sns: ['topic'],
  budgets: ['budget'], dlm: ['policy'], kms: ['key'],
};
await Promise.all([...new Set([...actions].map(a => a.split(':')[0]))].map(async service => {
  const source = `https://servicereference.us-east-1.amazonaws.com/v1/${service}/${service}.json`;
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`PUBLIC_REFERENCE_${service}_${response.status}`);
  const raw = await response.text();
  const catalog = JSON.parse(raw);
  const selected = catalog.Actions.filter(a => actions.has(`${service}:${a.Name}`));
  const selectedResources = selected.map(a => ({ Name: a.Name, ActionConditionKeys: a.ActionConditionKeys, Resources: a.Resources?.filter(r => (scope[service] || []).includes(r.Name)) }));
  const types = new Set(selectedResources.flatMap(a => (a.Resources || []).map(r => r.Name)));
  services[service] = { source, version: catalog.Version,
    sourceSha256: createHash('sha256').update(raw).digest('hex'),
    resourceScope: 'Only resource types used by the reviewed policies; source contains the complete reference.',
    actions: selectedResources,
    resources: (catalog.Resources || []).filter(r => types.has(r.Name)) };
}));
await writeFile(new URL('../../docs/evidence/iam-authorization-reference.json', import.meta.url), JSON.stringify({ retrievedAt: new Date().toISOString(), services }, null, 2) + '\n');
console.log('PUBLIC_AWS_SAR_SNAPSHOT_WRITTEN');
