# Phoeve — Correctivo del bootstrap IAM de Terraform

Fecha: 2026-10-15, America/Bogota. Alcance: generación revisable del plan de `infra/terraform/environments/bootstrap`. No se ejecutó apply, no se crearon recursos AWS, no se consultó una cuenta AWS y no se delegó. No se modifica ningún contrato aceptado ni estado de ticket.

## Causa confirmada y diff

Al comenzar, el working tree ya contenía la eliminación de `depends_on = [terraform_data.guard_rails]` en `module.identity`; se conservó. HEAD `eeaaca4` todavía tenía la dependencia. La corrección se verifica contra una copia aislada del módulo, sin revertir el archivo de trabajo.

El grafo de Terraform `graph -type=plan` de la configuración anterior contiene:

```dot
"[root] module.identity (expand)" -> "[root] terraform_data.guard_rails (expand)"
```

Las lecturas `module.identity.data.aws_caller_identity.current` y `module.identity.data.aws_region.current` dependen de la expansión del módulo. El guard es un recurso pendiente de creación en el primer plan, por lo que la dependencia global aplaza las lecturas. `local.account_id` y `local.region` propagan los desconocidos a `hcp_apply.policy`. Esto coincide con el JSON informado por el usuario. [Semántica oficial de depends_on](https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on).

En el grafo corregido desaparece esa arista; permanecen:

```text
hcp_apply.policy -> local.account_id -> data.aws_caller_identity.current
hcp_apply.policy -> local.region     -> data.aws_region.current
github_deploy.policy -> aws_ssm_document.deploy
roles -> proveedores OIDC seleccionados
attachments -> roles y políticas
```

El grafo de conocimiento del repositorio no tiene cobertura de estos archivos Terraform (índice 2026-10-09). Se usó lectura directa y el grafo nativo de Terraform; no se infirió ausencia de dependencias a partir del grafo de código.

Diff funcional:

```diff
 module "identity" {
   ...
-  depends_on = [terraform_data.guard_rails]
 }
```

Se añaden a `variables.tf` las **mismas tres condiciones** de entrada de las precondiciones originales: formato owner/name, selección exclusiva de proveedor GitHub y workspace requerido cuando se informa organización HCP. No se cambian condiciones ni mensajes. Las precondiciones de `terraform_data.guard_rails` se conservan íntegramente.

Las validaciones no dependen de recursos ni consultas AWS y se ejecutan al planificar. Además cubren un plan dirigido a `module.identity` que podría excluir el recurso independiente de guard rails. Las validaciones cruzadas usan Terraform ≥1.9, ya exigido por el root. La región sigue validada exclusivamente como us-east-1. No se añaden dependencias nuevas de recursos.

Otros cambios: pruebas plan-only AWS mock, verificador de JSON del plan integrado en ambos workflows estáticos y exclusión de `*.tfplan`/`*.tfplan.json` de Git. `terraform_wrapper: false` evita que el wrapper de Actions intercale salida no JSON en el protocolo del verificador. No cambian permisos de los workflows.

## Revisión IAM y OIDC

**No hay diff en `modules/identity/main.tf`, `variables.tf`, `outputs.tf` ni el documento SSM.** No se cambian Action, Resource, Effect, Principal, aud, sub, boundary ni attachments. La verificación de hashes contra HEAD confirma igualdad del módulo IAM y del template. No se amplían permisos.

| Política | Resultado comprobado | Límite |
|---|---|---|
| `hcp_apply[0]` | JSON conocido en plan con cuenta simulada 123456789012 y us-east-1; ARN de parámetros, políticas y PassRole interpolados correctamente; PassRole limitado a EC2 | No demuestra autorización efectiva de una cuenta real ni constituye aprobación general del conjunto de permisos existente |
| `hcp_plan` | JSON conocido; todas las acciones retenidas son discovery/Get/List/Describe/View | Se conserva su alcance anterior, incluida lectura de parámetros; no se redefine por este correctivo |
| `github_deploy` | Fuente revisada e intacta: DescribeInstances, SendCommand al documento específico y a host etiquetado Project/Environment, lectura de resultados | El JSON completo sigue desconocido cuando se crea el documento SSM porque referencia su ARN calculado por el proveedor; es una dependencia legítima y se conserva |

