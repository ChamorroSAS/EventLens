// Regenerate fictitious boundary fixtures with a pure Terraform module.
// No providers/resources; init and console do not call AWS.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const terraform = process.argv[2] || 'terraform';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = resolve(repo, '.local/iam-policy-fixtures');
mkdirSync(root, { recursive: true });
writeFileSync(resolve(root, 'main.tf'), `module "permissions" {
source = "../../infra/terraform/modules/beta-permissions"
account_id = "123456789012"
hosted_zone_id = "ZTESTBETA"
allowed_ami_id = "ami-0123456789abcdef0"
}`);
execFileSync(terraform, [`-chdir=${root}`, 'init', '-backend=false', '-input=false'], { stdio: 'pipe' });
const result = execFileSync(terraform, [`-chdir=${root}`, 'console'], {
  input: 'jsonencode({apply=module.permissions.apply_policies,control=module.permissions.control_boundary,workload=module.permissions.workload_boundary,dlm=module.permissions.dlm_boundary})\n', encoding: 'utf8',
});
const documents = JSON.parse(JSON.parse(result));
const tests = resolve(repo, 'infra/terraform/environments/bootstrap/tests');
for (const name of ['control', 'workload', 'dlm']) writeFileSync(resolve(tests, `fixtures/${name}-boundary.json`), JSON.stringify(JSON.parse(documents[name]), null, 2) + '\n');
for (const file of ['guard_rails.tftest.hcl', 'rejections/control.tftest.hcl', 'rejections/workload.tftest.hcl']) {
  let text = readFileSync(resolve(tests, file), 'utf8');
  let index = 0;
  text = text.replace(/<<-JSON\r?\n[\s\S]*?\r?\n[ \t]*JSON/g, () => `<<-JSON\n${documents[index++ === 0 ? 'control' : 'workload']}\nJSON`);
  if (index !== 2) throw Error(`Expected two fixture documents in ${file}`);
  writeFileSync(resolve(tests, file), text.trimEnd() + '\n');
}
const betaTest = resolve(repo, 'infra/terraform/environments/beta/tests/boundaries.tftest.hcl');
writeFileSync(betaTest, readFileSync(betaTest, 'utf8').replace(/<<-JSON\r?\n[\s\S]*?\r?\n[ \t]*JSON/, `<<-JSON\n${documents.workload}\nJSON`));
writeFileSync(resolve(root, 'rendered.json'), JSON.stringify(documents, null, 2) + '\n');
console.log('FICTITIOUS_BOUNDARY_FIXTURES_UPDATED_NO_AWS');
