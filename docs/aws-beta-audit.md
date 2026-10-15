# Phoeve Beta — Auditoría de preparación para AWS

Evaluación posterior para revisión: [EL-TK-245 / CR-011](aws-beta-technical-evaluation.md). Región us-east-1 y dos eventos simultáneos confirmados; alternativas S3/DynamoDB y costos revisados allí. No modifica decisiones aceptadas ni acredita despliegue.

Fecha: 2026-10-14. Estado: propuesta documental; no autorización de aprovisionamiento.

Revisión posterior a EL-TK-265 y commits `3a09bd2`..`4b85e91`: **NO-GO para desplegar la Beta con datos reales**. La recepción privada local ya funciona; no acredita el proveedor filesystem Beta, aceptación/publicación, PITR ni autoridad independiente. Se conserva la historia de EL-TK-222; no se promueven tickets de infraestructura por el cierre focal de transferencia.

## Resultado

**CONFIRMED:** Angular SPA y NestJS/Node.js en monorepo pnpm, PostgreSQL 16/Prisma y paquetes de dominio. **No está acreditado un despliegue Beta completo**. El Compose ejecutable es de desarrollo. Hay implementación y laboratorios multimedia, pero no un runtime productivo integrado de almacenamiento, workers y scheduler. El ticket EL-TK-222 DONE no acredita por sí solo una autoridad de recuperación desplegada en AWS.

Las decisiones del usuario son CONFIRMED: EC2 de aplicación único, PostgreSQL Docker/EBS, media local persistente sin integración S3, Compose, Route 53, Let's Encrypt, Terraform, GitHub Actions, beta cerrada, `beta.phoeve.com` y objetivo US$35–50/mes. Región, capacidad, repositorio externo de backups y mecanismo de autoridad independiente siguen PENDING.

## Método y límites

Exploración dirigida: grafo para RecoveryAuthority/ObjectStorage/Scheduler, verificación de cobertura y lectura de fuentes. El índice de 2026-10-09 reporta los archivos de runtime `not_tracked`; las conclusiones siguientes se basan en fuente directa, no en ausencia de resultados del grafo. Se consultaron manifiestos públicos Docker y documentación oficial. No se leyó `.env`, no se consultó la cuenta AWS, no se aplicó Terraform, ni se ejecutaron restauraciones mutantes.

La revisión estática y las lecturas locales no certifican ARM64, capacidad, PITR ni DR-001. La primera propuesta no contó con gate independiente; la reauditoría posterior incorpora revisión de arquitectura que mantiene el NO-GO y revisión de calidad documental, sin certificar implementación/apertura. Evidencia de precios es indicativa y debe cerrarse con región y cotización vigente.

## Inventario verificado

| Área | Evidencia del repositorio | Resultado |
|---|---|---|
| Frontend | `apps/web/package.json`, `angular.json` | Angular 21; build producción disponible; Compose usa `ng serve` en 4200, no servidor estático Beta. |
| API | `apps/api/src/main.ts`, `application.ts`, `app.module.ts` | NestJS monolítico modular; controllers de identidad, admin, eventos y entrada guest. Origin/CORS configurado, CSRF, cookies, no-store y redacción del lookup. OpenAPI expuesto actualmente. |
| Contenedores | `infra/development/Dockerfile`, `compose.yaml` | Imagen workspace con dependencias de desarrollo y herramientas; usuario node, healthchecks y límites. No imagen mínima Beta ni reverse proxy TLS. |
| PostgreSQL | `compose.yaml`, `packages/database/src/index.ts`, `apps/api/src/platform/database/database.service.ts` | PG 16.15 Alpine, volumen named `postgres-data`; mismo usuario configurado para bootstrap/runtime/migrate; API pool máximo 5. Sin configuración Beta de roles separados, TLS SQL o WAL archiving en Compose. |
| Storage | `compose.yaml`, `apps/api/src/guest/guest-upload.service.ts`, `scripts/local-media.mjs`, `packages/event-management/src/local-upload-transfer.ts` | Receptor MinIO development real, registrado en AppModule, privado/versionado y persistente en `objects-data`. Autorización/reserva, GET con hash real, copia de versión exacta y receipt durable; termina CONFIRMING. El adapter de `media-execution/test/laboratory-storage.ts` sigue siendo TEST ONLY y es distinto del receptor nuevo. No existe filesystem gateway Beta integrado. |
| Media | `packages/media-execution/src/docker-runtime.ts`, `packages/media-inspection/src/adapters.ts`, `infra/spikes/media-processing/Dockerfile` | Supervisor Docker y adapters FFmpeg/libheif/ClamAV implementados; imágenes adoptadas referenciadas por SHA local. Parser sin red, capabilities eliminadas, input readonly, tmpfs y límites por intento. La disponibilidad ARM64 de esos artefactos exactos no está acreditada. |
| Jobs | `packages/job-queue/src/job-queue.ts`, `media-execution/src/supervisor.ts`, AppModule/Compose | Cola PostgreSQL, leases/heartbeat y supervisor existen como componentes. Compose no tiene servicio worker ni scheduler; main inicia solamente API. No hay evidencia de proceso Beta de consumo/planificación integrado. |
| Eventos | lifecycle HTTP implementado | Programar y activar manualmente existen. No equiparar fecha programada con un scheduler automático desplegado. |
| CI/CD | `.github/workflows/sync-product-issues.yml` | Workflow de sincronización de backlog; no pipeline verificado de CI, Terraform o deploy Beta. |
| Backup | `scripts/local-backup.mjs` | pg_dump custom en `.local/backups`; restore sólo a DB aislada nueva. No archive continuo, copia fuera del host o programación/retención productiva. |
| Restore previo | `infra/spikes/evidence/restore.json` | Restore lógico aislado y byte equality declarados; PITR NOT_EXECUTED y DR001 NOT_EVALUATED. |

