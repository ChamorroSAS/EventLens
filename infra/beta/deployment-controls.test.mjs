#!/usr/bin/env node
/**
 * Deployment control tests: the invariants the AWS-facing pieces of the Beta
 * deployment rely on, checked without touching AWS.
 *
 * These exist because the controls they describe cannot be proven locally by
 * execution — they are proven by construction and by review:
 *
 *   1. the deploy role cannot run arbitrary commands: it may only invoke the
 *      restricted SSM document, and the document decides what runs;
 *   2. the published-surface probe has exactly one status table, owned by the
 *      bundle that ships inside the image;
 *   3. the deployment workflow sends no script of its own and runs in the
 *      protected environment;
 *   4. activation and rollback are gated on migration compatibility.
 *
 * Run with: node --test infra/beta/deployment-controls.test.mjs
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFile(join(here, relative), 'utf8');

/** Comments are prose: contract checks inspect configuration, not explanations. */
const stripComments = (text, pattern) =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(pattern, ''))
    .join('\n');
const hcl = (text) => stripComments(text, /(^|\s)#.*$/);
const bash = (text) => stripComments(text, /\s#.*$/);
const yaml = (text) => stripComments(text, /^\s*#.*$/);

/**
 * The digest shape, without the `^$|` alternative the parameters need so that
 * an unused image reference is legal on a non-deploy action. The shell check
 * must never accept the empty string, so only the core is compared.
 */
const digestCore = (pattern) => pattern.replace(/^\^\$\|/, '');

const document = JSON.parse(
  await read('../terraform/modules/identity/templates/deploy-command.json')
);
const identity = hcl(await read('../terraform/modules/identity/main.tf'));
const identityOutputs = await read('../terraform/modules/identity/outputs.tf');
const workflow = yaml(await read('../../.github/workflows/deploy-beta.yml'));
const script = bash(await read('deploy/phoeve-deploy'));
const dockerfile = await read('Dockerfile');
const databaseScript = await read('../../scripts/database.mjs');
const bootstrapVariables = await read('../terraform/environments/bootstrap/variables.tf');
const docs = await read('../../docs/aws-preview-deployment.md');

const deployPolicy = identity.slice(
  identity.indexOf('resource "aws_iam_policy" "github_deploy"'),
  identity.indexOf('resource "aws_iam_role_policy_attachment" "github_deploy"')
);

/** Split an IAM policy into its statements, each keyed by its Sid. */
const statements = (policy) =>
  policy
    .split(/Sid\s*=\s*"/)
    .slice(1)
    .map((chunk) => ({ sid: chunk.slice(0, chunk.indexOf('"')), body: chunk }));

describe('restricted SSM document', () => {
  it('is a versioned Command document with exactly the declared parameters', () => {
    assert.match(String(document.schemaVersion), /^2\./);
    assert.deepEqual(Object.keys(document.parameters).sort(), ['action', 'apiImage', 'webImage']);
    assert.deepEqual(document.parameters.action.allowedValues, [
      'deploy',
      'rollback',
      'verify',
      'status'
    ]);
    assert.equal(document.parameters.action.default, undefined, 'the caller must choose an action');
  });

  it('refuses any image reference that is not digest-pinned', () => {
    const digest = 'a'.repeat(64);
    for (const name of ['apiImage', 'webImage']) {
      const pattern = document.parameters[name].allowedPattern;
      assert.equal(typeof pattern, 'string', `${name} must declare allowedPattern`);
      const accepts = (value) => new RegExp(pattern).test(value);
      assert.equal(accepts(''), true, 'unused on the non-deploy actions');
      assert.equal(accepts(`ghcr.io/acme/phoeve@sha256:${digest}`), true);
      assert.equal(
        accepts(`123456789012.dkr.ecr.us-east-1.amazonaws.com/phoeve@sha256:${digest}`),
        true
      );
      assert.equal(accepts('ghcr.io/acme/phoeve:latest'), false);
      assert.equal(accepts(`ghcr.io/acme/phoeve@sha256:${'a'.repeat(63)}`), false);
      assert.equal(accepts(`ghcr.io/acme/phoeve@sha256:${digest.toUpperCase()}`), false);
      assert.equal(accepts(`ghcr.io/acme/phoeve@sha256:${digest}; id`), false);
      assert.equal(accepts(`ghcr.io/acme/phoeve@sha256:${digest} $(id)`), false);
    }
  });

  it('runs one fixed shell step and never a caller-supplied script', () => {
    assert.equal(document.mainSteps.length, 1);
    const [step] = document.mainSteps;
    assert.equal(step.action, 'aws:runShellScript');
    const source = step.inputs.runCommand.join('\n');
    assert.match(source, /\/usr\/local\/sbin\/phoeve-deploy/);
    for (const forbidden of [
      'AWS-RunShellScript',
      'eval ',
      'sh -c',
      'bash -c',
      'curl ',
      'wget '
    ]) {
      assert.equal(source.includes(forbidden), false, `the document must not contain "${forbidden}"`);
    }
  });

  it('interpolates only the validated parameters, and never into an exec line', () => {
    const source = document.mainSteps[0].inputs.runCommand.join('\n');
    const interpolated = [...source.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(interpolated)].sort(), ['action', 'apiImage', 'webImage']);
    for (const line of source.split('\n')) {
      if (!line.trim().startsWith('exec ')) continue;
      assert.equal(line.includes('{{'), false, `an exec line interpolates a parameter: ${line}`);
    }
  });

  it('re-validates the same digest shape its parameters declare', () => {
    const source = document.mainSteps[0].inputs.runCommand.join('\n');
    const declared = source.match(/digest_pinned='([^']+)'/);
    assert.ok(declared, 'the script must declare the digest pattern it enforces');
    assert.equal(digestCore(declared[1]), digestCore(document.parameters.apiImage.allowedPattern));
    assert.equal(digestCore(declared[1]), digestCore(document.parameters.webImage.allowedPattern));
    assert.equal((source.match(/=~ \$digest_pinned/g) ?? []).length, 2);
  });

  it('dispatches only the actions the parameters allow', () => {
    const source = document.mainSteps[0].inputs.runCommand.join('\n');
    assert.match(source, /case "\$action" in/);
    const branch = source.slice(source.indexOf('case "$action" in'));
    for (const action of ['deploy', 'rollback', 'verify', 'status']) {
      assert.ok(branch.includes(action), `${action} must be handled`);
    }
    assert.match(branch, /\*\)[\s\S]*exit 64/);
  });
});

describe('identity module', () => {
  it('creates the document from the reviewable, versioned template', () => {
    assert.match(identity, /resource "aws_ssm_document" "deploy"/);
    assert.match(identity, /name\s*=\s*"\$\{var\.project\}-\$\{var\.environment\}-deploy"/);
    assert.match(identity, /document_type\s*=\s*"Command"/);
    assert.match(identity, /document_format\s*=\s*"JSON"/);
    assert.match(identity, /file\("\$\{path\.module\}\/templates\/deploy-command\.json"\)/);
  });

  it('names the document exactly as the workflow addresses it', () => {
    const declared = workflow.match(/SSM_DOCUMENT:\s*(\S+)/);
    assert.ok(declared, 'the workflow must name the document it invokes');
    const project = bootstrapVariables.match(/variable "project"[\s\S]*?default\s*=\s*"([^"]+)"/)[1];
    const environment = bootstrapVariables.match(
      /variable "environment"[\s\S]*?default\s*=\s*"([^"]+)"/
    )[1];
    assert.equal(declared[1], `${project}-${environment}-deploy`);
  });

  it('grants SendCommand only on its own document and on tagged instances', () => {
    const sendCommand = statements(deployPolicy).filter((entry) =>
      entry.body.includes('ssm:SendCommand')
    );
    assert.equal(sendCommand.length, 2);
    for (const entry of sendCommand) {
      assert.equal(
        /Resource\s*=\s*"\*"/.test(entry.body),
        false,
        `${entry.sid} allows ssm:SendCommand on every resource`
      );
    }
    const ownDocument = sendCommand.find((entry) => entry.body.includes('aws_ssm_document.deploy.arn'));
    assert.ok(ownDocument, 'SendCommand must be scoped to the document this module creates');
    const instances = sendCommand.find((entry) => entry.body.includes('instance/*'));
    assert.ok(instances, 'SendCommand must be scoped to instances');
    assert.match(instances.body, /"aws:ResourceTag\/Project"\s*=\s*var\.project/);
    assert.match(instances.body, /"aws:ResourceTag\/Environment"\s*=\s*var\.environment/);
  });

  it('never references an AWS-managed document', () => {
    assert.equal(identity.includes('AWS-RunShellScript'), false);
    assert.equal(identity.includes('document/AWS-'), false);
  });

  it('keeps the deploy role unable to do anything else', () => {
    const allowed = new Set();
    for (const entry of statements(deployPolicy)) {
      for (const match of entry.body.matchAll(/"([a-z0-9-]+:[A-Za-z*]+)"/g)) allowed.add(match[1]);
    }
    assert.deepEqual([...allowed].sort(), [
      'ec2:DescribeInstances',
      'ssm:GetCommandInvocation',
      'ssm:ListCommandInvocations',
      'ssm:ListCommands',
      'ssm:SendCommand'
    ]);
  });

  it('exposes the document so a plan shows exactly what the workflow may call', () => {
    assert.match(identityOutputs, /output "deploy_document_name"/);
    assert.match(identityOutputs, /value\s*=\s*aws_ssm_document\.deploy\.name/);
    assert.match(identityOutputs, /output "deploy_document_arn"/);
    assert.match(identityOutputs, /value\s*=\s*aws_ssm_document\.deploy\.arn/);
  });
});

