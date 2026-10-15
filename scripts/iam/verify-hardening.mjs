import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { glob, list, boundedDecision, intersects } from './policy-evaluator.mjs';

const load = name => JSON.parse(readFileSync(new URL(`../../infra/terraform/environments/bootstrap/tests/fixtures/${name}-boundary.json`, import.meta.url), 'utf8'));
export function verifyHardening(policies) {
  const boundary = load('control');
  const runtime = load('workload');
  const id = '123456789012';
  const iam = `arn:aws:iam::${id}`;
  const ec2 = `arn:aws:ec2:us-east-1:${id}`;
  const role = `${iam}:role/phoeve-beta-instance`;
  const profile = `${iam}:instance-profile/phoeve-beta-instance`;
  const runtimePolicy = `${iam}:policy/phoeve-beta-instance-runtime`;
  const workloadBoundary = `${iam}:policy/phoeve-beta-workload-boundary`;
  const parameter = `arn:aws:ssm:us-east-1:${id}:parameter/phoeve/beta`;
  const own = { 'aws:ResourceTag/Project': 'phoeve', 'aws:ResourceTag/Environment': 'beta', 'ec2:Region': 'us-east-1' };
  const requested = { 'aws:RequestTag/Project': 'phoeve', 'aws:RequestTag/Environment': 'beta', 'ec2:Region': 'us-east-1' };
  let positive = 0, negative = 0;
  const check = (action, resource, context, expected = true) => {
    assert.equal(boundedDecision(policies, boundary, action, resource, context), expected ? 'allowed' : 'denied', `${action} ${resource} ${JSON.stringify(context)}`);
    expected ? positive++ : negative++;
  };
  check('iam:CreateRole', role, { ...requested, 'iam:PermissionsBoundary': workloadBoundary });
  for (const bad of [undefined, `${iam}:policy/AdministratorAccess`, `${iam}:policy/phoeve-beta-control-boundary`]) {
    check('iam:CreateRole', role, { ...requested, 'iam:PermissionsBoundary': bad }, false);
  }
  check('iam:CreateRole', role, { 'iam:PermissionsBoundary': workloadBoundary }, false);
  for (const other of ['other-instance', 'phoeve-beta-terraform-apply', 'phoeve-beta-github-deploy', 'phoeve-beta-instance-extra']) {
    for (const action of ['iam:CreateRole', 'iam:DeleteRole', 'iam:UpdateAssumeRolePolicy']) check(action, `${iam}:role/${other}`, { ...requested, 'iam:PermissionsBoundary': workloadBoundary }, false);
  }
  for (const action of ['iam:DeleteRole', 'iam:GetRole', 'iam:UpdateAssumeRolePolicy']) check(action, role, {});
  check('iam:AttachRolePolicy', role, { 'iam:PolicyARN': runtimePolicy });
  check('iam:DetachRolePolicy', role, { 'iam:PolicyARN': 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore' });
  check('iam:AttachRolePolicy', role, { 'iam:PolicyARN': 'arn:aws:iam::aws:policy/AdministratorAccess' }, false);
  for (const action of ['iam:PutRolePolicy', 'iam:DeleteRolePolicy', 'iam:PutRolePermissionsBoundary', 'iam:DeleteRolePermissionsBoundary']) check(action, role, {}, false);
  for (const action of ['iam:CreatePolicyVersion', 'iam:DeletePolicy', 'iam:SetDefaultPolicyVersion']) {
    check(action, runtimePolicy, {});
    for (const protectedPolicy of ['control', 'workload', 'dlm']) check(action, `${iam}:policy/phoeve-beta-${protectedPolicy}-boundary`, {}, false);
  }
  for (const action of ['iam:CreateInstanceProfile', 'iam:AddRoleToInstanceProfile', 'iam:RemoveRoleFromInstanceProfile']) {
    check(action, profile, {}); check(action, `${profile}-extra`, {}, false);
  }
  check('iam:PassRole', role, { 'iam:PassedToService': 'ec2.amazonaws.com' });
  check('iam:PassRole', role, { 'iam:PassedToService': 'lambda.amazonaws.com' }, false);
  check('iam:PassRole', `${iam}:role/phoeve-beta-dlm`, { 'iam:PassedToService': 'dlm.amazonaws.com' }, false);
  const dns = { 'route53:ChangeResourceRecordSetsNormalizedRecordNames': ['beta.phoeve.com'], 'route53:ChangeResourceRecordSetsRecordTypes': ['A'], 'route53:ChangeResourceRecordSetsActions': ['UPSERT'] };
  check('route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZTESTBETA', dns);
  check('route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZOTHER', dns, false);
  for (const names of [['phoeve.com'], ['beta.phoeve.com', 'admin.phoeve.com']]) check('route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZTESTBETA', { ...dns, 'route53:ChangeResourceRecordSetsNormalizedRecordNames': names }, false);
  check('route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZTESTBETA', { ...dns, 'route53:ChangeResourceRecordSetsRecordTypes': ['NS'] }, false);
  check('route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZTESTBETA', {}, false);
  for (const action of ['ssm:PutParameter', 'ssm:DeleteParameter', 'ssm:AddTagsToResource']) {
    for (const suffix of ['', '/database/url']) check(action, parameter + suffix, {});
    for (const suffix of ['-evil/password', '2/password']) check(action, parameter + suffix, {}, false);
  }
  for (const [action, type] of [['ec2:DeleteVpc', 'vpc'], ['ec2:AttachVolume', 'volume'], ['ec2:AttachVolume', 'instance'], ['ec2:AuthorizeSecurityGroupIngress', 'security-group'], ['ec2:TerminateInstances', 'instance']]) {
    check(action, `${ec2}:${type}/test`, own);
    check(action, `${ec2}:${type}/test`, {}, false);
    check(action, `${ec2}:${type}/test`, { ...own, 'aws:ResourceTag/Environment': 'production' }, false);
    check(action, `${ec2}:${type}/test`, { ...own, 'ec2:Region': 'us-west-2' }, false);
  }
  for (const [action, type] of [['ec2:CreateVpc', 'vpc'], ['ec2:CreateSubnet', 'subnet'], ['ec2:CreateVolume', 'volume'], ['ec2:AllocateAddress', 'elastic-ip']]) {
    check(action, `${ec2}:${type}/new`, action === 'ec2:CreateVolume' ? { ...requested, 'ec2:VolumeType': 'gp3', 'ec2:Encrypted': 'true' } : requested);
    check(action, `${ec2}:${type}/new`, {}, false);
  }
  check('ec2:CreateVolume', `${ec2}:volume/new`, { ...requested, 'ec2:VolumeType': 'gp3', 'ec2:Encrypted': 'false' }, false);
  check('ec2:CreateVolume', `${ec2}:volume/new`, { ...requested, 'ec2:VolumeType': 'io2', 'ec2:Encrypted': 'true' }, false);
  check('ec2:CreateSubnet', `${ec2}:vpc/existing`, own);
  check('ec2:CreateSubnet', `${ec2}:vpc/existing`, requested, false);
  const launch = { ...requested, 'ec2:InstanceType': 't4g.medium', 'ec2:MetadataHttpTokens': 'required', 'ec2:InstanceProfile': profile };
  check('ec2:RunInstances', `${ec2}:instance/new`, launch);
  for (const changes of [{ 'ec2:InstanceType': 'p5.48xlarge' }, { 'ec2:MetadataHttpTokens': 'optional' }, { 'ec2:InstanceProfile': `${profile}-other` }]) check('ec2:RunInstances', `${ec2}:instance/new`, { ...launch, ...changes }, false);
  check('ec2:RunInstances', 'arn:aws:ec2:us-east-1::image/ami-0123456789abcdef0', { 'ec2:Region': 'us-east-1' });
  check('ec2:RunInstances', 'arn:aws:ec2:us-east-1::image/ami-11111111111111111', { 'ec2:Region': 'us-east-1' }, false);
  check('ec2:RunInstances', `${ec2}:volume/new`, { ...requested, 'ec2:VolumeType': 'gp3', 'ec2:Encrypted': 'true' });
  check('ec2:RunInstances', `${ec2}:volume/new`, { ...requested, 'ec2:VolumeType': 'gp3', 'ec2:Encrypted': 'false' }, false);
  check('ec2:CreateTags', `${ec2}:vpc/new`, { ...requested, 'ec2:CreateAction': 'CreateVpc', 'aws:TagKeys': ['Project', 'Environment'] });
  check('ec2:CreateTags', `${ec2}:vpc/owned`, { ...own, 'aws:TagKeys': ['Name'], 'aws:RequestTag/Name': 'renamed' });
  for (const action of ['ec2:CreateTags', 'ec2:DeleteTags']) check(action, `${ec2}:vpc/owned`, { ...own, ...requested, 'aws:TagKeys': ['Environment'] }, false);
  const operational = { ...own, 'aws:ResourceTag/SnapshotPolicy': 'daily', 'aws:ResourceTag/DataRole': 'database' };
  check('ec2:CreateSnapshot', `${ec2}:volume/operational`, operational, false);
  check('ec2:CreateSnapshot', `${ec2}:volume/authority`, { ...operational, 'aws:ResourceTag/DataRole': 'recovery-authority' }, false);
  check('ec2:CreateTags', `${ec2}:volume/authority`, { ...own, 'aws:TagKeys': ['DataRole'], 'aws:RequestTag/DataRole': 'database' }, false);
  for (const alias of ['project', 'ENVIRONMENT', 'dAtArOlE']) check('ec2:CreateTags', `${ec2}:volume/owned`, { ...own, 'aws:TagKeys': [alias] }, false);
  // Boundaries cap hostile inline content even if an independent identity
  // policy were to grant it. This is NOT an allow in the deployed role.
  const hostile = [{ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: '*', Resource: '*' }] }];
  for (const [action, resource] of [['iam:CreateRole', role], ['s3:GetObject', 'arn:aws:s3:::unrelated/private'], ['ssm:GetParameter', parameter + '-evil/key']]) {
    assert.equal(boundedDecision(hostile, runtime, action, resource, {}), 'denied'); negative++;
  }
  assert.equal(boundedDecision(hostile, runtime, 'ssm:GetParameter', parameter + '/config', {}), 'allowed'); positive++;
  const dlm = load('dlm');
  assert.equal(boundedDecision(hostile, dlm, 'ec2:CreateSnapshot', `${ec2}:volume/operational`, operational), 'allowed'); positive++;
  assert.equal(boundedDecision(hostile, dlm, 'ec2:CreateSnapshot', `${ec2}:volume/authority`, { ...operational, 'aws:ResourceTag/DataRole': 'recovery-authority' }), 'denied'); negative++;
  for (const [action, resource, context] of [
    ['iam:CreateRole', role, {}],
    ['iam:CreateRole', `${iam}:role/unrelated`, { 'iam:PermissionsBoundary': workloadBoundary }],
    ['iam:CreatePolicyVersion', `${iam}:policy/phoeve-beta-control-boundary`, {}],
    ['iam:PassRole', role, { 'iam:PassedToService': 'lambda.amazonaws.com' }],
    ['ssm:PutParameter', parameter + '-evil/key', {}],
    ['ssm:GetParameter', parameter + '-evil/key', {}],
    ['route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZOTHER', dns],
    ['route53:ChangeResourceRecordSets', 'arn:aws:route53:::hostedzone/ZTESTBETA', { ...dns, 'route53:ChangeResourceRecordSetsNormalizedRecordNames': ['phoeve.com'] }],
  ]) {
    assert.equal(boundedDecision(hostile, boundary, action, resource, context), 'denied'); negative++;
  }
  const baseline = JSON.parse(readFileSync(new URL('../../infra/terraform/environments/bootstrap/tests/fixtures/baseline-apply-actions.json', import.meta.url), 'utf8'));
  for (const statement of policies.flatMap(p => p.Statement).filter(s => s.Effect === 'Allow')) for (const action of list(statement.Action)) assert.ok(baseline.actions.includes(action), `Hardening must not add allow actions: ${action}`);
  for (const statement of policies.flatMap(p => p.Statement)) {
    if (statement.Effect !== 'Allow') continue;
    for (const action of list(statement.Action)) {
      if (action.startsWith('iam:')) assert.ok(list(statement.Resource).every(r => r !== '*' && !r.endsWith('phoeve-beta-*')), 'IAM management must use exact workload ARNs');
      if (action.startsWith('ec2:')) assert.ok(statement.Condition && list(statement.Resource).every(r => r !== '*'), 'EC2 mutation must be scoped');
    }
  }
  return { model: 'BOUNDED_OFFLINE_NOT_AWS_SIMULATOR', positive, negative };
}