## ARM64 y dimensionamiento

**CONFIRMED:** `docker buildx imagetools inspect` del Node 24.21.0 bookworm-slim fijado en Dockerfile muestra índice multiarch, incluyendo linux/arm64/v8. El tag PostgreSQL 16.15-alpine3.24 también muestra ARM64. Esto verifica bases, no toda la aplicación.

**PENDING:** build nativo de Prisma/pg, Angular/esbuild, sharp, FFmpeg/libheif, ClamAV/firmas, pgBackRest/restic y todos los digests adoptados. Un digest local amd64 no puede reutilizarse como si fuese un índice ARM64. Cualquier cambio de artefacto adoptado debe preservar el perfil y aportar evidencia. Emulación permite smoke tests, pero no mide t4g.

**RECOMMENDED:** t4g.medium sólo como candidato de ensayo (2 vCPU/4 GiB); validar consumo sostenido/créditos y deadlines de procesamiento antes de seleccionar. Instancia burstable no equivale a dos cores sostenidos gratuitos. Standard puede ralentizar el worker; Unlimited puede elevar el costo. Definir el modo y presupuesto explícitamente. [AWS T4g](https://aws.amazon.com/ec2/instance-types/t4/), [créditos CPU](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html).

Una lectura local en reposo mostró aproximadamente API 123 MiB, web dev-server 941 MiB, PostgreSQL 56 MiB y MinIO 98 MiB. No es benchmark ni perfil de producción. **ASSUMED para ensayo:** SO/Docker/agentes 0.5 GiB; proxy 0.1; API 0.35; PG 0.65; scheduler/control 0.15; un slot pesado media 1.5; margen 0.75: total 4 GiB. ClamAV, HEIC, ZIP y concurrencia pueden superar esto. No compilar en EC2; usar imágenes CI. Ajustar límites/concurrencia según pruebas, sin sumar máximos de Compose dev como consumo esperado.

**ASSUMED para estimación:** root 20 GiB, DB 20 GiB, media 60 GiB, autoridad 4 GiB = 104 GiB gp3. Media 60 GiB no certifica cohortes de 20 eventos ni retención; sólo 6 eventos de 10 GB ocuparían todo el volumen sin derivados/exports/scratch. Dimensionar por eventos simultáneos y retenidos, clases, tasa WAL y scratch por slot; bloquear nuevas cargas antes del agotamiento manteniendo lecturas/purgas operables. Mantener scratch separado del disco DB y margen de filesystem.

## Configuración y secretos

Variables existentes verificadas en `config.ts`, database y `.env.example`: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE o DATABASE_URL; API_HOST/PORT; WEB_ORIGIN; PUBLIC_ENTRY_BASE_URL; IDENTITY_PEPPER_SECRET; DATABASE_TIMEOUT_MS; LOCAL_ADMIN_*; SMTP_* como configuración local. La presencia de SMTP en el ejemplo/script no acredita entrega de correo productiva.

EL-TK-265 añade `LOCAL_MEDIA_UPLOAD_ENABLED`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, credenciales locales y `STORAGE_PROXY_TARGET`. `readConfig` **rechaza** habilitar el receptor fuera de `NODE_ENV=development`; deshabilitarlo deja presign/confirm con error 503. Cambiar sólo `.env` a production no conserva las subidas y cambiar el endpoint no crea un adapter filesystem. No eliminar esta guarda para desplegar sin la sustitución técnica y pruebas correspondientes. El proxy `/storage/{bucket}` actual pertenece al dev-server Angular, permite sólo POST y no debe copiarse como si fuese configuración del edge Beta.

`readConfig` aún tiene pepper de desarrollo por defecto sin rechazo específico de producción. La autoridad durable sólo se inyecta bajo LOCAL_ADMIN_ENABLED y este modo exige development/loopback. Por tanto **activar NODE_ENV=production no habilita el login administrativo Beta**. El organizador tiene fallback a revisión SQL/epoch 1; las cuentas ADMIN_PROVISIONED se rechazan sin autoridad. El workflow de eliminación de cuenta usa un RecoveryBarrierPort con receipts sintéticos/ACK no-op: no cumple persistencia externa de MOD-008.

**RECOMMENDED:** secrets recuperables fuera del repositorio mediante SSM SecureString o mecanismo equivalente aprobado; IAM de lectura por ruta exacta, cifrado, archivos de runtime 0600, no secretos en Terraform variables/state/user-data/outputs. Separar DB owner/migrator/API/worker/backup y pepper; rechazo de defaults al inicio Beta. Recuperar con actor autorizado, no con CI imprimiendo secretos. El acceso a Docker del supervisor es privilegiado aunque los parsers no tengan socket; no montarlo en API, gateway ni parser. Impedir acceso desde parser a IMDS y secretos globales.

## EL-TK-222: estado real y brechas

- **CONFIRMED documental:** DONE; depende EL-TK-218/221 (ambos DONE) y bloquea EL-TK-233/237/238 según su contrato. EL-TK-238 aún figura BLOCKED y conserva validación integrada/manual pendiente; sus probes de denegación no acreditan PITR. No cambiar su historia silenciosamente.
- **CONFIRMED código:** DurableRecoveryAuthorityAdapter escribe journal ndjson, fsync y checkpoint temporal/rename; hay pruebas filesystem. Sin embargo, las pruebas A–G usan `SimulatedPostgresWithSnapshot`, no PITR real PostgreSQL/WAL. El ticket exagera el alcance de esa evidencia al presentarla como restauración real.
- **CONFIRMED inconsistencia:** DEC-112 en decisions/architecture/context figura RECOMMENDED; ticket la llama aprobada. Requiere reconciliación documental con decisión explícita.
- **CONFIRMED integración:** AppModule sólo conecta autoridad para desarrollo local; scripts/admin.mjs mantiene admin:recover BLOCKED. El runbook propone ese comando como recuperación, pero el código no lo implementa.
- **Riesgo verificado en fuente:** epoch/seq/maps se mantienen por instancia; no bloqueo interproceso/CAS externo en append. No compartir el directorio entre API/worker/scheduler como tres writers autónomos.
- **Riesgo:** getters del adapter genérico tras initialize consultan memoria, no prueban continuamente disponibilidad del volumen. Ese adapter puede inicializar almacenamiento vacío si se usa sin guardas; el wrapper local actual `createLocalAdminAuthority` sí exige journal/checkpoint existentes y no debe describirse como bootstrap vacío automático. Esta protección local no acredita disponibilidad/actualidad independiente para Beta: un prefijo antiguo coherente conserva hash chaining válido y necesita un ancla exterior monotónica.
- **Riesgo de operación:** copiar/truncar journal o restaurar un checkpoint viejo como propone el runbook no garantiza conservar revocaciones posteriores. Prohibir esos pasos como recuperación autorizada hasta acreditar actualidad/monotonicidad y reconciliación. No hacerlos durante esta auditoría.

**Conclusión:** implementación parcial reutilizable, no gate de seguridad productiva satisfecho. Un EBS de autoridad separado de DB evita rollback conjunto accidental; no prueba supervivencia segura ante pérdida del journal o restore de todos los volúmenes. Registrar seguimiento prospectivo, sin certificar EL-TK-222 nuevamente ni reabrirlo de forma implícita.

## Cambios de contrato y decisiones pendientes

1. **CONFIRMED producto / PENDING contrato técnico:** media local en EC2 sustituye para Beta DEC-063/parte de DEC-061 y referencias de ARCH-005/EL-TD-008 que exigen media externa/direct upload. Justificación: costo y beta cerrada solicitados. Conservar interfaces neutrales, bytes originales exactos, permisos, multipart/ranges/checksums, escritor drenado, cuotas y purga; aceptar explícitamente el nuevo SPOF y tráfico por gateway local. No modificar contratos existentes en esta fase.
2. **PENDING:** región y AZ, tenencia/control DNS del dominio y hosted zone existente; no comprar ni modificar dominio principal. RECOMMENDED iniciar cotización us-east-1 por costo, no asumir región aprobada.
3. **PENDING:** autoridad independiente antirollback. RECOMMENDED evaluar ledger externo con escrituras condicionales/transaccionales y lecturas fuertes (por ejemplo DynamoDB), sin S3. Implica nuevo adapter/ADR; no aprobado ni implementado. Alternativa journal de writer único con réplica durable externa sincronizada antes de éxito, también requiere pruebas y destino. Backups periódicos del journal solos no garantizan cero resurrecciones.
4. **PENDING:** repositorio externo no S3 para base backups/WAL y media (SFTP/host dedicado cifrado). pgBackRest y restic son candidatos. Si no se aprueba destino/capacidad/credenciales recuperables, bloquear Beta.
5. **PENDING:** HCP Terraform para state, organización/workspace, responsable y plan comercial; GitHub repo/branch/plan y gate humano disponible. No publicar repo para obtener approvals.
6. **PENDING:** costo total y almacenamiento/cohorte, alertas/destinatario, operación fuera de horario, email, acceso cerrado efectivo y disponibilidad requerida. 35–50 no es presupuesto acreditado incluyendo recuperación.

Arquitectura, costos y orden propuestos: [plan Beta](aws-beta-plan.md). Cambio trazable: [CR-011](../.codex/product/changes/CR-011.md). Épica: [EL-EP-020](../.codex/product/epics/EL-EP-020.md).

## Delta verificado tras integrar la transferencia

| Estado | Evidencia / consecuencia para AWS |
|---|---|
| CONFIRMED, cerrado localmente | EL-TK-264 permite editar uploads/gallery; EL-TK-265 autoriza cuota y registra transferencia privada con receipt, versión y SHA-256 reales. Once casos PostgreSQL/MinIO y proxy Angular con Host alternativo constan en la entrega. No se repitieron en esta revisión documental ni acreditan ARM64. |
| PENDING, bloquea filesystem Beta | Sustituir la dependencia concreta de presigned POST/GetObject/CopyObject/VersionId mediante un puerto neutral y adapter filesystem; preservar `local_upload_transfer`, ownership, fingerprint, TTL, reserva e identidad inmutable. Un path/nombre de archivo no sustituye VersionId ni checksum observado. |
| PENDING, bloquea recorrido Beta | CONFIRMING no crea media/job ni ejecuta MediaAcceptance. Conectar aceptación bajo autoridad real, worker, validación y publicación/lectura autorizada. No llamar «galería operativa» al almacenamiento del original privado. |
| PENDING, bloquea operación | Cleanup de staging/sellos huérfanos y todas las versiones, drenaje de escritores y reconciliación con reservas/retención. Un grant anterior puede seguir transfiriendo staging hasta vencer; la denegación de confirmación no prueba borrado físico. |
| PENDING, bloquea restauración | Backup/restauración debe interpretar las referencias lógicas de receipt y comprobar bytes/versiones/hash. No copiar el directorio interno MinIO como si fuese un árbol de originales filesystem. Cualquier migración requiere inventario y verificación de la versión exacta referenciada. |
| PENDING, permanece | ARM64 completo, imágenes/Compose de release, scheduler/worker operativos, backups exteriores con WAL, autoridad independiente/actual y CI/CD con aprobación. La búsqueda dirigida en infra y workflows sólo encontró laboratorios/dev y sincronización de issues, sin Terraform ni deploy Beta ejecutables. |

No se accedió a AWS ni `.env`, no se hicieron cambios de runtime y no se volvió a certificar EL-TK-222. La revisión actual es estática, de contratos y documentación pública. El gate de arquitectura confirma que EL-TK-265 no sustituye EL-TK-251/252/253.