describe('deployment workflow', () => {
  it('runs in the protected environment with minimal permissions', () => {
    assert.match(workflow, /environment: beta/);
    assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*id-token: write/);
  });

  it('sends no script of its own', () => {
    assert.equal(workflow.includes('AWS-RunShellScript'), false);
    assert.equal(workflow.includes('commands=['), false);
    const documentNames = [...workflow.matchAll(/--document-name\s+(\S+)/g)].map((m) => m[1]);
    assert.ok(documentNames.length >= 2, 'both steps must address the document');
    for (const name of documentNames) assert.equal(name, '"$SSM_DOCUMENT"');
  });

  it('builds the document parameters as JSON instead of a command string', () => {
    assert.match(workflow, /jq -nc/);
    assert.match(workflow, /'\{action: \[\$action\], apiImage: \[\$api\], webImage: \[\$web\]\}'/);
    assert.match(workflow, /'\{action: \[\$action\]\}'/);
    assert.equal((workflow.match(/--parameters "\$parameters"/g) ?? []).length, 2);
  });

  it('enforces the same digest shape the document enforces', () => {
    const pinned = workflow.match(/pinned='([^']+)'/);
    assert.ok(pinned, 'the workflow must declare the digest shape it accepts');
    assert.equal(digestCore(pinned[1]), digestCore(document.parameters.apiImage.allowedPattern));
    assert.match(workflow, /confirmation.*'deploy'/);
  });
});

