# EL-TK-059 — Habilitar el entorno mínimo real requerido para spikes técnicos

## Type

TECHNICAL_ENABLER

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** equipo técnico, **quiero** habilitar el entorno mínimo REQUIRED_FOR_SPIKES, **para** obtener evidencia experimental real sin esperar el pipeline productivo.

## Alcance y primer entregable

TB-04, sólo REQUIRED_FOR_SPIKES environment-first: contrato baseline conocido de PostgreSQL real, MinIO local con IO real y Docker containers como runtime candidato de aislamiento/scratch/fault injection, corpus/timeline y acceso físico/reproducible de playback según matriz vigente. Sin elegir proveedor definitivo Beta/producción ni requerir API/worker/scheduler productivos,055 implementado, adapters033/035/036, ejecutor056 ni integración058. Harness experimental mínimo/supervisor stub para060/061 es independiente, no reimplementa JobQueue productivo.

## Criterios de aceptación

**Dado** baseline y recursos candidatos autorizados para ejecución posterior, **cuando** habilita el primer incremento, **entonces** documenta accesos scoped, configuración/versiones, PostgreSQL real utilizable para claims/faults, storage privado con writes/multipart/metadata/Delete-Missing-Unknown reales y runtime/scratch/fallos/corpus/timeline/playback disponibles. No mocks como evidencia única ni secretos en repo.

**Dado** una capacidad ausente/no probada, **cuando** entrega, **entonces** registra exactamente limitación/pendiente y no declara entorno listo ni desbloquea spikes reales. Evidencia reproducible de capacidades efectivas se adjunta antes de iniciar060; aceptación documental del ticket no equivale a provisionamiento realizado.

## Fases posteriores, contrato sin ampliar el primer incremento

REQUIRED_FOR_INTEGRATION: API/worker/scheduler reales donde recovery/cleanup lo exige; pipeline upload completo→preview/métricas, restore aislado y RecoveryAuthority independiente para PITR. Se compone después con owners existentes; no condición de cierre del primer incremento059 ni prerrequisito para spikes. REQUIRED_FOR_BETA_GATE: CAP100 sesiones/perfil-recursos, DR backup/WAL7d RPO1h/RTO4h journal/reconciliación y MEDIA98/95/latencias/integridad. EXPORT fuera de predecesoras de spikes. No bootstrap workflow, infra final/AWS/CI/observabilidad o proveedor nuevo seleccionado.

## Pruebas y evidencia (HISTÓRICO del cierre059; estado posterior al final)

La implementación ejecutó Vitest 4/4 y typecheck, preparó PostgreSQL real y MinIO privado, y produjo evidencia de persistencia tras recrear contenedores y restauración lógica aislada con objetos byte-identical. El tester volvió a ejecutar la validación, comprobó typecheck, configuración runtime, preview HTTP 200 y controles pause/unpause de PostgreSQL; además verificó de forma independiente los checksums y la evidencia de restauración existente. El tester no volvió a recrear contenedores ni a ejecutar backup/restore. Las evidencias están enlazadas en el cierre de implementación. No se ejecutaron TB-01/TB-02; su aislamiento efectivo, quiescencia, compatibilidad multimedia y playback siguen pendientes.

READY_FOR_IMPLEMENTATION: YES para el alcance mínimo de este enabler, conforme al baseline y los candidatos autorizados. EXPERIMENT_RESULT: NOT_APPLICABLE. CAPABILITY_EVIDENCE: REQUIRED_FOR_SPIKES_ENVIRONMENT CONFIRMED; TB-01/TB-02 PENDING. Estado de ejecución vigente: DONE.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-060, EL-TK-061.
- **can_parallelize_with:** preparación contractual independiente de owners existentes; ejecución de spikes respeta secuencia y resultados.

## Prioridad / estimación

P0 / M

## Traceability

Enabler compartido con EL-EP-002 por contrato, sin nueva épica. TB-04 ratificado; [Fuente del paquete](../sessions/2026-10-08-technical-blockers-approved-contracts.md); technical-baseline EL-TD-001..007; ARCH-005/006; media-and-jobs-architecture/testing-strategy/operations-and-recovery pertinentes.

## Definition of Ready

- [x] Objetivo/alcance/criterios/evidencia/salida experimentales conocidos
- [x] Permisos/dependencias/fallos y fases delimitados
- [x] Sin pregunta funcional nueva
- [x] Quality gate requirements_reviewer del paquete APPROVED

**HISTÓRICO — gate de creación previo a implementación:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). El primer incremento estaba listo para implementarse; la evidencia de capacidades seguía pendiente y no se había ejecutado provisionamiento. Los criterios anteriores se conservan; el cierre vigente aparece abajo.

