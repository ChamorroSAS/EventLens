# EL-TK-057 — Limpiar outputs de intentos multimedia fallidos u obsoletos

## Parent epic

EL-EP-006

## Status

DONE

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

## Implementación y Verificación — 2026-10-11

- **Componentes:**
  - `packages/media-inspection/src/attempt-cleanup.ts`: Servicio `AttemptCleanupService`, tipos `AttemptCleanupCandidate`, `AttemptCleanupCommand`, `AttemptCleanupReceipt`, interfaces `CleanupStoragePort`, `RetentionPolicy`, errores `AttemptCleanupError`, repositorio `PostgresAttemptCleanupRepository`.
  - Migración Prisma `202610110019_attempt_cleanup`: Tablas `media_attempt_cleanup_receipt`, `media_physical_cleanup_ledger` (con restricción única `UNIQUE(namespace, key)` para prevenir doble liberación física), y `media_attempt_cleanup_audit`.
  - Exportación pública en `packages/media-inspection/src/index.ts`.
- **Invariantes contractuales y de protección verificados (ARCH-015 / DEC-037 / DEC-079 / DEC-087):**
  - **Inviolabilidad de originales y derivados activos:** El original registrado en `media_catalog.original` y cualquier derivado activo en `media_active_derivative` están estrictamente blindados y NUNCA son borrados (`reason: 'ORIGINAL'`, `reason: 'ACTIVE_DERIVATIVE'`). Solo se eliminan outputs, partials o scratch obsoletos o fallidos.
  - **Quiescencia y control de leases:** Rechazo fail-closed inmediato si el intento se encuentra en estado `ACTIVE` (`NON_QUIESCENT_WRITER`) o si el trabajo posee un lease activo en ejecución en `job_queue` (`status = 'PROCESSING'` y `lease_until > NOW()`, error `ACTIVE_LEASE_HELD`).
  - **Ejecución en dos fases:** Eliminación física en almacenamiento de objetos fuera de la transacción SQL; confirmación atómica de recibo, auditoría y ledger físico en PostgreSQL.
  - **Ledger físico sin doble liberación:** Inserción en `media_physical_cleanup_ledger` con clave única `(namespace, key)`; replays o reintentos detectan liberaciones físicas previas y no duplican conteo ni registros de bytes.
  - **Carrera promote-vs-cleanup bajo CAS guard:** Revalidación atómica de `media_active_derivative` al hacer commit en SQL; si un output fue promovido concurrentemente mientras se ejecutaba el borrado en storage, la transacción aborta (`PROMOTION_CLEANUP_RACE`).
  - **Manejo de fallos parciales y estado UNKNOWN:** Resultados con ACK incierto o fallido (`UNKNOWN`/`FAILED`) dejan el intento en estado `PARTIAL`, registrando en el ledger únicamente los items confirmados (`DELETED` o `MISSING`) y reteniendo los no confirmados en `details.pending` para reintento acotado.
  - **Idempotencia determinista:** Replays con el mismo `operationId` retornan el recibo previo (`wasExisting: true`). Parámetros inconsistentes para el mismo `operationId` fallan con `IDEMPOTENCY_CONFLICT`.
- **Evidencia en Docker con PostgreSQL 16 (`infra/validation/media-inspection/Run.ps1 -CleanupOnly`):**
  - Pruebas unitarias: `test/attempt-cleanup.test.ts` (13/13 passed).
  - Pruebas integradas con PG 16 real: `test/attempt-cleanup.integration.test.ts` (6/6 passed).
  - Suite enfocada: 19/19 tests passed.
  - Typecheck (`tsc --noEmit`) y build (`tsc -p tsconfig.build.json`): 0 errores.
  - Veredicto de testing: **PASS** (`infra/validation/media-inspection/evidence/result.json`).