describe('deployment entry point', () => {
  it('accepts only the documented commands', () => {
    const dispatch = script.slice(script.indexOf('case "${1:-}" in'));
    assert.match(dispatch, /deploy\|""\)/);
    assert.match(dispatch, /rollback\) rollback/);
    assert.match(dispatch, /verify\) verify/);
    assert.match(dispatch, /status\) status/);
    assert.match(dispatch, /\*\) usage; die "unknown command/);
  });

  it('never evaluates a caller-supplied command', () => {
    for (const forbidden of ['eval ', 'sh -c', 'bash -c']) {
      assert.equal(script.includes(forbidden), false, `must not contain "${forbidden}"`);
    }
  });

  it('refuses tag-only images unless local validation is explicitly allowed', () => {
    assert.match(script, /@sha256:/);
    assert.match(script, /ALLOW_TAG_IMAGES/);
  });

  it('carries no second status table: the bundle probe owns the surface', () => {
    for (const surface of ['openapi.json', '/api/docs', '/media/', '/storage/', 'guest-entry']) {
      assert.equal(
        script.includes(surface),
        false,
        `the entry point must not duplicate the surface table (${surface})`
      );
    }
    assert.match(script, /preflight\.mjs/);
    assert.match(script, /--probe-only/);
    assert.match(script, /--probe-loopback/);
  });

  it('gates activation on the schema already applied', () => {
    const deployBody = script.slice(script.indexOf('deploy() {'), script.indexOf('rollback() {'));
    assert.match(deployBody, /migration_gate_forward "\$api_ref"/);
    assert.ok(
      deployBody.indexOf('migration_gate_forward "$api_ref"') <
        deployBody.indexOf('switch_to "$release_dir"'),
      'the forward gate must run before the release is activated'
    );
    assert.match(script, /--mode forward --applied -/);
  });

  it('gates a rollback on certified compatibility with the target release', () => {
    const rollbackBody = script.slice(script.indexOf('rollback() {'), script.indexOf('verify() {'));
    assert.match(rollbackBody, /migration_gate_backward/);
    assert.ok(
      rollbackBody.indexOf('migration_gate_backward') < rollbackBody.indexOf('switch_to'),
      'the backward gate must run before the release is restored'
    );
    assert.match(script, /--mode backward --applied -/);
    assert.match(script, /--release-manifest \/target\/migration-manifest\.json/);
  });

  it('publishes the requested images into app.env before Compose runs', () => {
    assert.match(script, /write_app_env_images/);
    assert.match(script, /app_env_from_release/);
    const wrapper = script.slice(script.indexOf('compose() {'), script.indexOf('# Reads a KEY=value'));
    assert.match(wrapper, /--env-file "\$APP_ENV"/);
    assert.equal(wrapper.includes('"$@"') && wrapper.includes('api_ref'), false);
  });

  it('never lets a secret rotation drop the active release from app.env', async () => {
    const renderEnv = bash(await read('deploy/render-env.sh'));
    // phoeve-deploy owns those two lines; re-rendering the environment file must
    // carry them over instead of producing an app.env Compose cannot start from.
    assert.match(renderEnv, /sed -n 's\/\^PHOEVE_API_IMAGE=\/\/p'/);
    assert.match(renderEnv, /sed -n 's\/\^PHOEVE_WEB_IMAGE=\/\/p'/);
    assert.match(renderEnv, /printf 'PHOEVE_API_IMAGE=%s\\nPHOEVE_WEB_IMAGE=%s\\n'/);
  });

  it('keeps a restricted probe runner the workflow can call', () => {
    assert.match(script, /verify\(\) \{ probe_surface; \}/);
  });
});

