// Read-only Terraform plan tests with mock AWS. No account calls or apply.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../infra/terraform/environments/beta', import.meta.url));
const child = spawn(process.argv[2] || 'terraform', [`-chdir=${root}`, 'test', '-json', '-verbose', `-filter=${join('tests', 'boundaries.tftest.hcl')}`], { stdio: ['ignore', 'pipe', 'pipe'] });
const exit = new Promise((done, fail) => { child.once('error', fail); child.once('close', done); });
child.stderr.resume();
let summary, changes;
const errors = [];
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  if (event.type === 'test_summary') summary = event.test_summary;
  if (event.type === 'test_plan' && event['@testrun'] === 'bounded_runtime_and_pinned_image') changes = event.test_plan.resource_changes;
  if (event.type === 'diagnostic' && event.diagnostic?.severity === 'error') errors.push(event.diagnostic.summary);
}
assert.equal(await exit, 0, errors.join('; '));
assert.equal(summary?.passed, 4);
assert.equal(summary?.errored, 0);
const after = address => {
  const resource = changes.find(r => r.address === address);
  assert.ok(resource, `Missing ${address}`);
  return resource.change.after;
};
assert.equal(after('module.compute.aws_iam_role.instance').permissions_boundary, 'arn:aws:iam::123456789012:policy/phoeve-beta-workload-boundary');
assert.equal(after('module.compute.aws_iam_instance_profile.instance').name, 'phoeve-beta-instance');
const instance = after('module.compute.aws_instance.beta');
assert.equal(instance.ami, 'ami-0123456789abcdef0');
assert.equal(instance.metadata_options[0].http_tokens, 'required');
assert.equal(instance.metadata_options[0].http_put_response_hop_limit, 1);
assert.equal(instance.volume_tags.Project, 'phoeve');
assert.equal(instance.volume_tags.Environment, 'beta');
assert.equal(instance.root_block_device[0].encrypted, true);
const ingress = changes.filter(r => r.address.startsWith('module.network.aws_vpc_security_group_ingress_rule.')).map(r => r.change.after);
assert.deepEqual(ingress.map(r => r.from_port).sort((a, b) => a - b), [80, 443]);
assert.ok(ingress.every(r => r.from_port === r.to_port && r.ip_protocol === 'tcp' && r.cidr_ipv4 === '0.0.0.0/0'));
assert.ok(!changes.some(r => r.type === 'aws_ssm_parameter'), 'Pinned-image deployment must not need a new public SSM discovery permission');
assert.ok(!changes.some(r => r.address.startsWith('module.snapshot_policy.aws_iam_role.dlm')), 'Snapshot capabilities remain gated off by default');
console.log(JSON.stringify({ status: 'PASS_MOCK_PLAN_ONLY', tests: summary, runtimeBoundary: 'VERIFIED', pinnedAmi: 'VERIFIED', encryptedTaggedRoot: 'VERIFIED', publicPorts: [80, 443], awsCalls: 'NOT_EXECUTED' }, null, 2));
