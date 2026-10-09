# EL-TK-032 — Encolar el procesamiento de un original aceptado

## Parent epic

EL-EP-006

## Status

DONE

**CONFIRMED:** implementación aprobada; `REQUIREMENTS_READY: YES` y `READY_FOR_IMPLEMENTATION: YES` eran las puertas previas a ejecución. Se conservan la prioridad P0, el alcance y las dependencias históricas. Resultado, límites y validación: [sesión de implementación](../sessions/2026-10-09-el-tk-032-implementation.md).

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** encolar de forma durable el procesamiento de un original aceptado, **para** iniciar su tratamiento asíncrono sin perderlo ni duplicarlo.

## Criterios de aceptación

**Dado** un original sellado y una media `UPLOADED`, **cuando** se confirma su aceptación, **entonces** se confirma de forma durable un único trabajo de procesamiento con referencia/generación y la media queda lista para un worker. **Dado** un fallo entre sellado y confirmación, **cuando** se recupera, **entonces** reconcilia el trabajo sin dejar una media aceptada sin procesamiento ni publicar un duplicado. **Dado** un reintento de la misma confirmación, **cuando** ya existe ese trabajo lógico, **entonces** no se encola un duplicado ni se altera el original.

## Reglas de negocio

El original y los derivados son referencias distintas. La activación a `PROCESSING` la efectúa el worker al reservar una ejecución; no se crea un estado nuevo por la cola.

## Datos / contratos afectados

`MediaCatalog`, `ProcessingService`, `JobQueue.publish` y referencia inmutable del original. Aplica a aportes invitados aceptados del contrato de EL-EP-005; la portada `EventAsset` se integra mediante EL-TK-049..052, especialmente EL-TK-050, que consume contratos reutilizables de inspección/transformación de EL-TK-033/035; EL-TK-026 es SUPERSEDED histórico; sin crear asignación de portada aquí.

## Dependencias de tickets

- **depends_on:** contrato de carga aceptada de EL-EP-005.
- **blocks:** EL-TK-033, EL-TK-038, EL-TK-041.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Encolado coordinado con aceptación y recuperación, idempotencia ante confirmación repetida y preservación de referencia/generación.

## Observabilidad / auditoría

Registrar transición y correlación media–trabajo sin URL firmada, secretos ni bytes de contenido.

## Prioridad / estimación

P0 / M

## Traceability

Q-008, Q-023; DEC-009, DEC-063, DEC-064; EL-EP-005; EL-EP-006.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final2026-10-08:** remediación APPROVED; aprobación de2026-10-07 histórica. Referencias vigentes: technical-baseline EL-TD-001..007, api-conventions, media-and-jobs-architecture, operations-and-recovery y testing-strategy; no elección DEFERRED. REST/JSON/OpenAPI y cliente Angular generado, sin DTO internos Nest ni entidades Prisma como dominio/HTTP.

### Consistencia y recuperación observable
**Dado** ejecución/comando autorizado con revisión/generation/epoch vigentes, **cuando** confirma su efecto, **entonces** cambio media/job y audit/recibo/intención pertinente se registran atómicamente en SQL corto; rollback no conserva transición ni trabajo/intención parcial. Replay compatible devuelve recibo/efecto previo; payload distinto/revisión vieja da conflicto sin sobrescribir. Original y derivados activos no se sustituyen por efectos parciales o tardíos.

**Dado** carrera de claim/ciclo o pérdida lease/DB/permiso, **cuando** llega un resultado antiguo, **entonces** CAS/fence/epoch y policy vigentes impiden promoverlo o reactivar recurso restringido. Lease en DB no detiene PUT físico: ejecutor056 cancela IO/subproceso y cleanup057 exige drain/quiescencia antes de borrar. Reconciliación utiliza facts/revisión/barrier RecoveryAuthority del owner MOD-003 por puerto compartido; scopes sin checkpoint íntegro permanecen cerrados después PITR. No ampliar046 (MOD-001) ni construir segunda authority/adapter.

### Pruebas requeridas por riesgo
Vitest de policy/invariantes; PostgreSQL real para atomicidad, rollback, replay y carreras de claim/generación/ciclo. API verifica permiso/errores/esquema pertinente. Inyectar crash/ACK perdido/pérdida lease/DB y restore anterior al cambio: worker previo no promueve; snapshot sin reconciliar no autoriza. Las pruebas de consumidores cubren034 cuarentena y039 cierre terminal sin modificar sus artefactos VALID KEEP. Corpus/métricas integrados en058; no resultados ejecutados en fase documental.

JobQueue.publish participa en la unidad de trabajo de aceptación; UNIQUE dedup resource/generation y receipt evitan original aceptado sin job tras rollback/replay. Claim055 consume JobSpec acordado sin que032 deba depender del runtime de reserva. Portada049..052/050 reutiliza contratos033/035, sin ciclo ni estado GuestContribution para cover.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.

Trazabilidad de remediación: GAP-EL-EP-006-08/10.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Publish/idempotencia implementable por JobSpec acordado; aceptación real requiere contrato EL-EP-005, sin predecesora claim055.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Resultado de implementación — 2026-10-09

**CONFIRMED:** el owner de carga prepara una proyección durable del original sellado y verificado; la confirmación vuelve a validar policy/autoridad vigente y registra atómicamente `UPLOADED`, el trabajo lógico, ledger, audit y recibo en PostgreSQL. Replays compatibles devuelven el recibo existente sin volver a programar el trabajo; identidad, revisión, generación o comando incompatibles se rechazan. La reconciliación examina únicamente proyecciones conocidas con cursor acotado.

Paquete e interfaces: [media-acceptance](../../../packages/media-acceptance/README.md). La validación independiente ejecutó 26/26 pruebas con PostgreSQL 16 real; resultados: [registro](../../../infra/validation/media-acceptance/evidence/independent/result.json) y [pruebas](../../../infra/validation/media-acceptance/evidence/independent/tests.json). El contrato no realiza carga ni sellado físico, no define cuotas, endpoint HTTP, promoción, parser ni adapter productivo de `RecoveryAuthority`; esos límites y gates no quedan certificados por esta implementación.