describe('deployment bundle', () => {
  it('ships the bundle inside the image, at the layout the entry point assumes', () => {
    assert.match(dockerfile, /COPY --chown=node:node infra\/beta \.\/infra\/beta/);
    assert.match(dockerfile, /WORKDIR \/workspace/);
  });

  it('reads the migration manifest where the database assembly writes it', () => {
    assert.match(databaseScript, /resolve\(root, 'packages\/database\/prisma'\)/);
    assert.match(databaseScript, /migration-manifest\.json/);
    assert.match(script, /packages\/database\/prisma\/migration-manifest\.json/);
  });

  it('ships compatibility declarations that certify nothing by default', async () => {
    const shipped = JSON.parse(await read('migration-compatibility.json'));
    assert.equal(shipped.schemaVersion, 1);
    assert.equal(shipped.default, 'forward-only');
    assert.deepEqual(shipped.reviewed, {});
  });
});

describe('documentation', () => {
  it('records the restricted document as the only command channel', () => {
    assert.match(docs, /phoeve-beta-deploy/);
    assert.match(docs, /AWS-RunShellScript/);
  });

  it('records what the protected environment does and does not enforce', () => {
    assert.match(docs, /required reviewers/);
  });

  it('records the probe contract and the rollback compatibility gate', () => {
    assert.match(docs, /--probe-loopback/);
    assert.match(docs, /migration-compatibility\.json/);
  });
});
