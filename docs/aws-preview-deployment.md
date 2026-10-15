# Phoeve Beta — despliegue incremental preparado (Fase 1)

Estado: **PREPARADO, NO APROVISIONADO**. No se ha ejecutado `terraform apply`, no se
ha creado ningún recurso facturable, no se ha desplegado nada en AWS y no se ha
tocado ningún contrato aceptado.

Fecha: 2026-10-15. Rama `stage`.

Continúa a [`aws-beta-plan.md`](aws-beta-plan.md) (propuesta y módulos),
[`aws-beta-audit.md`](aws-beta-audit.md) (inventario verificado),
[`aws-beta-ticket-closure-plan.md`](aws-beta-ticket-closure-plan.md) (condiciones de
cierre) y [`adr/s3-recovery-authority-and-media-rpo.proposed.md`](adr/s3-recovery-authority-and-media-rpo.proposed.md)
(EL-TK-245 / CR-011). Este documento no reabre ninguna decisión aceptada: describe
qué queda preparado, qué se probó y qué falta autorizar.

---

## 1. Diagnóstico

El repositorio ya contenía una propuesta de infraestructura y un inventario
auditado, pero **cero artefactos ejecutables**: ningún `*.tf`, ningún Compose de
producción, ninguna imagen de release y ningún workflow fuera del de sincronización
de Issues. Toda la cadena de publicación existía sólo como texto, de modo que
cualquier intento de desplegar habría dependido de improvisación en la consola de
AWS.

Lo que sí estaba verificado y se reutiliza sin cambios:

| Hecho verificado | Evidencia en repositorio |
| --- | --- |
| SPA Angular 21 servida por un servidor propio que sólo usa módulos de Node | `apps/web/spa-server.mjs` (`SPA_HOST`, `SPA_PORT`, `SPA_DIST_DIR`, `PUBLIC_BASE_HREF`) |
| API NestJS con prefijo `api/v1` y health checks separados | `apps/api/src/application.ts`, `/api/v1/health/{live,ready}` |
| La configuración de producción ya es fail-closed para medios locales y administración local | `apps/api/src/platform/config/config.ts` (`localMedia` sólo en desarrollo) |
| Rutas públicas reales (no inventadas) | `admin/auth/login`, `organizer/session/login`, `public/guest-entry/:lookupKey`, `public/beta-access-requests`, `public/guest-session/uploads/presign` |
| Imagen de desarrollo existente y Compose sólo de desarrollo | `infra/development/Dockerfile`, `compose.yaml`, `compose.test.yaml` |

Diagnóstico resultante: **el bloqueo de la Beta no es de código de aplicación, es de
autoridad de recuperación y de superficie de despliegue**. Por eso esta entrega separa
dos fases y publica en Fase 1 únicamente lo que no depende de ningún gate abierto.

## 2. Alcance

### Fase 1 (esta entrega) — superficies seguras

Publicar `beta.phoeve.com` con exactamente tres cosas:

1. La SPA (shell de aplicación servido por `apps/web/spa-server.mjs`).
2. La API bajo `/api/v1`.
3. PostgreSQL 16 persistido en EBS, migrado por un contenedor de un solo uso.

Todo lo demás responde **404** en el borde y además está bloqueado en la propia
aplicación (defensa en profundidad, no una sola capa).

### Fase 2 (bloqueada, no preparada para ejecución)

Login de organizador, creación de eventos, QR y recepción real de fotos y vídeos.
Requiere autoridad de recuperación durable (EL-TK-252) y proveedor de medios
aprobado (EL-TK-251). **No se desbloquea con esta entrega.**

### Fuera de alcance explícito

- No se activa ningún toggle de recuperación ni de autoridad.
- No se publica `api/docs`, `openapi.json`, `/media*` ni `/storage*`.
- No hay MinIO ni almacenamiento productivo en el stack.
- No se usan `LOCAL_ADMIN_ENABLED` ni `LOCAL_MEDIA_UPLOAD_ENABLED` para saltar guards
  (Compose fuerza `NODE_ENV=production` y ambas variables quedan en `0`).
- No se crea ningún evento por SQL, ni se aprovisiona ningún organizador.

Efecto práctico: la Fase 1 publica una aplicación **cerrada y honesta**. Un visitante
puede ver la SPA y enviar una solicitud de acceso Beta; el login de organizador
responde de forma fail-closed (`401`/`403`/`503`), nunca con una sesión válida.

## 3. Inventario de dependencias

| Ticket | Alcance | Estado real tras esta entrega |
| --- | --- | --- |
| EL-TK-245 | Contratos y decisiones de operación Beta | ADR de S3/RecoveryAuthority escrito y commiteado; contratos de despliegue materializados en código (`infra/beta/preflight.mjs`). Decisiones de autoridad y RPO **siguen abiertas** |
| EL-TK-246 | Acreditar ARM64 y capacidad | La AMI ARM64 se resuelve por parámetro SSM y la clase por defecto es `t4g.medium`; ambas quedan en el plan. **Acreditación real pendiente de ejecución en AWS** |
| EL-TK-247 | State remoto y OIDC | Plantilla HCP + roles OIDC plan/apply/deploy validados; backend **no configurado** (bloque `cloud` deliberadamente ausente) |
| EL-TK-248 | Red y compute restringidos | VPC + subnet pública + IGW + SG 80/443 + IMDSv2 hop limit 1 + SSM; `terraform validate` en verde |
| EL-TK-249 | Volúmenes persistentes seguros | Volúmenes db/media cifrados con `prevent_destroy`; autoridad creada sólo con acknowledgement explícito |
| EL-TK-250 | DNS Beta acotado | Un único registro A sobre zona existente (la zona no se gestiona); `prevent_destroy` |
| EL-TK-251 | Gateway filesystem privado | **No implementado**. Sin servicio de worker, sin gateway y sin `/media` publicado |
| EL-TK-252 | Autoridad antirollback Beta | **No implementado**. Volumen de autoridad desactivado por defecto y excluido de la política de snapshots |

