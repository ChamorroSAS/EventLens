# EL-TK-040 — Solicitar un nuevo ciclo para un fallo técnico elegible

## Parent epic

EL-EP-006

## Status

READY

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** organizador propietario, **quiero** solicitar un nuevo ciclo de procesamiento para un original fallido elegible, **para** intentar recuperar sus versiones web sin alterar la evidencia anterior.

## Criterios de aceptación

**Dado** un `PROCESSING_FAILED` técnico que no está `QUARANTINED`, **cuando** su organizador activo y autorizado solicita reintento, **entonces** se registra un único ciclo nuevo, conserva el historial y encola una ejecución con hasta tres intentos automáticos totales; si la inspección no quedó aprobada, el ciclo vuelve a inspeccionarlo antes de transformar. **Dado** una solicitud concurrente o repetida, **cuando** ya existe un ciclo vigente, **entonces** devuelve ese ciclo sin duplicar trabajo ni reiniciar su presupuesto. **Dado** `QUARANTINED`, otro estado, barrera vigente o un organizador ajeno, **cuando** solicita reintento, **entonces** se deniega y no se encola trabajo.

## Reglas de negocio

La solicitud no declara por sí misma la media segura, publicada ni `PROCESSING`; el worker aplica la transición al reservar el trabajo. No libera cuarentenas.

## Dependencias de tickets

- **depends_on:** EL-TK-033, EL-TK-039.
- **blocks:** EL-TK-054.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Solicitud autorizada, repetición idempotente, inspección inconclusa, denegación de cuarentena/estado inválido y aislamiento entre eventos.

## Observabilidad / auditoría

Auditar solicitante, media/generación, ciclo creado y razón de denegación sin exponer contenido.

## Prioridad / estimación

P0 / S

## Traceability

Q-040, Q-041; DEC-075, DEC-076; EL-EP-006.

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

El constraint/ciclo activo se confirma con job/audit/receipt en una transacción; dos solicitudes concurrentes devuelven el único ciclo vigente sin reiniciar presupuesto. Solicitud aceptada no marca PROCESSING: reserva055/worker efectúa transición. Retry elegible con inspección inconclusa no concede descarga; aprobación segura y autorización de descarga son contratos separados.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.

Trazabilidad de remediación: GAP-EL-EP-006-02/08/10.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Nuevo ciclo/policy/idempotencia implementables por contratos033/039; integración requiere esas capacidades y autorización vigente. No libera cuarentena ni concede descarga.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