export function verifyReference(policies) {
  const catalog = JSON.parse(readFileSync(new URL('../../docs/evidence/iam-authorization-reference.json', import.meta.url), 'utf8'));
  let checked = 0;
  for (const statement of policies.flatMap(p => p.Statement)) for (const action of list(statement.Action)) {
    if (/[*?]/.test(action)) continue;
    const [service, name] = action.split(':');
    const source = catalog.services[service];
    const record = source?.actions.find(a => a.Name === name);
    assert.ok(record, `No authoritative SAR record for ${action}`);
    for (const resource of statement.NotResource ? ['*'] : list(statement.Resource)) {
      const candidates = resource === '*' ? (record.Resources || []).map(r => r.Name) : (record.Resources || []).filter(r => source.resources.find(t => t.Name === r.Name)?.ARNFormats.some(format => intersects(format.replace(/\$\{[^}]+\}/g, '*'), resource))).map(r => r.Name);
      assert.ok(resource === '*' || candidates.length, `${action} cannot be scoped to ${resource}`);
      const supported = [...(record.ActionConditionKeys || []), ...(record.Resources || []).filter(r => candidates.includes(r.Name)).flatMap(r => r.ConditionKeys || []), ...source.resources.filter(r => candidates.includes(r.Name)).flatMap(r => r.ConditionKeys || [])];
      for (const entries of Object.values(statement.Condition || {})) for (const key of Object.keys(entries)) {
        assert.ok(['aws:RequestedRegion', 'aws:ResourceAccount'].includes(key) || supported.some(k => glob(k.replace(/\$\{[^}]+\}/g, '*'), key)), `Unsupported SAR condition ${action} ${resource}: ${key}`);
      }
      checked++;
    }
  }
  return { source: 'PUBLIC_AWS_SERVICE_REFERENCE', checkedActionResourcePairs: checked };
}