EL-TK-253 (worker), EL-TK-254 (scheduler) y EL-TK-255 (imágenes reproducibles con
SBOM/provenance) **no** se abordan: el Compose Beta no incluye worker ni scheduler, y
la reproducibilidad por digest + atestación sigue pendiente. Las imágenes construidas
localmente son de validación, no releases firmadas.

## 4. El contrato de despliegue

El contrato no es un documento: es código que se ejecuta y falla.

`infra/beta/preflight.mjs` valida, en un solo paso:

| Bloque | Qué comprueba |
| --- | --- |
| Environment | que las variables requeridas existen, que no quedan placeholders `REPLACE_WITH_*`, que `PUBLIC_ENTRY_BASE_URL` es `https://beta.phoeve.com` sin credenciales/query/path, que el borde es el host publicado, que la contraseña y el pepper no son los de desarrollo y que no hay ninguna clave desconocida |
| Compose | que existen exactamente los servicios `postgres`, `migrate`, `api`, `web`, `edge`; que no aparece MinIO, worker, scheduler, ni `5432`/`3000`/`4200`/`9000` publicados; que `api` y `web` son `read_only`; que hay healthchecks; que las variables obligatorias usan `:?` |
| Edge | que el Caddyfile tiene `admin off`, que los límites de memoria están definidos y que no hay `file_server` publicando un directorio de medios |
| Probe | contra un origen ya desplegado: estados esperados por endpoint, declarados en dos tablas únicas (`PUBLISHED_SURFACE`, `BLOCKED_CAPABILITIES`), sin ninguna respuesta `5xx` que no sea el `503` fail-closed documentado |

El probe ya **no** acepta «cualquier rechazo». La tabla de estados esperados es una
sola, exportada y única para todo el sistema (`infra/beta/preflight.mjs`), y la usan
por igual el CLI local, el workflow y el host:

| Bloque | Contenido | Regla |
| --- | --- | --- |
| `PUBLISHED_SURFACE` (9 peticiones) | `/api/v1/health/live`, `/api/v1/health/ready`, `/`, y las rutas que deben responder `404` (`openapi`, `docs`, `media`, `storage`) | **`200` exacto** donde la superficie es pública; `404` exacto donde debe estar cerrada |
| `BLOCKED_CAPABILITIES` (6 peticiones) | login admin, login organizador, alta de organizadores, listado de eventos, presign de subida | Conjunto **explícito** de estados de rechazo por endpoint, cada uno con su `reason`; cualquier otro estado, incluido un `5xx`, es fallo |

Reglas de fail-closed, explícitas:

- Un `200` en cualquier capacidad bloqueada es **FAIL**.
- Un `500` (o cualquier `5xx`) es **FAIL**, salvo el `503` que está declarado como
  resultado esperado de «autoridad no disponible».
- Un estado no declarado para un endpoint es **FAIL**, aunque sea un `4xx`.
- El fallo cerrado sigue siendo correcto: un `503` de autoridad no disponible se
  declara como rechazo esperado, no como éxito ni como ambigüedad.

Transporte (`--probe-loopback`): el probe del host no resuelve el DNS público para
comprobarse a sí mismo. `loopbackFetch(address = '127.0.0.1')` fija la dirección de
conexión al loopback, conserva la cabecera `Host` y el `servername` del origen
publicado (`beta.phoeve.com`) y usa un `timeout` de 10 s. Así la validación atraviesa
el borde real —TLS y verificación del certificado incluidos— sin depender de DNS ni de
la ruta externa.

Guard rails que impiden una publicación accidental (Terraform, evaluados en plan):

| Guard rail | Implementación |
| --- | --- |
| Sólo la etapa Beta | `validation` sobre `environment` en el root |
| Sólo `us-east-1` | `validation` sobre `region` en el root |
| El volumen de autoridad no se crea sin decisión | `precondition`: `enable_authority_volume` exige `authority_gate_acknowledged` |
| La política de snapshots no se activa sin reconocer que es complementaria | `precondition` equivalente |
| Los datos no se destruyen por un apply rutinario | `lifecycle { prevent_destroy = true }` en volúmenes y registro DNS |
| La autoridad nunca se rebobina con la base de datos | El tag `SnapshotPolicy` sólo se escribe en volúmenes operativos |
| El rol de despliegue no crea infraestructura y no elige qué ejecuta el host | Políticas separadas (plan/apply/deploy) y **un único documento SSM propio**; el rol sólo puede invocar ese documento, nunca `AWS-RunShellScript` |
| Un release no puede activarse sobre un esquema que no conoce | Gate `forward` antes de conmutar el symlink; si la base tiene migraciones que la imagen no trae, el despliegue se aborta sin tocar el stack |
| Un rollback no puede cruzar una migración no certificada | Gate `backward` con declaraciones revisadas por migración (`infra/beta/migration-compatibility.json`); por defecto no certifica ninguna |