El caso con dos proveedores OIDC nuevos reproduce **13 creaciones planificadas** con AWS simulado. HCP apply y plan tienen política conocida; los trusts de roles todavía dependen de los ARN de proveedores nuevos. Los ARN de recursos por crear no se declaran conocidos a partir de un mock y no se reemplazan por wildcards o valores arbitrarios.

Con proveedores existentes, se verifican en el JSON los tres trusts completos:

| Rol | Issuer / aud | Subject exacto de fixture |
|---|---|---|
| GitHub deploy | token.actions.githubusercontent.com / sts.amazonaws.com | repo:test-owner/EventLens:environment:beta |
| HCP plan | app.terraform.io / aws.workload.identity | organization:test-team:project:test-project:workspace:phoeve-beta:run_phase:plan |
| HCP apply | app.terraform.io / aws.workload.identity | organization:test-team:project:test-project:workspace:phoeve-beta:run_phase:apply |

Se comprueban principal federado de la cuenta simulada, `sts:AssumeRoleWithWebIdentity`, efecto Allow, separación plan/apply, URLs/audiencias de proveedores nuevos y boundary en los tres roles. Son fixtures ficticios, no valores del workspace real `nch-team/phoeve-bootstrap`. El workspace del backend y el workspace que figura en los trusts son conceptos distintos: verificar el destino aprobado de los roles sin sustituirlo por el nombre del bootstrap automáticamente.

Límites preexistentes que no se ocultan ni se modifican fuera de alcance:

- Los subjects usan StringLike. La regex heredada `^[^/]+/[^/]+$` comprueba forma pero **permite caracteres `*`/`?`** dentro de cada segmento; su mensaje es más fuerte que su garantía. No se introduce esa debilidad en este cambio, pero el operador debe revisar todos los valores reales para impedir subjects con wildcard. La suite acredita los subjects exactos de fixtures, no valida arbitrariamente todo input OIDC.
- El guard existente de selección exclusiva es para GitHub; no hay comprobación equivalente de selección HCP. Revisar el ARN/proveedor HCP y el project/subject reales antes de aprobar un plan.
- Se conservan statements amplios existentes del apply role; esta revisión confirma ausencia de ampliación, no un nuevo dictamen de least privilege del stack completo.
- No se simulan firma JWT, intercambio STS ni evaluación efectiva AWS IAM. Se verifican documentos y dependencias de configuración.

Por esas razones y por valores legítimamente calculados, **no se declara que las tres políticas y todos los trusts del primer plan de 13 recursos estén completamente resueltos**. Hacerlo requeriría otro alcance técnico o un plan con recursos existentes; no se usa apply como atajo para completar esta evaluación.

## Pruebas y evidencia ejecutadas

Herramientas: Terraform 1.9.8 Windows amd64 (misma versión de CI), Node v22.23.2. Descarga desde releases.hashicorp.com y comprobación SHA-256 contra el manifest oficial. Bootstrap usa hashicorp/aws 5.100.0, seleccionado por su lockfile, sin upgrade.

| Comprobación | Resultado |
|---|---|
| `terraform fmt -check -recursive infra/terraform` | PASS tras formatear sólo bootstrap |
| `terraform -chdir=infra/terraform/environments/bootstrap validate -no-color` | PASS |
| `terraform -chdir=infra/terraform/modules/identity validate -no-color` | PASS con warning preexistente: `aws_region.current.name` deprecado en AWS 6.69.0 del cache/lockfile local previo de ese módulo; no se cambió versión ni lockfile. La evidencia del root usa AWS 5.100.0, no ese cache |
| `node scripts/verify-bootstrap-plan.mjs --terraform .local/tools/terraform-1.9.8/terraform.exe` | PASS_MOCK_PLAN_ONLY: 11 pass, 0 fail/error/skip |
| Grafo anterior vs corregido | Arista global presente vs ausente; lecturas vinculadas a cuenta/región preservadas |
| Regresión controlada, misma suite/variables con la dependencia reintroducida en copia aislada | Falla esperada: `Account/region reads must not be deferred to apply` |
| `git diff --check` | PASS |
| AWS real / HCP plan / apply | NOT_EXECUTED |

