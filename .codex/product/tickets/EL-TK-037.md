# EL-TK-037 — Aplicar el resultado exitoso del procesamiento

## Parent epic

EL-EP-006

## Status

DONE

**CONFIRMED — DONE (2026-10-10):** implementación aprobada por reviewer y tester independiente. Véase evidencia de cierre al final.

## User story

**Como** sistema, **quiero** aplicar un resultado de procesamiento validado con la decisión de publicación vigente, **para** hacer visible solo el contenido autorizado.

## Criterios de aceptación

**Dado** derivados válidos de una generación vigente, **cuando** se confirma el resultado, **entonces** reevalúa la decisión versionada de `MediaGovernance` y, mediante CAS, la media queda `PUBLISHED` en auto-publicación o `PENDING_REVIEW` en revisión previa. **Dado** conflicto de revisión al confirmar, **cuando** la decisión de moderación cambió, **entonces** reevalúa el modo/decisión actuales conforme DEC-087 y vuelve a intentar CAS sin convertir sólo ese cambio en fallo terminal indefinido. **Dado** una barrera posterior o pérdida de lease, **cuando** llega un resultado tardío, **entonces** falla cerrado y no sobrescribe `HIDDEN`, `TRASHED`, `DELETED` ni `QUARANTINED`. **Dado** un resultado ya aplicado, **cuando** se recibe de nuevo, **entonces** no duplica transición ni derivados activos.

## Datos / contratos afectados

`MediaLifecycle`, decisión versionada de `MediaGovernance`, referencias de derivados validadas y actualización atómica con el trabajo. PL-007 está ANSWERED por DEC-087: trabajos que finalizan aplican el modo vigente; pendientes existentes siguen esperando aprobación y publicados no cambian automáticamente. MediaGovernance de MOD-004/EL-EP-008 conserva ownership de decisión.

## Dependencias de tickets

- **depends_on:** EL-TK-035, EL-TK-036.
- **blocks:** EL-TK-057; consumidores de galería de EL-EP-007.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Auto-publicación, revisión previa, idempotencia y resultado tardío contra estados restrictivos.

## Observabilidad / auditoría

Registrar transición, decisión de gobernanza y correlación de trabajo sin datos del archivo.

## Prioridad / estimación

P0 / M

## Traceability

Q-023; DEC-037; EL-EP-006, EL-EP-008.

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

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.

Trazabilidad de remediación: GAP-EL-EP-006-06/08/10.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Promoción/policy/CAS por contratos035/036 y MediaGovernance vigentes implementables. Integración requiere035/036 y autoridad/executor055/056; permisos no se trasladan al codec.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Cierre de implementación — 2026-10-10

**CONFIRMED — DONE:** el reviewer y tester independiente aprobaron la implementación.
- **Suite enfocada (EL-TK-037):** PASS 63/63 (55 pruebas de integración con PostgreSQL real y 8 pruebas unitarias).
- **Regresión combinada (media-inspection):** PASS 262/262 en 10 archivos de test (inspection, quarantine, photo-derivatives, video-derivatives y successful-processing).
- **Regresión de runtime (EL-TK-056):** PASS 21/21 en `media-execution`.
- **Typecheck, build y migraciones repetidas:** PASS.

La implementación aplica la decisión versionada de `MediaGovernance` mediante CAS atómico en SQL corto (`PUBLISHED` en `AUTO`, `PENDING_REVIEW` en `PRE_REVIEW`), maneja cambios de modo concurrentes sin fallo terminal (DEC-087), protege contra sobreescritura de estados restrictivos (`HIDDEN`, `TRASHED`, `DELETED`, `QUARANTINED`, `REJECTED`, `PROCESSING_FAILED`), soporta ACK replay idempotente y exige locking canónico en orden estricto de ancestro/padre -> media -> job para prevenir interbloqueos.

Evidencia: [corrida enfocada](../../../infra/validation/media-inspection/evidence/success-focused-final/), [regresión combinada](../../../infra/validation/media-inspection/evidence/success-combined-regression/), [regresión runtime EL-TK-056](../../../infra/validation/media-execution/evidence/success-independent-regression/) y [documentación](../../../infra/validation/media-inspection/README.md#el-tk-037-successful-processing-final-validation).

MEDIA-001, CAP-001, DR-001 y EXPORT-001 permanecen `NOT_EVALUATED`; proveedor de storage definitivo continúa `DEFERRED`. Se desbloquea downstream EL-TK-057 y consumidores de galería de EL-EP-007.