### El documento SSM restringido (control del hallazgo 1)

El host ejecuta un único punto de entrada fijo (`/usr/local/sbin/phoeve-deploy`) y el
rol de despliegue ya no puede enviar un script arbitrario:

| Pieza | Ruta | Qué garantiza |
| --- | --- | --- |
| Documento | `infra/terraform/modules/identity/templates/deploy-command.json` (aplicado con `aws_ssm_document.deploy`, nombre `phoeve-beta-deploy`) | Versionado en Terraform y revisable en el diff; declara `schemaVersion 2.2` y **un solo** parámetro de acción con `allowedValues` (`deploy`, `rollback`, `verify`, `status`) |
| Parámetros de imagen | mismos parámetros `apiImage`/`webImage` con `allowedPattern` | Sólo acepta referencias fijadas por digest (`…@sha256:` + 64 hex). Un tag móvil, un digest corto, mayúsculas o cualquier sufijo (`; id`, `$(…)`) son rechazados **por SSM**, antes de contactar la instancia |
| Guion del documento | `runCommand` del propio documento | Fijo: valida otra vez el digest, y sólo entonces hace `exec /usr/local/sbin/phoeve-deploy`. El llamante no aporta ninguna línea de shell |
| Permisos | `infra/terraform/modules/identity/main.tf` | `ssm:SendCommand` se limita al ARN de ese documento y a instancias con `Project=phoeve`/`Environment=beta`. No existe ningún ARN `document/AWS-*` en el módulo |
| Workflow | `.github/workflows/deploy-beta.yml` | Envía `action` + imágenes como JSON construido con `jq`; no usa `commands=[…]`, no menciona `AWS-RunShellScript` y comprueba el digest con la misma expresión que el documento |

Contrato verificable sin AWS: `infra/beta/deployment-controls.test.mjs` afirma que el
documento no contiene `AWS-RunShellScript`, que sólo interpola parámetros validados y
nunca en una línea `exec`, que el patrón de digest del guion es idéntico al declarado
por los parámetros, y que la política del rol no otorga `ssm:SendCommand` sobre ningún
recurso comodín.

### Compatibilidad de rollback (control del hallazgo 4)

`infra/beta/rollback-compatibility.mjs` decide si un movimiento entre dos releases es
admisible, con dos modos y **fail-closed por defecto**:

| Modo | Pregunta | Rechaza cuando |
| --- | --- | --- |
| `forward` | ¿la imagen que se va a activar conoce todas las migraciones ya aplicadas? | la base tiene migraciones que esa imagen no trae |
| `backward` | ¿la imagen a la que se vuelve es compatible con el esquema actual? | el destino espera migraciones que la base nunca recibió, o hay migraciones posteriores al destino que no están declaradas `backward-compatible` |

Las declaraciones viven en `infra/beta/migration-compatibility.json` y las revisa un
humano: `default: forward-only` y `reviewed: {}` significan que **ningún** rollback
puede cruzar una migración. Declarar una migración como `backward-compatible` es una
decisión explícita y trazable. El manifiesto de cada release
(`packages/database/prisma/migration-manifest.json`, generado por
`scripts/database.mjs`) viaja dentro de la imagen y se copia a
`$PHOEVE_ROOT/releases/<id>/` al desplegar.

El gate `forward` se ejecuta **antes** de activar, con la imagen nueva y `--network
none`: si la imagen no puede ejecutar `node`, el despliegue se aborta sin tocar el
stack en marcha. El gate `backward` corre con la imagen del release que se reemplaza,
que es la que revisó las declaraciones.

## 5. Arquitectura preparada

```
Internet
  │  DNS: un único A  beta.phoeve.com → Elastic IP
  ▼
[VPC 10.60.0.0/16 · subnet pública 10.60.1.0/24 · IGW]   ← sin NAT Gateway, sin ALB
  │  Security group: inbound 80/443 · egress 443 / 53 / 123
  ▼
EC2 ARM64 (Amazon Linux 2023, IMDSv2 hop limit 1, sin key pair, administrado por SSM)
  │
  ├── edge (Caddy)         publica 80/443 · ACME · deny 404 de docs/openapi/api/media/storage
  ├── web  (spa-server)    red interna · sirve el build Angular verificado
  ├── api  (NestJS)        red interna · NODE_ENV=production · read_only
  ├── migrate              contenedor de un uso · migraciones y manifiesto
  └── postgres 16          red interna · sólo datos, nunca publicado
  │
  ├── EBS postgres   (gp3, cifrado, prevent_destroy, tag SnapshotPolicy)
  ├── EBS media      (gp3, cifrado, prevent_destroy, tag SnapshotPolicy) — preparado, sin uso
  └── EBS authority  (gp3, cifrado, prevent_destroy, SIN tag de snapshots) — no creado por defecto
```

Decisiones de seguridad que se mantienen del plan aceptado:

- **Sin SSH.** Ni key pair, ni puerto 22. La administración es SSM Session Manager, y
  el rol de instancia sólo puede leer parámetros SSM, escribir logs y hablar con SSM.
- **Sin secretos en Terraform.** Las credenciales viven en SSM `SecureString` y se
  materializan en el host como `/srv/phoeve/beta/app.env` (`0600`) mediante
  `render-env.sh`. Nunca pasan por el state, por el bundle ni por Git.