Las once pruebas son: dos planes válidos (proveedores existentes y nuevos), cuatro rechazos de entradas inválidas (repo, proveedor GitHub ausente/duplicado, HCP sin workspace), rechazo de región y cuatro rechazos equivalentes dirigidos al módulo. Antes de añadir las validaciones redundantes se comprobó también el rechazo de las precondiciones originales con la primera suite de siete casos. [Pruebas mock de Terraform](https://developer.hashicorp.com/terraform/language/tests/mocking).

El verificador consume `terraform test -json -verbose` en streaming y retiene sólo cambios relevantes y resumen; no publica provider schemas ni planes reales. Los artefactos temporales y binarios de comparación están en `.local/` ignorado; no se versionan credenciales, tfvars, state ni configuración HCP.

Reproducir desde la raíz del repositorio (con Terraform 1.9.8 instalado):

```bash
terraform -chdir=infra/terraform/environments/bootstrap init -backend=false -input=false -lockfile=readonly
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/bootstrap validate -no-color
node scripts/verify-bootstrap-plan.mjs
terraform -chdir=infra/terraform/environments/bootstrap graph -type=plan
```

No ejecutar el primer comando sobre una configuración HCP generada sin revisar cómo se inicializa para tests; en checkout limpio no hay backend generado. No usar `terraform test` sin el mock y los `command = plan` proporcionados. Las copias de reproducción sólo contienen tf/lockfile/templates públicos, sin tfvars, backend HCP ni state.

## Dictamen y regeneración en AWS CloudShell

**PREPARADO PARA REGENERAR EL PLAN; NO APROBADO PARA APPLY.** La causa artificial está corregida y las validaciones equivalentes están probadas. La acreditación local es con AWS simulado; verificar cuenta y ARN efectivos requiere el nuevo plan autenticado de CloudShell/HCP. Ningún ticket se promueve por este dictamen.

Pasos futuros, ejecutados por el operador en el entorno ya autorizado:

1. Llevar el diff a CloudShell y confirmar que no sobrescribe cambios ajenos. Mantener versión/lockfile, credenciales temporales y backend existente `nch-team/phoeve-bootstrap`, auto-apply desactivado. No cambiar a state local, workspace distinto, `-upgrade` o flags de bypass para hacer pasar la revisión.
2. Revisar tfvars reales sin publicarlos: cuenta destino, us-east-1, repo/environment exactos, organización/project/workspace/fase exactos, selección/ARN de proveedores y boundary. Rechazar `*`/`?` en scopes OIDC que deban ser exactos.
3. Desde `infra/terraform/environments/bootstrap`:

```bash
terraform version
terraform init -input=false -lockfile=readonly
terraform fmt -check -recursive
terraform validate -no-color
terraform plan -input=false -out=bootstrap.tfplan
terraform show -json bootstrap.tfplan > bootstrap.tfplan.json
```

Si el modo remoto/versionado de HCP no admite `-out`/`show`, usar el JSON del run en HCP mediante el mecanismo autorizado; no cambiar el backend/modo de ejecución para obtenerlo. Los comandos anteriores son instrucciones futuras; no se ejecutaron contra HCP/AWS durante esta corrección.

4. Sobre el JSON disponible, comprobar que HCP apply tiene un string de política y no `unknown.policy = true`:

```bash
jq -e 'any(.resource_changes[];
  .address == "module.identity.aws_iam_policy.hcp_apply[0]"
  and (.change.after.policy | type) == "string"
  and .change.after_unknown.policy != true)' bootstrap.tfplan.json

jq '[.resource_changes[]
  | select(.type == "aws_iam_policy" or .type == "aws_iam_role")
  | {address, policy: .change.after.policy,
      policy_unknown: .change.after_unknown.policy,
      trust: .change.after.assume_role_policy,
      trust_unknown: .change.after_unknown.assume_role_policy}]' bootstrap.tfplan.json
```

5. Confirmar account ID real, región y ARN scoped en la política renderizada; ninguna lectura de caller_identity/region debe figurar diferida por guard_rails. Revisar los desconocidos legítimos del documento SSM/proveedores nuevos y el diff de acciones/recursos. No inferir de «13 recursos» que el alcance sea seguro o que no haya cambios de estado desde el plan anterior.
6. Conservar run ID, commit/diff exacto, versiones, resultado y revisión privada sanitizada. No versionar el JSON completo ni compartirlo como artifact público: planes pueden contener información sensible. Si siguen unknowns en HCP apply, detener y analizar el nuevo grafo; no aplicar para despejarlos.

Este dictamen permite volver a producir evidencia revisable. La aprobación de apply y cualquier corrección adicional de permisos/OIDC son pasos separados.
