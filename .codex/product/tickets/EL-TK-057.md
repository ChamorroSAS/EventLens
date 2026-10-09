# EL-TK-057 — Limpiar outputs de intentos multimedia fallidos u obsoletos

## Parent epic

EL-EP-006

## Status

READY

## User story

**Como** sistema, **quiero** limpiar outputs de intentos fallidos u obsoletos, **para** liberar consumo físico confirmado sin borrar originales ni derivados activos.

## Alcance funcional

Handler de cleanup específico media para outputs/partials/scratch de intentos fallidos u obsoletos, usando inventory/storage/retention y primitives de reference/generation/writer drain comunes con052 (handler cover permanece intacto). No nueva política de purga ni implementación completa015; conserva originales y derivados activos. Capacidad de promoción037 da contrato de refs activas, no obligación de éxito previo para limpiar intento fallido.

## Criterios de aceptación

**Dado** intento elegible, **cuando** reclama y antes de borrar, **entonces** revalida refs activas/generation/barriers y quiescencia writers056/lease055; original y derivados activos nunca se borran. Carrera promoción/cleanup o revisión/lease cambiada exige reevaluar bajo guard/CAS. Snapshot restaurado viejo no prueba orphan.

**Dado** inventario de outputs/partials/versions/staging/scratch del intento, **cuando** storage confirma delete/Missing por ref exacta, **entonces** evidencia/ledger físico avanzan idempotentes sin doble liberación. Unknown/fallo parcial permanece pendiente con retry de lo no confirmado; no éxito completo/DELETED por ACK incierto. Storage effects fuera SQL; SQL evidencia/job/audit/receipt atómicos y replay recuperable.

**Dado** worker/PUT pausado o restore antes del intento, **cuando** limpia, **entonces** drain/epoch/checkpoint íntegros evitan recreación tardía o borrado activo; scope desconocido cerrado. El handler consume retención aprobada de su dueño y no cambia derechos/deadlines.

## Contratos y pruebas

MediaCatalog outcome refs/attempt inventory de037, executor056/lease055 transitivos, ObjectStorage y RetentionPolicy por puertos acordados. Vitest elegibilidad; PG promote-vs-cleanup/doble claim/CAS/rollback; adapter real Missing/Unknown/delete parcial/versions y ledger sin duplicación. PUT pausado+drain, crash después delete antes SQL y PITR prueban conservación del original/derivados activos. Neutral port posible; evidencia real del adapter se valida al implementarlo.

## Dependencias de tickets

- **depends_on:** EL-TK-037.
- **blocks:** EL-TK-058.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-006-05/08; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Cleanup media implementable por contratos037/055/056/inventory/storage/retention con drain/Unknown explícitos. Integración requiere037/055/056 y adapter real; no exige éxito del intento que limpia ni dependencia circular.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
