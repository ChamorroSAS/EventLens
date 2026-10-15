# Phoeve Beta — Propuesta de infraestructura y despliegue

Fecha: 2026-10-14. RECOMMENDED; REQUIREMENTS_READY: NO; READY_FOR_IMPLEMENTATION: NO.
Todos los pasos de aprovisionamiento son futuros y requieren gates/aprobación. No hay archivos Terraform ni workflows ejecutables nuevos en esta entrega.

## Arquitectura

```mermaid
flowchart TD
  Guests[Organizadores e invitados] --> DNS[Route 53 beta.phoeve.com]
  DNS --> HTTPS[EC2 - proxy HTTPS y SPA estática]
  HTTPS --> API[API NestJS]
  HTTPS --> Gateway[Gateway privado de media local]
  API --> DB[PostgreSQL 16 - EBS DB]
  Gateway --> Media[EBS media - originales y derivados]
  Worker[Worker / supervisor] --> DB
  Worker --> Media
  Worker --> Parser[Containers aislados sin red]
  Scheduler[Scheduler independiente] --> DB
  API --> Authority[RecoveryAuthority - destino independiente pendiente]
  Worker --> Authority
  Scheduler --> Authority
  DB --> Backups[Backup/WAL fuera del host - no S3]
  Media --> Backups
  GH[GitHub Actions] --> OIDC[OIDC y roles separados]
  OIDC --> SSM[SSM - deploy aprobado]
  SSM --> HTTPS
  TF[HCP Terraform - state externo] --> OIDC
```

Una EC2 de aplicación, PostgreSQL y media local con volúmenes EBS separados. Autoridad/backups externos son control de recuperación, no otra aplicación Phoeve. Su servicio/proveedor/costo necesita aprobación. Sin ALB, NAT Gateway, ECS, RDS o bucket S3 obligatorio. EBS snapshots usan internamente almacenamiento AWS; no requieren integrar bucket S3 del proyecto. [Snapshots EBS](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-snapshot.html).

