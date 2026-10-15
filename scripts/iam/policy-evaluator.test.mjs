import test from 'node:test';
import assert from 'node:assert/strict';
import { glob, intersects, decision, boundedDecision } from './policy-evaluator.mjs';
const policy = statements => ({ Version: '2012-10-17', Statement: statements });
const allow = policy([{ Effect: 'Allow', Action: 'ssm:GetParameter', Resource: '*' }]);

test('action matching is case insensitive while ARN matching preserves case', () => {
  assert.equal(glob('SSM:Get*', 'ssm:GetParameter', true), true);
  assert.equal(glob('arn:aws:ssm:*:parameter/Beta/*', 'arn:aws:ssm:x:parameter/beta/secret'), false);
});
test('ARN glob intersection handles resource suffixes and incompatible types', () => {
  assert.equal(intersects('arn:aws:logs:*:log-group:*:log-stream:*', 'arn:aws:logs:us-east-1:log-group:/phoeve/beta/application:*'), true);
  assert.equal(intersects('arn:aws:iam::*:role/*', 'arn:aws:iam::123:policy/instance'), false);
  assert.equal(intersects('*a', '*b'), false);
  assert.equal(intersects('a*', '*a'), true);
});
test('explicit deny overrides allow and boundary never grants on its own', () => {
  const deny = policy([{ Effect: 'Deny', Action: 'ssm:GetParameter', Resource: '*' }]);
  assert.equal(decision([allow, deny], 'ssm:GetParameter', 'parameter'), 'explicitDeny');
  assert.equal(boundedDecision([], allow, 'ssm:GetParameter', 'parameter', {}), 'denied');
});
test('ForAllValues vacuous truth is blocked by Null false, including empty sets', () => {
  const doc = policy([{ Effect: 'Allow', Action: 'route53:ChangeResourceRecordSets', Resource: '*', Condition: { 'ForAllValues:StringEquals': { names: ['beta.phoeve.com'] }, Null: { names: 'false' } } }]);
  for (const values of [{}, { names: [] }, { names: ['beta.phoeve.com', 'phoeve.com'] }]) assert.equal(decision([doc], 'route53:ChangeResourceRecordSets', 'zone', values), 'implicitDeny');
  assert.equal(decision([doc], 'route53:ChangeResourceRecordSets', 'zone', { names: ['beta.phoeve.com'] }), 'allowed');
});
test('NotResource and negated conditions deny out-of-scope and missing values', () => {
  const statements = [
    { Effect: 'Deny', Action: 'iam:CreateRole', NotResource: 'role/instance' },
    { Effect: 'Deny', Action: 'iam:CreateRole', Resource: '*', Condition: { StringNotEquals: { boundary: 'fixed' } } },
  ];
  const doc = policy([{ Effect: 'Allow', Action: 'iam:CreateRole', Resource: '*' }, ...statements]);
  assert.equal(decision([doc], 'iam:CreateRole', 'role/instance', { boundary: 'fixed' }), 'allowed');
  assert.equal(decision([doc], 'iam:CreateRole', 'role/admin', { boundary: 'fixed' }), 'explicitDeny');
  assert.equal(decision([doc], 'iam:CreateRole', 'role/instance', {}), 'explicitDeny');
});
test('ForAnyValue negation rejects mixed sets; unknown semantics fail closed', () => {
  const deny = policy([{ Effect: 'Deny', Action: 'test:Write', Resource: '*', Condition: { 'ForAnyValue:StringNotEquals': { names: ['beta'] } } }]);
  assert.equal(decision([deny], 'test:Write', 'x', { names: ['beta', 'apex'] }), 'explicitDeny');
  assert.throws(() => decision([policy([{ Effect: 'Allow', Action: '*', Resource: '*', Condition: { Unsupported: { x: 'y' } } }])], 'test:Write', 'x', { x: 'y' }), /Unsupported/);
});
test('immutable tag names match case variants using the supported IAM operator', () => {
  const doc = policy([{ Effect: 'Allow', Action: 'ec2:CreateTags', Resource: '*' }, { Effect: 'Deny', Action: 'ec2:CreateTags', Resource: '*', Condition: { 'ForAnyValue:StringEqualsIgnoreCase': { 'aws:TagKeys': ['DataRole'] } } }]);
  assert.equal(decision([doc], 'ec2:CreateTags', 'volume', { 'aws:TagKeys': ['dAtArOlE'] }), 'explicitDeny');
  assert.equal(decision([doc], 'ec2:CreateTags', 'volume', { 'aws:TagKeys': ['Name'] }), 'allowed');
});