- **Sin claves AWS de larga duración en GitHub.** El workflow de despliegue cambia un
  token OIDC por una sesión corta y sólo puede pedir la ejecución de un punto de
  entrada fijo en el host.
- **Bundle dentro de la imagen.** El host extrae `infra/beta/**` de la propia imagen
  de release (`docker create` + `docker cp`), de modo que se despliega exactamente la
  revisión que corresponde a la imagen, no una copia divergente.
- **Releases atómicas con rollback.** Symlink conmutado (`current`/`previous`),
  preflight dentro de la imagen y vuelta atrás automática si el smoke falla.

## 6. Artefactos entregados

| Ruta | Función |
| --- | --- |
| `infra/beta/Dockerfile` | Imágenes de release multi-stage: `api` (NestJS + migraciones) y `web` (SPA verificada) |
| `infra/beta/compose.yaml` | Stack `phoeve-beta`: 5 servicios, red interna, límites, healthchecks, `read_only` |
| `infra/beta/Caddyfile` | Borde: TLS, headers, deny 404 de todo lo no publicado |
| `infra/beta/beta.env.example` | Contrato de variables con placeholders (nunca desplegable) |
| `infra/beta/preflight.mjs` | Contrato ejecutable (env + Compose + borde) **y** probe de la superficie publicada: `PUBLISHED_SURFACE` + `BLOCKED_CAPABILITIES`, transporte `loopbackFetch` y flag `--probe-loopback` |
| `infra/beta/preflight.test.mjs` | 25 pruebas del contrato (incluye `500` → FAIL y el transporte loopback contra un servidor real) |
| `infra/beta/rollback-compatibility.mjs` | Gate de compatibilidad entre releases (`forward`/`backward`), fail-closed, con CLI propia |
| `infra/beta/migration-compatibility.json` | Declaraciones revisadas por migración; por defecto no certifica ningún rollback |
| `infra/beta/rollback-compatibility.test.mjs` | 29 pruebas del gate, incluidos los rechazos y los códigos de salida del CLI |
| `infra/beta/deployment-controls.test.mjs` | 31 pruebas de los invariantes del documento SSM, la política del rol, el workflow, el punto de entrada y la coherencia de `app.env` |
| `infra/beta/deploy/bootstrap-host.sh` | Preparación del host: Docker, volúmenes por UUID, marcador de volumen, unidad systemd |
| `infra/beta/deploy/render-env.sh` | Materializa secretos desde SSM al fichero `0600` |
| `infra/beta/deploy/mount-guard.sh` | Verifica que el volumen correcto está montado antes de arrancar |
| `infra/beta/deploy/phoeve-deploy` | Punto de entrada estable: `deploy` / `rollback` / `verify` / `status`; digest obligatorio, gates de migración, probe por loopback y persistencia de las imágenes en `app.env` |
| `infra/beta/deploy/phoeve-beta.service` | Unidad oneshot con `RequiresMountsFor` |
| `infra/terraform/modules/identity/templates/deploy-command.json` | Documento SSM restringido (`aws_ssm_document.deploy`): acción con `allowedValues` y refs de imagen con `allowedPattern` |
| `infra/terraform/modules/*` | `network`, `compute`, `persistent-storage`, `dns`, `monitoring`, `snapshot-policy`, `identity` |
| `infra/terraform/environments/bootstrap` | Identidad de cuenta (OIDC GitHub/HCP, roles) |
| `infra/terraform/environments/beta` | Stack publicado |
| `infra/terraform/README.md` | Orden de operaciones, guard rails y comandos |
| `.github/workflows/ci.yml` | Contrato + compatibilidad de rollback + controles de despliegue + `shellcheck` de los scripts + sintaxis Compose + Terraform estático + higiene de repositorio |
| `.github/workflows/terraform-plan.yml` | Validación estática en PR de infraestructura y aviso de dónde vive el plan autoritativo |
| `.github/workflows/deploy-beta.yml` | Despliegue manual, digest obligatorio, entorno protegido, invocación del documento SSM restringido (`phoeve-beta-deploy`), sin guion propio |

## 7. Pruebas ejecutadas (evidencia)

