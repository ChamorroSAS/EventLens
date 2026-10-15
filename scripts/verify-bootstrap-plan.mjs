// Terraform 1.9.8 regression check. AWS is mocked by the .tftest.hcl file;
// every run uses command = plan. No backend, AWS calls, or apply operations.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(['--terraform', '--root'].includes(args[i]) && args[i + 1], 'Use --terraform PATH and/or --root PATH');
}
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const terraform = option('--terraform') || 'terraform';
const root = resolve(option('--root') || fileURLToPath(new URL('../infra/terraform/environments/bootstrap', import.meta.url)));
const child = spawn(terraform, [`-chdir=${root}`, 'test', '-json', '-verbose', `-filter=${join('tests', 'guard_rails.tftest.hcl')}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exit = new Promise((resolveExit, reject) => {
  child.once('error', reject);
  child.once('close', (code, signal) => resolveExit({ code, signal }));
});
let stderr = '';
child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
const plans = new Map();
let summary;
const diagnostics = [];
for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  if (event.type === 'test_plan') plans.set(event['@testrun'], event.test_plan.resource_changes);
  if (event.type === 'test_summary') summary = event.test_summary;
  if (event.type === 'diagnostic') diagnostics.push(event.diagnostic?.summary || event['@message']);
}
const result = await exit;
assert.equal(result.code, 0, `Terraform test failed: ${diagnostics.join('; ')} ${stderr}`);
assert.equal(summary?.passed, 11, 'All eleven plan-only tests must pass');
assert.equal(summary?.failed, 0);
assert.equal(summary?.errored, 0);
const prefix = 'module.identity.';
const planned = (changes, address) => {
  const resource = changes.find(r => r.address === prefix + address);
  assert.ok(resource, `Missing ${address}`);
  return resource.change;
};
const json = (changes, address, attribute) => {
  const change = planned(changes, address);
  assert.ok(!change.after_unknown[attribute] && typeof change.after[attribute] === 'string', `${address}.${attribute} is unknown during plan`);
  return JSON.parse(change.after[attribute]);
};
const bySid = (policy, sid) => {
  const statement = policy.Statement.find(s => s.Sid === sid);
  assert.ok(statement, `Missing statement ${sid}`);
  return statement;
};
const reviews = [];
for (const name of ['policies_and_existing_oidc_resolve_in_plan', 'new_oidc_providers']) {
  const changes = plans.get(name);
  assert.ok(changes, `Missing verbose plan for ${name}`);
  assert.ok(!changes.some(r => r.mode === 'data' && r.change.actions.includes('read')), 'Account/region reads must not be deferred to apply');
  const apply = json(changes, 'aws_iam_policy.hcp_apply[0]', 'policy');
  assert.equal(bySid(apply, 'ManageSsmParameters').Resource, 'arn:aws:ssm:us-east-1:123456789012:parameter/phoeve/beta*');
  assert.equal(bySid(apply, 'ManagePolicyObjects').Resource, 'arn:aws:iam::123456789012:policy/phoeve-beta-*');
  const pass = bySid(apply, 'PassInstanceRoleToEc2Only');
  assert.equal(pass.Resource, 'arn:aws:iam::123456789012:role/phoeve-beta-*');
  assert.equal(pass.Condition.StringEquals['iam:PassedToService'], 'ec2.amazonaws.com');
  const plan = json(changes, 'aws_iam_policy.hcp_plan', 'policy');
  assert.ok(plan.Statement.every(s => s.Effect === 'Allow' && s.Action.every(a => /:(Describe|Get|List|View)/.test(a))), 'Plan role must only retain discovery/read actions');
  const deploy = planned(changes, 'aws_iam_policy.github_deploy');
  assert.equal(deploy.after_unknown.policy, true, 'Only the existing, legitimate SSM document ARN dependency remains for the deploy policy');
  for (const role of ['github_deploy', 'hcp_plan[0]', 'hcp_apply[0]']) {
    assert.equal(planned(changes, `aws_iam_role.${role}`).after.permissions_boundary, 'arn:aws:iam::123456789012:policy/test-boundary');
  }
  if (name === 'policies_and_existing_oidc_resolve_in_plan') {
    for (const [role, issuer, audience, subject] of [
      ['github_deploy', 'token.actions.githubusercontent.com', 'sts.amazonaws.com', 'repo:test-owner/EventLens:environment:beta'],
      ['hcp_plan[0]', 'app.terraform.io', 'aws.workload.identity', 'organization:test-team:project:test-project:workspace:phoeve-beta:run_phase:plan'],
      ['hcp_apply[0]', 'app.terraform.io', 'aws.workload.identity', 'organization:test-team:project:test-project:workspace:phoeve-beta:run_phase:apply'],
    ]) {
      const trust = json(changes, `aws_iam_role.${role}`, 'assume_role_policy').Statement;
      assert.equal(trust.length, 1);
      assert.equal(trust[0].Effect, 'Allow');
      assert.equal(trust[0].Action, 'sts:AssumeRoleWithWebIdentity');
      assert.equal(trust[0].Principal.Federated, `arn:aws:iam::123456789012:oidc-provider/${issuer}`);
      assert.equal(trust[0].Condition.StringEquals[`${issuer}:aud`], audience);
      assert.equal(trust[0].Condition.StringLike[`${issuer}:sub`], subject);
      assert.ok(!/[*?]/.test(subject), 'Fixture trusts must have no subject wildcard');
    }
  } else {
    assert.equal(changes.filter(r => r.mode === 'managed' && r.change.actions.includes('create')).length, 13);
    for (const [resource, url, audience] of [
      ['github', 'https://token.actions.githubusercontent.com', 'sts.amazonaws.com'],
      ['hcp', 'https://app.terraform.io', 'aws.workload.identity'],
    ]) {
      const provider = planned(changes, `aws_iam_openid_connect_provider.${resource}[0]`).after;
      assert.equal(provider.url, url);
      assert.deepEqual(provider.client_id_list, [audience]);
    }
  }
  reviews.push({ run: name, hcpApplyPolicyKnown: true, hcpPlanPolicyKnown: true,
    account: '123456789012 (mock)', region: 'us-east-1', deployPolicy: 'UNKNOWN_UNTIL_SSM_DOCUMENT_ARN',
    trusts: name === 'new_oidc_providers' ? 'NEW_PROVIDER_ARNS_UNKNOWN' : 'EXACT_FIXTURE_TRUSTS_VERIFIED' });
}
console.log(JSON.stringify({ status: 'PASS_MOCK_PLAN_ONLY', tests: summary, reviews,
  realAwsPlan: 'NOT_EXECUTED', apply: 'NOT_EXECUTED' }, null, 2));