## Reevaluación de candidatos — 2026-10-08

**CONFIRMED — DEC-106 / [EL-TD-008](../../context/technical-baseline.md#el-td-008--local-environment-and-beta-topology):** Docker Compose, PostgreSQL 16 en contenedor, MinIO local para object storage S3-compatible y Docker containers como runtime candidato. El bloqueo de selección de recursos candidatos está RESOLVED; no selecciona storage definitivo Beta/producción.

PREPARATORY_SCOPE_READY: plan de entorno REQUIRED_FOR_SPIKES con candidatos aprobados, configuración reproducible de volúmenes/backups/límites/health checks/aislamiento lógico y checklist de evidencia. No requiere bootstrap de API/worker/scheduler productivos ni ampliar alcance a integración/Beta.

HISTÓRICO — BLOCKED_SCOPE al preparar059: el corpus multimedia completo y la ejecución de playback físico siguen pendientes para EL-TK-061; no bloquean el cierre del entorno preparatorio EL-TK-059. PITR, copias externas y RecoveryAuthority independiente siguen en sus owners de integración/DR. No inferir PASS de TB-01/TB-02 ni de gates operacionales.

EL-TK-059_RESOURCE_CANDIDATES: RESOLVED.
READY_TO_PLAN_EL-TK-059: YES.
**HISTÓRICO — reevaluación previa a implementación:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para su alcance propio; CAPABILITY_EVIDENCE: PENDING. No se había implementado ni provisionado durante aquella reevaluación. Ante pérdida del host Beta, recuperación conjunta app/DB conserva DEC-062; no filesystem efímero para datos.

## Cierre de implementación — 2026-10-08

**Resultado:** DONE para el primer incremento REQUIRED_FOR_SPIKES de TB-04. La secuencia de estado fue READY → DONE tras implementación, validación y revisión. Se preparó un laboratorio reproducible con Docker Compose, PostgreSQL real, MinIO privado, runtime candidato, preview responsive de escritorio y evidencia de persistencia/recuperación local. No se implementó bootstrap de producto ni se ejecutaron los spikes TB-01/TB-02.

**CAPABILITY_EVIDENCE:** CONFIRMED_FOR_REQUIRED_FOR_SPIKES_PREPARATION. Esto acredita las capacidades preparatorias del entorno y sus evidencias de persistencia/restauración local; no acredita eficacia del aislamiento, fencing ni quiescencia.

**Validación:** el implementer ejecutó Vitest 4/4, typecheck, recreación de contenedores para comprobar persistencia y backup/restore lógico aislado con dump PostgreSQL y snapshot del volumen MinIO. El tester aprobó con advertencias; volvió a ejecutar la validación, typecheck y las cuatro pruebas, revisó configuración runtime, preview HTTP 200 y controles pause/unpause de PostgreSQL, y verificó los checksums y la evidencia ya producida para la restauración. No volvió a ejecutar recreación, backup ni restore. El reviewer aprobó sin hallazgos. Estos resultados no demuestran pérdida de heartbeat, aislamiento efectivo, fencing ni quiescencia de writers.

Los límites Docker registrados son configuración efectiva del candidato, no evidencia suficiente de eficacia del aislamiento. La disponibilidad de iPhone 14 Pro/Safari iOS/Chrome iOS y Redmi A5/Chrome Android está registrada en la [matriz de recursos físicos](../sessions/2026-10-08-physical-validation-resources.md); la disponibilidad no equivale a playback ni validación de formatos.

**Evidencia reproducible:** [resumen del entorno](../../../infra/spikes/evidence/environment-summary.json), [capacidades PostgreSQL/MinIO](../../../infra/spikes/evidence/capabilities.json), [persistencia tras recrear contenedores](../../../infra/spikes/evidence/persistence.json), [restauración aislada](../../../infra/spikes/evidence/restore.json) y [configuración runtime](../../../infra/spikes/evidence/runtime-configuration.json). Los comandos y precauciones operativas están en [infra/spikes/README.md](../../../infra/spikes/README.md).

**HISTÓRICO — pendiente al cierre059, superado parcialmente por060/061/ARCH-015:** TB-01 y TB-02 no ejecutados; corpus completo/versionado y evidencia de playback físico pendientes para EL-TK-061; PITR y copias off-host no ejecutados. CAP-001, DR-001, MEDIA-001 y EXPORT-001 permanecen NOT_EVALUATED; no se declara ningún gate PASS ni se selecciona storage definitivo Beta/producción.



## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. DONE REQUIRED_FOR_SPIKES preservado. TB-01/TB-02/corpus/playback tienen resultados060/061PASS y adopción; no pendientes activos. No entregó fase integración/Beta, PITR/off-host/RecoveryAuthority ni proveedor definitivo.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