Todas son locales. Ninguna crea recursos ni factura.

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Contrato unitario | `node --test infra/beta/preflight.test.mjs` | **25/25 PASS** (7 suites) |
| Compatibilidad de rollback | `node --test infra/beta/rollback-compatibility.test.mjs` | **24/24 PASS** (7 suites) |
| Controles de despliegue (SSM/rol/workflow/host) | `node --test infra/beta/deployment-controls.test.mjs` | **31/31 PASS** (6 suites) |
| Sintaxis de los scripts del host | `bash -n` sobre los cuatro scripts y `shellcheck -S style` | **exit 0**, sin avisos |
| El fichero de ejemplo no es desplegable | `node infra/beta/preflight.mjs --env-file infra/beta/beta.env.example` | **FAIL esperado** (placeholders detectados) |
| Contrato estático con entorno válido | `preflight.mjs --env-file <env local> --allow-local-edge --allow-tag-images` | **PASS** |
| Sintaxis Compose | `docker compose --env-file … -f infra/beta/compose.yaml config --quiet` | **exit 0** |
| Configuración del borde | `caddy validate --config /etc/caddy/Caddyfile` | **Valid configuration**, sin avisos |
| Terraform formato | `terraform fmt -check -recursive infra/terraform` | **exit 0** |
| Terraform validez (bootstrap) | `terraform init -backend=false && terraform validate` | **Success! The configuration is valid.** |
| Terraform validez (beta) | `terraform init -backend=false && terraform validate` | **Success! The configuration is valid.** |
| Guard rail positivo | `terraform plan -refresh=false -target=terraform_data.guard_rails` | **exit 0** (gates cerrados) |
| Guard rail negativo | igual, con `enable_authority_volume=true` sin acknowledgement | **exit 1** — «enable_authority_volume requires authority_gate_acknowledged» |
| Stack real levantado | `docker compose up -d` (imágenes `beta-local`, borde en `127.0.0.1:8080`) | postgres/migrate/api/web/edge **OK**, migraciones aplicadas |
| Probe del contrato publicado | `preflight.mjs --probe http://localhost:8080 --probe-only --probe-loopback` | **15/15 PASS**, «the published surface matches the contract» |
| Cabeceras del borde | `curl -I http://localhost:8080/` | HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag`, sin `Server` |
| Sólo el borde publica puertos | `docker compose ps` | `api`/`web`/`postgres` sin puertos de host; sólo `edge` publica |

Respuestas reales observadas en el probe (fail-closed, ninguna sesión concedida):

```
GET  /api/v1/health/live                         200
GET  /api/v1/health/ready                        200
GET  /api/v1/openapi.json                        404
GET  /api/docs                                   404
GET  /media/anything                             404
GET  /storage/anything                           404
POST /api/v1/admin/auth/login                    401
POST /api/v1/organizer/session/login             403
POST /api/v1/admin/organizers                    401
GET  /api/v1/events                              401
POST /api/v1/public/guest-session/uploads/presign 400
GET  /                                           200
```

Defectos reales encontrados por estas pruebas y corregidos (no cosméticos):

1. El check de MinIO daba falso positivo por la palabra «MinIO» dentro de un
   comentario del Compose → se ignoran comentarios antes de evaluar.
2. La primera versión del probe aceptaba «cualquier respuesta `>= 400`» como rechazo
   correcto. Ese criterio es demasiado débil: un `500` —es decir, la aplicación rota o
   a medio arrancar— habría contado como éxito. Hoy la tabla de estados esperados es
   explícita por endpoint y cualquier `5xx` distinto del `503` documentado es **FAIL**
   (véase el hallazgo 2 en la sección 14).
3. La migración fallaba con `EACCES` porque `scripts/database.mjs` reescribe
   `packages/database/prisma` y el directorio pertenecía a `root` → el stage `api`
   ahora hace `chown` al usuario de runtime.
4. `terraform fmt` detectó dos condicionales multilínea inválidos en `identity` y
   `terraform validate` dos referencias rotas (`user_data.sh.tftpl` inexistente y
   `aws_iam_policy_document.dlm` mal nombrado) → corregidos; ambas raíces validan.
5. El rol de despliegue podía invocar `AWS-RunShellScript`, es decir, ejecutar
   cualquier script como root en el host de producción → sustituido por un documento
   SSM propio y versionado (hallazgo 1).
6. `deploy()` no persistía `PHOEVE_API_IMAGE`/`PHOEVE_WEB_IMAGE` en `app.env`
   (`render-env.sh` no las escribe) mientras el preflight y Compose las exigen desde
   ese fichero: un despliegue real habría abortado en el preflight, y un
   `docker compose up` manual habría arrancado un par de imágenes que nadie pidió
   (hallazgo 5, más abajo).

### Pruebas que NO se pueden hacer sin AWS (pendientes, no afirmadas)

- Arranque real de la instancia, adjuntado y montaje de volúmenes EBS por UUID.
- Emisión de certificado ACME sobre `beta.phoeve.com` (requiere DNS real y puerto 80).
- Funcionamiento de SSM Session Manager con el egress restringido configurado.
- Compatibilidad ARM64 acreditada de todas las dependencias en la instancia.
- Restauración desde snapshot y desde el repositorio de backups aprobado.
- Cualquier medida de RPO/RTO: **sin autoridad de recuperación no se declara ningún
  RPO**.

## 8. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación preparada |
| --- | --- | --- |
| Publicar por accidente una capacidad bloqueada | Alta | Doble control: deny 404 en el borde + fail-closed en la aplicación; el probe falla si algo bloqueado responde con éxito |
| Crear recursos facturables sin autorización | Alta | Nada se aplica desde CI; HCP queda como candidato sin configurar; apply sólo con aprobación registrada |
| Fuga de secretos al state o a Git | Alta | Secretos sólo en SSM `SecureString`; `.gitignore` bloquea `*.tfvars`, `backend.hcp.tf` y state; CI falla si aparecen |
| Destrucción accidental de datos | Alta | `prevent_destroy` en volúmenes y DNS; el apply exige cambio de código y aprobación |
| Rebobinar la autoridad junto con la base de datos | Alta | El volumen de autoridad no lleva tag de snapshots y está desactivado por defecto |
| Un `EBS` aislado presentado como autoridad | Alta | Excluido por diseño: la autoridad requerirá proveedor y ancla externa decididos (EL-TK-252) |
| Egress restringido rompe SSM/registry/ACME | Media | Reglas documentadas (443/53/123) y prueba de arranque pendiente en el primer aprovisionamiento autorizado |
| Rollback deja el stack a medias | Media | Symlink atómico, `previous` conservado, rollback automático ante fallo de smoke, poda a 3 releases |
| Rebuild silencioso de caché por `.dockerignore` | Baja | El ensamblado de Prisma se regenera dentro de la imagen desde los esquemas por owner, versionados |
| Coste superior al previsto | Media | Presupuesto mensual con SNS; sin NAT Gateway ni ALB, que son los dos mayores saltos de coste |
| Deriva entre bundle e imagen | Media | El bundle se extrae de la propia imagen de release, no de un artefacto aparte |

## 9. Coste

Los importes dependen de precios vigentes y de la cuenta, y **no se verificaron en
esta sesión**: deben confirmarse en la calculadora de AWS antes de aprobar. Lo que sí
está determinado es el consumo previsto.

| Componente | Base | Nota |
| --- | --- | --- |
| EC2 `t4g.medium` | 24×7 | Instancia única; el tipo se confirma antes del apply |
| EBS gp3 | 30 (raíz) + 30 (postgres) + 40 (media) GiB | `media` preparado aunque sin uso; `authority` no se crea |
| Elastic IP | 1 | Adjunta a una instancia en ejecución |
| Route 53 | 1 registro A | Sobre zona existente; la zona no se crea |
| CloudWatch Logs | retención 30 días | Volumen bajo en Fase 1 |
| SNS | 1 tópico + suscripciones | Alarmas y presupuesto |
| Snapshots EBS | sólo si se habilita la política | Desactivada por defecto; requiere acknowledgement |

Se ha configurado un presupuesto mensual de **60 USD** como aviso, no como límite
duro: es una notificación, no un freno técnico. Ausencias deliberadas que contienen
el coste: **no hay NAT Gateway, ni Application Load Balancer, ni RDS, ni S3
productivo**. Añadir cualquiera de los dos primeros multiplica el coste base y
requiere su propia decisión.

## 10. Rollback

Tres niveles, todos disponibles sin aprovisionamiento nuevo.

| Nivel | Acción | Efecto sobre datos |
| --- | --- | --- |
| Release | `phoeve-deploy rollback` conmuta el symlink a la release anterior y reinicia el stack; es automático si el smoke falla durante un despliegue | Ninguno; sólo cambia el código en ejecución, y sólo si el gate `backward` lo certifica (si no, se rechaza con exit 1 y no se toca nada) |
| Stack | `docker compose down` en el host | Ninguno; los volúmenes permanecen montados |
| Infraestructura | `terraform destroy` **bloqueado por `prevent_destroy`** | Exige modificar código y aprobación explícita |

Un fallo de datos (por ejemplo, una migración destructiva) **no** se resuelve con
rollback de release: requiere el procedimiento de recuperación aprobado, que hoy no
existe para medios (EL-TK-245/EL-TK-252). Esa es precisamente la razón por la que la
Fase 2 permanece bloqueada.

## 11. Aprobaciones requeridas antes de aprovisionar

Ninguna de estas aprobaciones está concedida:

1. **Cuenta y región**: cuenta AWS destino y confirmación de `us-east-1`.
2. **Backend remoto**: organización y proyecto de HCP Terraform, nombre de los
   workspaces (`bootstrap` y `beta`) y **auto-apply desactivado**.
3. **Adjunto de la política de apply**: el rol de apply de HCP es amplio por
   necesidad (`ec2:*` de creación, IAM, logs, SNS, Route 53, DLM, budgets); su
   adjunto a la organización requiere revisión y firma.
4. **Identidad GitHub**: repositorio real (`owner/name`) y comprobación del entorno
   `beta` con **`required reviewers` configurados y evidenciados** (`gh api
   repos/{owner}/{repo}/environments/beta`). Sin revisores, el entorno sólo aporta el
   binding OIDC, no una aprobación humana (véase §14, hallazgo 3).
5. **Correo ACME**: buzón que recibirá los avisos de expiración del certificado.
6. **Clase de instancia** y **capacidad/cuotas** de EBS en la cuenta
   (volúmenes gp3 y capacidad total).
7. **Snapshots**: decidir si se activa la política DLM, con qué retención, y aceptar
   por escrito que son complementarios y **no** la vía de recuperación aprobada.
8. **Recuperación**: proveedor de autoridad, ancla externa, rango de RPO y toggles de
   recuperación (EL-TK-245 / EL-TK-252). Sin esto, `enable_authority_volume` no puede
   activarse y la Fase 2 no arranca.
9. **Medios**: proveedor de almacenamiento de la Beta (EL-TK-251) antes de publicar
   cualquier ruta de subida real.
10. **Presupuesto**: importe mensual definitivo y buzones suscritos al topic de
    alertas (cada suscripción requiere confirmación por correo).

## 12. Runbook de aprovisionamiento (descrito, no ejecutado)

Se documenta el orden para que la aprobación se dé sobre un procedimiento concreto.
**Ningún paso se ha ejecutado.**

1. Copiar `infra/terraform/environments/{bootstrap,beta}/backend.hcp.tf.tpl` a
   `backend.hcp.tf` y rellenar organización/workspace (no se commitea).
2. `terraform -chdir=infra/terraform/environments/bootstrap init && plan`; revisar y
   **aplicar con aprobación** (crea OIDC de GitHub, rol de despliegue y, si se
   autoriza, roles HCP).
3. Igual en `environments/beta`: revisar el plan y aplicar. Anotar las salidas
   (`instance_id`, `elastic_ip`, `database_volume_id`, `media_volume_id`).
4. `phoeve-deploy bootstrap-host` por SSM Session Manager, pasando los ids de volumen;
   verificar el montaje por UUID y el marcador `/srv/phoeve/beta/<mount>/.phoeve-volume-id`.
5. Crear en SSM los parámetros `SecureString` (`postgres-password`,
   `identity-pepper`) y ejecutar `render-env.sh` en el host.
6. Construir y publicar las imágenes de release fijadas por digest.
7. Lanzar `deploy-beta.yml` a mano con esas referencias; exige confirmación, pasa por
   el entorno protegido y ejecuta el punto de entrada por SSM.
8. Verificar la superficie publicada: el workflow corre el probe del contrato dentro de
   la imagen desplegada; comprobar además la SPA a mano.
9. Registrar la evidencia en `.codex/product/sessions/` (fichero local; sólo se
   commitea si se añade a la allow-list de `.gitignore`) y ajustar el estado de los
   tickets sólo cuando sus gates reales se cierren.

Criterios de parada que obligan a detenerse y volver a pedir autorización: cualquier
`terraform apply` que pretenda crear o destruir volúmenes, cualquier cambio en la
zona DNS, cualquier ampliación de permisos IAM, y cualquier intento de habilitar
login de organizador, subida de medios o el volumen de autoridad.

## 13. Límites de esta entrega (declaración explícita)

- No se aprovisionó, compró, desplegó ni publicó nada.
- No se modificó ningún contrato aceptado ni ningún estado de ticket por alcanzar un
  umbral de preparación.
- No se implementó EL-TK-251 ni EL-TK-252, y no se presentan como hechos.
- No se declaró ningún RPO, RTO ni garantía de recuperación.
- Las imágenes locales son de validación, no releases firmadas con SBOM/provenance.
- Las acreditaciones ARM64, ACME, SSM y de restauración quedan pendientes de
  ejecución real.

## 14. Controles revisados antes del primer `plan` (hallazgos y correcciones)

Los cuatro hallazgos de esta revisión se corrigieron **antes** de pedir autorización
para el primer `plan`. Dos se cerraron con código y pruebas (1 y 2), uno es una
corrección de código con evidencia de integración (4), y uno se documenta porque la
mitigación real es operativa, no de configuración (3).

### Hallazgo 1 — el rol de despliegue podía ejecutar cualquier cosa

Estado anterior: la política del rol incluía `ssm:SendCommand` sobre
`arn:aws:ssm:<región>::document/AWS-RunShellScript`. Cualquier proceso que asumiera ese
rol (un workflow, o un token OIDC robado con el mismo `sub`) podía pedir al host que
ejecutase un script arbitrario **como root**, incluido leer los secretos de la
instancia. Los permisos de la instancia (SSM + egress) no limitan eso: el script lo
ejecuta el agente como root.

Corrección: `AWS-RunShellScript` desaparece del módulo. Se crea un documento propio
versionado en Terraform (`phoeve-beta-deploy`, contenido en
`templates/deploy-command.json`) y `ssm:SendCommand` se limita a su ARN. El llamante
sólo aporta:
- `action`, con `allowedValues` (`deploy`, `rollback`, `verify`, `status`);
- `apiImage`/`webImage`, con `allowedPattern` que exige `…@sha256:` + 64 hex.

Y el documento, que nadie puede modificar desde la API, decide qué se ejecuta:
`exec /usr/local/sbin/phoeve-deploy`. La validación del digest se repite dentro del
documento y en el workflow, así que un tag móvil o una inyección (`; id`, `$(…)`) se
rechazan por SSM antes de tocar la instancia.

Contrato verificado sin AWS: `infra/beta/deployment-controls.test.mjs` (31 pruebas).

### Hallazgo 2: el probe aceptaba como correcto cualquier rechazo

La regla anterior (`>= 400` = rechazo correcto) convertía un `500` en un éxito. Un
stack a medio arrancar habría pasado la verificación posterior al despliegue.

Corregido: tabla de estados esperados **única y exportada** en `preflight.mjs`
(`PUBLISHED_SURFACE` para los 9 endpoints publicados, `BLOCKED_CAPABILITIES` para los 6
bloqueados, cada uno con su `reason`), `200` exacto donde la superficie es pública,
conjuntos explícitos de rechazo en los fail-closed, y **`500` = FAIL**. El transporte
`loopbackFetch()` (cabecera `Host` y SNI del origen publicado, conexión fijada a
`127.0.0.1`, `timeout` 10s, `--probe-loopback`) permite validar el borde real con TLS
sin depender del DNS público. El punto de entrada del host ya no duplica la tabla: se
limita a ejecutar el probe del bundle.

### Hallazgo 3: qué aplica realmente el environment `beta` de GitHub

El workflow declara `environment: beta`. Eso produce dos efectos distintos, y sólo uno
de ellos es una aprobación humana:

| Efecto | ¿Se aplica hoy? | Detalle |
| --- | --- | --- |
| El job se pausa antes de empezar hasta cumplir las *protection rules* del environment | Sí | Sin protection rules la pausa se resuelve al instante: **no hay revisión**. |
| Un humano debe aprobar la ejecución (*required reviewers*) | **Sólo si el environment tiene revisores configurados** | Es configuración de GitHub, no del repositorio, y no se puede verificar ni versionar desde aquí. |
| El rol de AWS sólo acepta el `sub` `repo:<owner>/<repo>:environment:beta` | Sí | `StringLike` sobre un repositorio validado como `owner/name` (sin comodines), de modo que una ejecución fuera del environment no puede asumir el rol. |
| El input `confirmation` exige escribir `deploy` | Sí | Es una salvaguarda contra clics accidentales, **no** una aprobación: cualquiera con permiso de dispatch puede escribirla. |

Fallo silencioso a documentar: si el environment `beta` no existe o existe sin revisores,
GitHub lo crea o lo acepta y el job corre **sin ninguna aprobación humana** después del
dispatch. El binding OIDC sigue evitando que otra ejecución asuma el rol, pero no añade
un revisor.

Alternativas registradas, por orden de preferencia (hallazgo sólo documental: no se
cambió ningún control en esta entrega):

1. **Configurar `required reviewers`** en el environment `beta` (con `prevent
   self-review` cuando haya más de un aprobador) y comprobarlo con
   `gh api repos/{owner}/{repo}/environments/beta` antes del primer despliegue. Es la
   única forma de que el environment signifique una aprobación.
2. **Operar por SSM Session Manager**: un operador autorizado lanza
   `/usr/local/sbin/phoeve-deploy` con las referencias fijadas por digest. Es el control
   más fuerte, porque no depende de ninguna configuración de GitHub, y coincide con el
   criterio de parada del runbook (la infraestructura la aplica un humano autorizado).
3. **Gate en HCP Terraform** para todo lo que sí sea infraestructura: `auto-apply`
   desactivado y revisores en el workspace. Nada de esto se ha configurado todavía.

Lo que **no** se acepta como control: un `workflow_dispatch` cuyo «aprobador» sea el
propio input de confirmación, o un job que asuma el rol de despliegue sin environment.
Evidencia pendiente (requiere el repositorio real): `gh api
repos/{owner}/{repo}/environments/beta` mostrando `required_reviewers`.

### Hallazgo 4: rollback entre imágenes, migraciones y esquema PostgreSQL

Un rollback de release sólo conmutaba el symlink: si la release anterior no conocía el
esquema actual (o al revés), el resultado era una aplicación rota o una mutación de
datos silenciosa. Corregido con dos gates fail-closed (descritos en §4) y un fichero de
declaraciones revisadas: `migration-compatibility.json`, con `default: forward-only` y
`reviewed: {}`, no certifica **ninguna** migración por defecto. Sin una declaración
explícita, el rollback que cruza una migración se **rechaza** (exit 1).

### Hallazgo 5 (defecto adicional, encontrado al revisar el host)

`render-env.sh` no escribe `PHOEVE_API_IMAGE`/`PHOEVE_WEB_IMAGE`, pero el preflight y
Compose las exigen desde `app.env`. Un despliegue real habría fallado en el preflight, y
un `docker compose up` manual podría haber arrancado un par de imágenes no solicitadas.
`deploy()` ahora persiste atómicamente las referencias (modo `0600`) en `app.env` en el
momento de activar, junto con `release.env` y `migration-manifest.json` por release en
`$PHOEVE_ROOT/releases/<id>`; `app.env` siempre describe lo que está en marcha, porque es
la única fuente de imágenes para Compose. `render-env.sh` conserva esas dos líneas al
volver a renderizar secretos (una rotación de pepper no puede dejar el stack sin poder
arrancar).

## 15. Decisión de preparación para el primer `plan`

| Control | Estado | Evidencia |
| --- | --- | --- |
| El rol de despliegue no puede ejecutar guiones arbitrarios | **Cerrado** | Documento SSM propio + política limitada a su ARN; 31 pruebas de invariantes |
| El probe no acepta un `5xx` como rechazo correcto | **Cerrado** | Tabla única de estados esperados; 25 pruebas; 15/15 endpoints reales con `--probe-loopback` |
| El environment `beta` no se presenta como aprobación si no la da | **Documentado** | §14, hallazgo 3: `required reviewers` es configuración de GitHub y se comprueba con `gh api`; alternativa por Session Manager registrada |
| Rollback acreditado entre imagen, migraciones y esquema | **Cerrado** | Gates `forward`/`backward` + declaraciones revisadas; 24 pruebas; gate `forward` real contra las 64 migraciones del manifiesto → exit 0 |
| Las imágenes que se van a ejecutar se publican en `app.env` | **Cerrado** | Escritura atómica en `deploy()` y conservación al regenerar secretos; defecto reproducido al revisar el host (hallazgo 5) |
| Infraestructura Terraform válida y con guard rails | **Cerrado** | `fmt -check -recursive` y `validate` en verde; guard rail negativo con exit 1 |

**Decisión: la Fase 1 está lista para un primer `terraform plan`, y no para un `apply`.**

- El `plan` es de sólo lectura, pero se ejecuta sobre credenciales reales: requiere las
  aprobaciones 1, 2, 3 y 4 de §11 concedidas **antes** de lanzarlo.
- Un `apply` requiere además las aprobaciones 5 a 10, y que la revisión del plan se haga
  sobre el plan autoritativo (no sobre este documento).
- Los controles de hallazgo 3 que dependen de configuración de GitHub deben comprobarse
  y registrarse antes del primer despliegue, no antes del primer plan.
- No se aprovisionó, compró, desplegó ni publicó nada, y no se declara ningún umbral de
  preparación que no esté respaldado por las evidencias de §7.

**El siguiente paso no es aplicar: es autorizar.** Se requiere aprobación expresa para
cualquier operación cloud.