Red: VPC/subnet pública/IGW y EIP de aplicación; sólo TCP 80/443 inbound. 80 para challenge HTTP-01 y redirect, ningún API/PG/MinIO público. SSM para administración sin SSH público. Redes Docker privadas separadas; no asumir que `internal: true` deja salida para correo/authority. Diseñar rutas de egress controladas por servicio. IMDSv2, bloqueo IMDS desde contenedores no autorizados, sin AWS credentials en parsers. Salida HTTPS para SSM/registry/ACME/autoridad; salida de backup limitada al destino aprobado. [SSM](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html), [ACME](https://letsencrypt.org/docs/challenge-types/).

## Módulos Terraform propuestos

Nombres semánticos: `infra/terraform/modules/{network,identity,compute,persistent-storage,dns,monitoring,snapshot-policy}` y roots `environments/beta` y `bootstrap`. Módulo de repositorio/ledger externo sólo tras decisión, no dependencia S3 implícita.

| Módulo | Responsabilidad / seguridad |
|---|---|
| network | VPC, subnet, route/IGW, SG sólo 80/443; egress y DNS explícitos; ningún 5432/3000/4200/9000 publicado. |
| identity | OIDC GitHub y HCP, roles plan/apply/deploy/instance separados, permissions boundaries, PassRole exacto, policies por ARN/tag y denegación de ampliación de privilegios. |
| compute | AMI arquitectura aprobada, EC2/EIP, IMDSv2, SSM, bootstrap idempotente sin secretos, root reemplazable; no destroy automático de datos. |
| persistent-storage | EBS cifrado DB/media/journal separado, attachments, identificación UUID estable, no formatear disco existente; prevent_destroy y retención fuera de vida EC2. |
| dns | Usar hosted zone aprobada/importada; A beta hacia EIP, no gestionar apex ni NS del dominio sin autorización. |
| monitoring | métricas/logs/alarms/SNS, retención y presupuesto, falta de heartbeat, alertas fuera del host. |
| snapshot-policy | DLM/AWS Backup según decisión, retención/tag/restore; DB/media separadas de authority. Nunca rollback conjunto de journal. |

Backend remoto **RECOMMENDED HCP Terraform**: cifrado/state history/locking, organización y workspace Beta separados, auto-apply desactivado, acceso MFA y mínimo, backups/export controlado del state. No state en git ni artifacts públicos. El plan oficial consultado ofrece Free hasta 500 managed resources; verificar elegibilidad/precio de la cuenta al adoptar, sin prometer cero costo indefinido. [HCP planes](https://developer.hashicorp.com/terraform/cloud-docs/overview), [remote state](https://developer.hashicorp.com/terraform/language/state/remote).

Recomendación de ejecución: GitHub Actions valida y presenta plan; HCP remote run realiza plan/apply con sus propias credenciales AWS OIDC. **GitHub OIDC no se hereda dentro del runner HCP**. Dos trusts separados: GitHub `aud=sts.amazonaws.com`, `sub=repo:OWNER/REPO:environment:beta-deploy` o branch exacta para plan; HCP `aud/sub` de organización/proyecto/workspace/fase exactos. Dos roles HCP PLAN/APPLY. GitHub usa token HCP de alcance mínimo para solicitar run, no claves AWS largas. Bootstrap inicial de IdPs/roles/state por operador autorizado; Terraform no puede crear su propio acceso de cero sin ese bootstrap. [HCP AWS OIDC](https://developer.hashicorp.com/terraform/cloud-docs/dynamic-provider-credentials/aws-configuration), [AWS trust GitHub](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html).

Plan no lee secrets; permisos read de infraestructura objetivo. Apply sólo recursos Beta/tag/zone permitidos, excepción de wildcard documentada para APIs Create/Describe que lo exijan. Deploy no crea infra ni modifica IAM/DNS/snapshots: SSM SendCommand a instancia tag Beta y documento acotado al digest firmado/aprobado, sin shell arbitrario del payload. SSM/host management sigue sendo poder administrativo y requiere auditoría. Instance role sólo parámetros específicos/logs/SSM y ledger si se aprueba. Backups y restore con roles separados; runtime no puede borrar repositorio completo. Acciones fijadas por commit SHA.

## Diseño Compose Beta

Especificación a implementar tras gates; no presentar servicios futuros como existentes:

| Servicio | Imagen/comando | Persistencia y acceso |
|---|---|---|
| edge | Proxy estático de SPA producción + ACME (Caddy candidato) | publica 80/443, certs/ACME persistentes; fallback SPA para /g; /api proxy; no directorio media público. |
| api | imagen Node mínima de release, main existente | DB/control network; authority configurada; no socket Docker; no LOCAL_ADMIN de desarrollo. |
| postgres | PG16 fijado con soporte backup integrado | `/srv/phoeve/postgres` EBS; sin `ports`; roles dedicados, TLS SQL según contrato; healthcheck. |
| migrate | comando actual de migraciones, one-shot | rol migrator temporal; backup compatible previo; no root data ni journal. |
| media-gateway | runtime nuevo, pendiente de implementación | EBS media, grants temporales y checks por request, sin URL pública al filesystem; subida stream/chunks acotados. |
| worker | runtime nuevo sobre componentes existentes | DB, media/control y supervisor restringido; scratch acotado; deja de claim al drenar. |
| scheduler | runtime nuevo | lock/lease singleton PostgreSQL y hora UTC; catch-up idempotente, heartbeat. |
| backup | pgBackRest y restic candidatos | SQL/data acceso mínimo, destino exterior cifrado; no datos efímeros como única copia. |

No desplegar perfiles dev tools/e2e/local-admin/contracts ni MinIO en Beta de filesystem sin S3. El Compose local se conserva para validación de contratos históricos. Build sin compilador/tests en runtime. Configuración de producción: `WEB_ORIGIN=PUBLIC_ENTRY_BASE_URL=https://beta.phoeve.com`, NODE_ENV=production, localhost-only exceptions deshabilitadas. Validar cookies Secure/HttpOnly/SameSite y CSRF con proxy real, IP cliente confiable para rate-limit y redacción de URL/capacidades en proxy. OpenAPI/docs de operación no expuestos sin decisión. Renovación ACME con ensayo staging y alerta caducidad; certificados y claves fuera de git.

Mount EBS por UUID, permisos del UID real, systemd RequiresMountsFor y marcador de volumen obligatorio: si falta disco, impedir startup; nunca crear directorio vacío equivalente. DB/media/journal no se escriben en root Docker. Datos persisten tras recreate de contenedores/EC2; nunca `compose down -v` en release. Readonly root, tmpfs acotado, no-new-privileges/cap-drop donde compatible. API sin mounts de originales innecesarios. Parser sin salida/socket/credenciales y límites preservados. Docker runtime privilegiado sólo en supervisor y no como montaje universal.

## Recuperación y retención

Contratos preservados: base backup **full diario**, WAL continuo, horizonte mínimo 7 días, RPO DB ≤1 h, RTO servicio ≤4 h, copias protegidas fuera del host. Backups/versiones técnicas respetan máximo 30 días desde el ancla de purga vigente; papelera y ventanas de eliminación no se reinterpretan como retención de backup. Logs 30 días/auditoría 12 meses configurables conforme policy. [Contrato repo](../.codex/context/operations-and-recovery.md), [PITR PostgreSQL16](https://www.postgresql.org/docs/16/continuous-archiving.html).

**RECOMMENDED DB:** pgBackRest con repo externo cifrado y full diario/WAL archive; `archive_timeout` y alerta lag con margen antes de 1 h, test completo sin WAL perdido. `archive_command` no debe declarar éxito antes de copia durable exterior; volumen spool acotado, alerta caída repo y disco/WAL. Retención debe preservar cadenas válidas para todo el horizonte, no sólo borrar por nombre/fecha. Proteger repo de runtime; validar versión/ARM64 en imagen PG. [pgBackRest](https://pgbackrest.org/user-guide.html).

**RECOMMENDED media:** restic cifrado a SFTP/host externo, manifests de objetos inmutables/checksums, staging/scratch excluidos, derivados regenerables identificados. Frecuencia inicial ≤1 h es recomendación, no RPO multimedia ya aprobado: decidir objetivo y semántica de upload confirmado/copia exterior. Restore rechaza originales corruptos/Missing, nunca inventa bytes. Medir throughput/capacidad para RTO y costo por cohorte. [restic destinos](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).

Snapshots EBS complementan recuperación de volumen, no reemplazan base backup/WAL ni PITR. Quiescence consistente, manifests DB/media y snapshots cifrados con retención/purge verificables. No incluir journal en restauración del conjunto histórico. Snapshot de authority no permite volver a un estado revocado anterior. Si el journal más reciente no es demostrable, mantener barrera y acceso cerrado; prohibido bootstrap automático, epoch ficticio o confiar en DB restaurada. Un ledger independiente también necesita protección de permisos contra rollback/delete, consistencia, idempotencia y disponibilidad; nombrar DynamoDB no prueba el protocolo. El historial debe cubrir el horizonte de restore más margen; los floors vigentes y el ancla de actualidad no se eliminan por una TTL de siete días. Compactar sólo con checkpoint acreditado y sin reducir restricciones actuales.

Restore futuro: declarar incidente y barrera exterior → detener writers/leases → reconstruir EC2/mounts aislados → PITR DB y restore media con checksums → obtener autoridad actual con prueba independiente de monotonicidad → reconciliar restricciones, revocaciones, purgas/tombstones → avanzar epoch e invalidar grants/sesiones/leases antiguos → recuperar sólo jobs vigentes idempotentes → pruebas permisos/upload/gallery/download/delete → liberar únicamente scopes acreditados. Journal/keys de recuperación conservados fuera del timeline SQL. No reejecutar emails/exports históricos a ciegas.

## Estimación de costos

**ASSUMED:** us-east-1, Linux On-Demand, 730 h/mes, un IPv4, gp3 sin IOPS adicionales, uso cerrado pequeño. No incluye impuestos/dominio, créditos promocionales ni descuentos por compromiso. Referencia t4g.medium US$0.0336/h de [material AWS](https://d1.awsstatic.com/events/Summits/nysummit24/MIG202-S_Dynatrace_MigrateModernize_E4_NYSummit_20240710.pdf); no precio contractual vigente de región seleccionada. Actualizar cotización antes de apply. EBS/IPv4/Route53 verificados en páginas oficiales; uso snapshots/logs estimado.

| Concepto | USD/mes indicativo |
|---|---:|
| EC2 t4g.medium: 730 × 0.0336 | 24.53 |
| EBS gp3 104 GiB × 0.08 | 8.32 |
| IPv4 730 × 0.005 | 3.65 |
| Hosted zone Route53 (si nueva) | 0.50 |
| Snapshots: supuesto 40 GB retenidos × 0.05 | 2.00 |
| DNS queries + logs/alarms, asignación inicial | 1–3 |
| HCP Free si cuenta elegible | 0 |
| **Subtotal aplicación, sin recuperación exterior** | **40–42** |
| Repositorio externo backups: provisión de presupuesto pendiente | 10–20+ |
| Ledger independiente, asignación tentativa; depende diseño/uso | 1–3+ |
| **Total de planificación con controles completos** | **51–65+** |

[EBS](https://aws.amazon.com/ebs/pricing/), [IPv4](https://aws.amazon.com/vpc/pricing/), [DNS](https://aws.amazon.com/route53/pricing/). Los US$10–20/1–3 son reservas, no ofertas verificadas de proveedor. Cotizar repositorio según full diario/WAL, media y retención real. Un host backup adicional o SFTP contratado requiere autorización, no queda creado ni elegido.

Egress no incluido: AWS publica 100 GB/mes agregados gratis para regiones elegibles; se comparte con otros servicios de la cuenta. Descargas/exports pueden superar esa cantidad rápidamente. Registrar precio regional excedente, volumen y presupuesto. T4g Unlimited cobra surplus CPU (AWS publica US$0.04/vCPU-h Linux), además de EC2: no prometer costo fijo bajo transcodes sostenidos. [AWS On-Demand](https://aws.amazon.com/ec2/pricing/on-demand/). GitHub Actions/registry, SMTP, KMS, retenidos snapshots y crecimiento media pueden sumar costo.

El objetivo US$35–50 parece posible para el núcleo, **no está demostrado para Beta recuperable completa**. Opciones a aprobar: reutilizar repositorio externo ya disponible/acreditado, reducir cohorte/retención sólo dentro de contratos vigentes, o ampliar presupuesto. No omitir PITR/journal para hacer cuadrar la cifra.

## GitHub Actions y orden de despliegue

CI PR: install frozen, builds/typechecks, OpenAPI/client check, tests unit y PostgreSQL real aislado, web/E2E críticos, secret scan, imagen/SBOM/dependency scan; PR de fork sin credenciales y sin workflows pull_request_target ejecutando código no confiable. CI ARM64 nativa para multimedia/digests. Publicación por digest desde revisión protegida; no recompilar en host.

Terraform PR: fmt/validate/tflint/policy y plan redacted, state lock remoto, rol plan limitado, sin secrets de aplicación. No apply PR. Apply futuro: aprobación de plan exacto/commit/config, run autorizado HCP con auto-apply off, permisos apply sólo después de gate, invalidar aprobación si cambia el plan. GitHub environments required reviewers depende plan/visibilidad: Free/Pro/Team sólo public según documentación; confirmar soporte antes de prometer gate en repo privado. Alternativa gate HCP con actor habilitado o plan GitHub elegible, nunca un workflow_dispatch sin validación de aprobador como sustituto. [GitHub approvals](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Deploy aplicación separado de infra: environment Beta, concurrency serial sin cancelación abrupta, OIDC deploy, comprobación digest/release aprobado, backup vigente, mounts/authority saludables → drenar worker/scheduler → migración compatible one-shot → actualizar servicios → readiness/end-to-end → reanudar claims. Rollback sólo imagen/config compatible; nunca DB/journal/EBS histórico automático. Migraciones destructivas y downgrade necesitan procedimiento específico y aprobación.

Secuencia futura:

1. Cerrar CR-011/ADR, proveedores, región, costos, gate de aprobación y owner operativo.
2. Acreditar ARM64/capacidad y artefactos; implementar adapters/runtime en laboratorio aislado.
3. Preparar roots/módulos Terraform y policies; bootstrap state/OIDC con operador autorizado.
4. Revisar plan exacto; solicitar aprobación explícita antes de cualquier apply.
5. Crear red/EC2/EBS según plan aprobado; mount markers, IAM/SSM/secrets; sin datos reales aún.
6. Configurar autoridad exterior y backups; obtener evidencia de persistencia independiente.
7. Desplegar imágenes/Compose, migraciones, provisionamiento admin autorizado sin modo LOCAL_ADMIN.
8. Configurar registro Beta sobre zona aprobada, TLS/renewal; no modificar apex.
9. Ensayar CPU/storage/carga y outage/restore completo con barrera y revocación posterior al punto PITR.
10. Validar RPO/RTO, purgas/copias≤30d, alertas y deny matrix; aprobación de apertura cerrada y rollback operativo.

No avanzar a datos reales mientras el ensayo DR/autoridad sea PENDING. Tickets ordenados: [EL-EP-020](../.codex/product/epics/EL-EP-020.md).
