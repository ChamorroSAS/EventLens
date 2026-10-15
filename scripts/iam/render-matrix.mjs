import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const input = process.argv[2] || fileURLToPath(new URL('../../.local/iam-policy-fixtures/rendered.json', import.meta.url));
const docs = JSON.parse(readFileSync(input, 'utf8'));
assert.ok(docs.control.includes('arn:aws:iam::123456789012:'), 'Use the fictitious fixture compiler, not a real account plan');
const baseline = JSON.parse(readFileSync(new URL('../../infra/terraform/environments/bootstrap/tests/fixtures/baseline-apply-actions.json', import.meta.url), 'utf8'));
const statements = Object.entries(docs.apply).flatMap(([policy, json]) => JSON.parse(json).Statement.map(s => ({ policy, ...s })));
const actions = new Set(statements.filter(s => s.Effect === 'Allow').flatMap(s => s.Action));
const clean = value => String(value).replaceAll('123456789012', 'ACCOUNT').replaceAll('|', '&#124;');
const rows = statements.flatMap(s => (Array.isArray(s.Resource) ? s.Resource : [s.Resource]).map(resource =>
  `| ${s.policy} | ${s.Effect} | ${s.Action.map(a => '`' + a + '`').join('<br>')} | \`${clean(resource)}\` | ${s.Condition ? '`' + clean(JSON.stringify(s.Condition)) + '`' : '—'} |`));
writeFileSync(new URL('../../docs/terraform-apply-iam-matrix.md', import.meta.url), `# Phoeve Beta — Matriz IAM del rol Terraform Apply

Fecha: 2026-10-15. Generada del compilador Terraform con datos ficticios; ACCOUNT se resuelve al ID real al planificar. No es salida de AWS IAM Policy Simulator.

Fuente de acciones, tipos y condiciones: [snapshot SAR](evidence/iam-authorization-reference.json), con URL oficial, versión y SHA-256 por servicio. Incluye sólo los tipos usados en este alcance; la fuente contiene la referencia completa. Se comprueba compatibilidad de patrones ARN y claves, no el contexto efectivo producido por AWS.

Se conservan ${actions.size} acciones Allow de las ${baseline.actions.length} entradas originales. Se retiran inline policies (PutRolePolicy/DeleteRolePolicy), las API directas CreateSnapshot/DeleteSnapshot que Terraform no invoca en este stack (DLM usa su propio rol), y los nombres no válidos budgets:CreateBudget/DeleteBudget. No se agrega ninguna acción Allow. ${Object.keys(docs.apply).length} policies gestionadas, límite de 6,144 caracteres/documento y diez adjuntos/rol.

| Policy | Efecto | Acción | Recurso | Condición |
|---|---|---|---|---|
${rows.join('\n')}

Los ARN de snapshots EC2 omiten account según SAR. Las demás mutaciones usan ARN de región/cuenta, y tags de pertenencia para recursos existentes o RequestTag para creación. CreateTags sólo establece ownership durante una creación; esos tags no se pueden alterar ni borrar después.

Los padres existentes de CreateSubnet/RouteTable/SecurityGroup se autorizan aparte del recurso nuevo. RunInstances separa AMI exacta, instancia/volumen nuevos, subnet/SG existentes e interfaz primaria implícita. La excepción ENI de creación exige región/cuenta/subnet; requiere verificación multi-recurso con el servicio real.

Único Allow Resource '*' del apply: dlm:CreateLifecyclePolicy (sin resource-level permissions en SAR), con tags obligatorios y aws:RequestedRegion. Los Deny con '*' o NotResource son exclusiones, no grants.

AWS sólo evalúa security-group-rule en AuthorizeSecurityGroupIngress/Egress cuando hay TagSpecifications. Los recursos de reglas actuales no tienen tags: se conserva autorización sobre el SG padre etiquetado, sin agregar una excepción de tagging de reglas. Un cambio posterior de ese contrato requiere revisar la matriz.

Boundaries, inicialización, pruebas y límites: [informe](terraform-apply-iam-hardening.md). Regenerar con update-fixtures.mjs y render-matrix.mjs desde la raíz; no usar datos de planes reales para este documento.
`);
console.log(`IAM_MATRIX_WRITTEN ${rows.length} rows, ${actions.size} allow actions`);
