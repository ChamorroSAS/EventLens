# Phoeve — Hardening del rol Terraform Apply

Fecha: 2026-10-15. Estado: **REVIEW_REQUIRED / NO_GO_APPLY**. Implementación y evidencia local; no evaluación real de AWS IAM ni certificación de despliegue. No se ejecutó apply, no se crearon recursos AWS, no se accedió a credenciales/cuenta AWS y no se delegó. No se modificaron decisiones aceptadas ni estados de tickets.

## Resultado y matriz

Se restringe el conjunto de permisos que el código adjunta a `phoeve-beta-terraform-apply`, sin añadir acciones Allow respecto al baseline versionado. [Matriz completa acción/recurso/condición](terraform-apply-iam-matrix.md): 114 filas por statement/recurso, 180 combinaciones acción/recurso verificadas contra la referencia pública. [Snapshot de autorización AWS](evidence/iam-authorization-reference.json): fuentes oficiales, versión y hash SHA-256; sólo tipos relevantes para este alcance.

| Hallazgo | Cambio | Justificación de autorización |
|---|---|---|
| IAM roles con Resource `*` | ARN exacto `role/phoeve-beta-instance` | Create/Delete/UpdateAssumeRolePolicy soportan recurso role |
| Inline policies con iam:PolicyARN | Eliminar PutRolePolicy/DeleteRolePolicy: el stack usa managed policies | Esa condition key no aplica a esas acciones; sí aplica a AttachRolePolicy/DetachRolePolicy |
| Adjuntos y policies amplios | Sólo instance-runtime y AmazonSSMManagedInstanceCore sobre el rol exacto; sólo policy/instance-runtime editable | No puede adjuntar AdministratorAccess, editar sus policies propias ni las boundaries |
| Instance profiles | ARN exacto instance-profile/phoeve-beta-instance; PassRole sólo rol instance y ec2.amazonaws.com | AddRoleToInstanceProfile requiere también PassRole; la referencia AWS identifica ec2.amazonaws.com como destino |
| Boundary opcional | Control boundary obligatoria en los tres roles de bootstrap; workload boundary obligatoria en compute; DLM boundary exigida si se habilita DLM | Se comprueba ARN y contenido real por GetPolicy/GetPolicyVersion al planificar; no basta un ARN nominal |
| Route53 global | Hosted Zone requerida + nombre beta.phoeve.com + tipo A; arrays AllValues y comprobación Null | Impide lote mixto/apex/NS/otra zona; GetChange se separa a change/* de sólo lectura |
| EC2 global | ARN región/cuenta/tipo, RequestTag al crear, ResourceTag sobre padres/existentes; AMI exacta, tipo t4g.medium, IMDSv2, root gp3 cifrado | No se utiliza RequestTag para autorizar un padre existente ni ResourceTag sobre un recurso nuevo |
| Takeover por tags | Tags Project/Environment/DataRole inmutables fuera de creación | Impide tomar pertenencia o reclasificar autoridad como media/DB para snapshots |
| SSM beta* | ARN base exacto más `/phoeve/beta/*`; inputs sin comodines ni slash final | beta2 y beta-evil quedan fuera; boundary también excluye GetParameter/GetParameters de otros namespaces |

Fuentes: [IAM SAR](https://docs.aws.amazon.com/service-authorization/latest/reference/list_iam.html), [EC2 SAR](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ec2.html), [Route53 SAR](https://docs.aws.amazon.com/service-authorization/latest/reference/list_route53.html), [tagging EC2 durante creación](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/supported-iam-actions-tagging.html). La matriz usa nombres de acciones IAM, no confunde nombres de API con permisos.

Se conservan **97 acciones Allow de 103 entradas originales**. Se retiran dos inline policy writes no utilizadas, dos permisos directos de snapshots que este stack no usa desde Terraform y los nombres no válidos `budgets:CreateBudget/DeleteBudget`; `budgets:ModifyBudget`, que ya existía, es la autorización de esas operaciones. DLM conserva su boundary separada y continúa deshabilitado. [Budgets SAR](https://docs.aws.amazon.com/service-authorization/latest/reference/list_budgets.html). El archivo baseline registra el commit previo y no se regenera junto con los mocks.

## Diseño y diff

`modules/beta-permissions` es un compilador puro de JSON sin providers, consultas ni recursos. Sus definiciones se reutilizan desde bootstrap, el root independiente de boundaries y el contrato de Beta, para evitar versiones divergentes.

- `identity/main.tf`: sustituir la policy monolítica por core IAM/DNS/SSM, servicios y seis segmentos EC2. No crece la unión de acciones; las condiciones y recursos la reducen. Las ocho policies caben en el límite predeterminado de diez adjuntos por rol. Cada documento tiene precondition ≤6,144 caracteres.
- `identity`: consultar y comparar ambas boundaries externas; los roles dependen de la lectura de control, y la policy delegada de la lectura de workload. Estas lecturas no dependen de recursos nuevos; se preserva la corrección de `depends_on` del bootstrap.
- `identity`: subjects OIDC pasan de StringLike a StringEquals junto con aud, sin cambiar issuers, principales ni subjects válidos. Un asterisco de input no se interpreta como patrón de confianza.
- `compute`: boundary obligatoria, tags del perfil y tags Project/Environment del root volume; corregir el Version JSON inválido 2012-11-01 a 2012-10-17 sin cambiar acciones runtime.
- Beta: AMI explícita, coincidente con la autorizada en bootstrap; no se consulta el parámetro público SSM si se proporciona AMI. Así no se añade GetParameter al rol apply para descubrimiento. Se mantiene ARM64/capacidad pendiente de acreditación.
- Beta: leer y validar workload boundary antes de pasarla a compute; validar DLM boundary cuando corresponda. Las flags de autoridad/snapshots continúan apagadas y con sus guards originales.
- CI: validar los tres roots y ejecutar sólo pruebas plan/mock; ningún workflow añade credenciales AWS ni id-token para estas comprobaciones.

El primer plan simulado con proveedores nuevos contiene ahora **27 creaciones**, frente a las 13 anteriores: siete managed policies adicionales y siete attachments. Son divisiones del mismo conjunto restringido, no recursos reales ni permisos nuevos. El estado real puede producir otro conteo; revisar el diff, no aprobar por cantidad.

## Boundaries e independencia de bootstrap

| Boundary | Contenido / uso | Tamaño JSON de fixture |
|---|---|---:|
| phoeve-beta-control-boundary | Ceiling para plan/apply/deploy; denegación de mutaciones IAM fuera de rol/perfil/policy runtime, sustitución/borrado de boundaries, adjuntos no permitidos, PassRole a otro servicio, otra zona DNS/nombre/tipo, parámetros ajenos y otra región EC2 | 5,195 |
| phoeve-beta-workload-boundary | Sólo parámetros Beta, logs de aplicación, operaciones del agente SSM y decrypt mediante SSM con encryption context del namespace | 1,460 |
| phoeve-beta-dlm-boundary | Sólo snapshots de volúmenes operativos daily con DataRole DB/media; no autoridad; tagging sólo al crear snapshots y borrado de snapshots DLM etiquetados | 1,382 |

Una boundary **no concede permisos**; intersecta la identity policy y sus Deny prevalecen. La control boundary no reemplaza el ABAC detallado de las ocho identity policies: no se afirma que su ceiling por sí solo replique cada restricción EC2. La workload boundary excluye IAM y acceso a otros namespaces incluso si una identity policy maliciosa añadiera Allow `*`. [Semántica AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html).

Inicialización sin dependencia circular, **propuesta para ejecución posterior autorizada**, no realizada:

1. Revisar `environments/permission-boundaries` con zona y AMI aprobadas. Configurar un workspace remoto independiente mediante su plantilla; auto-apply desactivado. No desplegar con state local.
2. La identidad inicial necesita permisos explícitos para mantener esas tres policies, fuera del rol delegado. No reutilizar `phoeve-beta-terraform-apply`: sus permisos y su boundary le prohíben administrarlas. Este requisito no añade permisos al rol que se está restringiendo.
3. Generar y revisar el plan de ese root. La autorización para crear/actualizar las policies es independiente y sigue fuera de esta entrega. Si ya existen, verificar su contenido y la adopción de estado autorizada; no borrarlas para evitar un conflicto de nombre.
4. Una vez existentes, informar sus ARN a bootstrap. Sus lecturas comparan contenido decodificado con el compilador; otro ARN, policy alterada o lectura fallida bloquean el plan. El root de boundaries tiene prevent_destroy; el delegado tampoco puede borrar/versionar sus policies.
5. Regenerar bootstrap en `nch-team/phoeve-bootstrap` con el backend autorizado, zona real y AMI fijada. Este root consume boundaries existentes; no las crea bajo sus propios roles.
6. Beta recibe la misma workload boundary y AMI revisada. Roles existentes sin boundary no se migran silenciosamente: el delegado no puede usar PutRolePermissionsBoundary; una reparación/importación necesita autorización independiente.

No se versionan backend generado, tfvars reales, state, tokens ni planes de cuenta. Los examples contienen valores ficticios. La comparación de JSON es deliberadamente estricta: una representación o versión diferente requiere revisión, no fallback.

## Pruebas y evidencia

Terraform 1.9.8, hashicorp/aws 5.100.0 fijado por los lockfiles de los tres roots, Node v22.23.2. AWS provider mock en todos los tests y cada run usa command = plan. Las únicas consultas de red fueron descargas públicas de documentación/proveedor; no hubo API de cuenta.

| Comprobación | Resultado local |
|---|---|
| Bootstrap: guards, input obligatorio, proveedores existentes/nuevos, JSON y cuotas | 13 tests plan/mock PASS |
| Boundaries alteradas, control y workload | Dos errores de postcondition intencionales verificados por diagnóstico exacto; el harness los considera rechazo correcto |
| Decisiones de acceso sobre JSON renderizado | 37 positivos y 93 negativos por fixture de proveedor; denegación de roles/policies/perfiles ajenos, inline writes, boundary incorrecta/removida, PassRole a Lambda/DLM, DNS mixto/apex/NS, SSM fuera de namespace, tags ausentes, otra región, AMI/tipo/IMDS/encryption y reclasificación de autoridad, incluidas variantes de mayúsculas en tags protegidos |
| Modelo IAM acotado | 7 tests PASS: wildcard/case, intersección ARN, Deny, boundary sin grant propio, Null/vacuous truth, NotResource, negación, comparación sin distinguir mayúsculas y operadores desconocidos |
| Referencia pública SAR | 180 combinaciones acción/recurso del apply y 184 de las boundaries; claves compatibles con acción/tipo; no implica que un servicio produzca siempre el contexto esperado |
| Beta | 4 tests PASS: rol runtime con boundary, AMI explícita sin lookup SSM, root cifrado/etiquetado, rechazo de boundary alterada, AMI no fijada y tags adicionales que intentan sobrescribir claves reservadas |
| Root independiente | 1 test PASS: tres policies de versión válida dentro de cuotas y ARN esperado sin ciclo de recursos |
| fmt / validate / diff | PASS: fmt recursivo, validate de los tres roots y diff sin errores de whitespace |
| IAM Policy Simulator / AWS plan / apply | **NOT_EXECUTED** |

Comandos desde la raíz, con Terraform 1.9.8 disponible:

```bash
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/permission-boundaries init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform/environments/permission-boundaries validate
terraform -chdir=infra/terraform/environments/permission-boundaries test
terraform -chdir=infra/terraform/environments/bootstrap init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform/environments/bootstrap validate
node scripts/verify-bootstrap-plan.mjs
node --test scripts/iam/policy-evaluator.test.mjs
terraform -chdir=infra/terraform/environments/beta init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra/terraform/environments/beta validate
node scripts/verify-beta-boundary-plan.mjs
git diff --check
```

Para regenerar fixtures ficticias, no evidencia AWS: `node scripts/iam/update-fixtures.mjs`; para matriz: `node scripts/iam/render-matrix.mjs`. El generador usa sólo init/console sobre un módulo puro en `.local`; no cambia el baseline de acciones previo. `node scripts/iam/refresh-reference.mjs` actualiza sólo documentación pública y conserva fuentes/hashes.

## Límites, capacidad y riesgos residuales

1. **NO_GO_APPLY por permisos faltantes previos, no resueltos mediante ampliación.** El rol apply del código carece de discovery EC2, IAM GetPolicyVersion y lecturas Route53 necesarias para refresh/read-after-create de recursos. El plan role sí tiene varias de esas lecturas, pero los dos roles no se suman. Un plan mock no demuestra un provisioning funcional. Se necesita inventario de llamadas del provider y aprobación explícita de las lecturas mínimas que falten; no se adjunta ReadOnlyAccess/AdministratorAccess ni se añaden acciones automáticamente.

   Evidencia del provider fijado: [IAM policy v5.100.0](https://github.com/hashicorp/terraform-provider-aws/blob/v5.100.0/internal/service/iam/policy.go) llama GetPolicyVersion al leer el documento; [Route53 record v5.100.0](https://github.com/hashicorp/terraform-provider-aws/blob/v5.100.0/internal/service/route53/record.go) vuelve a leer el registro y consulta la zona y ListResourceRecordSets. Estas llamadas de lectura no quedan autorizadas por los permisos de escritura.
2. **DLM sigue bloqueado.** La allowlist original de AttachRolePolicy no autorizaba AWSDataLifecycleManagerServiceRole y PassRole sólo permitía EC2. El hardening no añade DLM a esos permisos. Su boundary está definida para impedir roles sin límite, pero no habilita snapshots. Se debe comprobar en laboratorio que DLM manda los tags/acciones de creación esperados; no relajar la boundary para hacer pasar el mock.
3. La API usa autorizaciones multi-recurso y contexto generado por el servicio. El evaluador offline reproduce sólo los operadores usados, no SCP, session policies, resource policies, KMS grants, STS/JWT ni todas las reglas del simulador. La excepción de ENI implícita y la asociación de EIP con instanceId requieren comprobación AWS adicional. Las reglas SG actuales no tienen TagSpecifications; si se añaden tags habrá que revisar la autorización security-group-rule.
4. Antes de un futuro apply, usar IAM Policy Simulator/SimulateCustomPolicy con todos los documentos y la boundary, context keys completos y recursos requeridos, incluidos los escenarios EC2. Incluso AWS advierte que el simulador puede diferir del entorno real. [API oficial](https://docs.aws.amazon.com/IAM/latest/APIReference/API_SimulateCustomPolicy.html). No se presenta el modelo local como resultado de AWS.
5. Terraform conserva capacidad declarativa del stack base, names/ARN, tags, cifrado y guards; se acredita un plan simulado coherente. **No se acredita creación end-to-end bajo los permisos actuales**. No es posible prometerla y, a la vez, mantener prohibida la adición de las lecturas ausentes.
6. Roles con policies externas adjuntas necesitan inventario y revisión real. Los attachments no reclaman exclusividad de todo IAM; ocho es la cantidad declarada aquí, no una observación de la cuenta. La boundary protege operaciones críticas, pero no demuestra por sí sola todos los límites ABAC ante una identity policy externa más amplia. No aprobar con attachments desconocidos.
7. CreateRole/UpdateAssumeRolePolicy no validan el contenido de un trust EC2 mediante condición IAM. El delegado administra un rol de runtime acotado, pero el código de infraestructura y su revisión siguen siendo de confianza; puede gestionar el host y datos permitidos. La boundary no protege frente a root/control-plane comprometido. El default de KMS/alias de la policy runtime necesita comprobación efectiva con el key ARN elegido; no se amplió su Resource para ocultar ese límite.
8. No se habilitan autoridad, media, PITR ni workers. Snapshots siguen complementarios; DataRole de autoridad no puede convertirse en operativo mediante tagging del apply. No se recupera journal junto con SQL ni se modifica independencia/revocación. ARM64, capacidad y gates de Beta continúan pendientes.

## Dictamen para CloudShell

**Corrección lista para revisión y validación estática; regeneración de bootstrap condicionada a boundaries existentes/verificadas y a completar inputs. NO_GO_APPLY.** No se consultó si existen en la cuenta; no se afirma que falten o que estén aprobadas.

Después de satisfacer esas precondiciones, desde el root bootstrap conservar backend `nch-team/phoeve-bootstrap`, auto-apply off y lockfile. No usar -upgrade, target o state local para sortear fallos. Generar un plan nuevo y su JSON privado; si HCP no soporta out/show en el modo configurado, obtener el JSON del run autorizado sin cambiar backend.

Revisar **las ocho policies como unión**, no sólo hcp_apply[0]: todas las `module.identity.aws_iam_policy.hcp_apply*` y sus attachments, boundary leída y trusts de plan/apply/deploy. Ejemplo sobre el JSON privado:

```bash
jq '[.planned_values.root_module.child_modules[]
  | select(.address == "module.identity") | .resources[]
  | select(.type == "aws_iam_policy" and .mode == "managed")
  | {address, name: .values.name, document: (.values.policy | fromjson?)}]' bootstrap.tfplan.json
```

Una policy desconocida o una boundary alterada no se resuelve aplicando. Registrar commit, versiones, plan/run ID y revisión sanitizada. Cambios de zona, AMI, policies externas, versión de boundary o provider invalidan la revisión anterior. La evidencia local y el nuevo plan no promueven tickets ni autorizan creación de recursos.
