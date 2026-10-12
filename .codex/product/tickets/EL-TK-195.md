# EL-TK-195 — Construir inventario verificable y detener escritores antes de purgar

##Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** sistema, **quiero** congelar el inventario físico y drenar escrituras activas, **para** evitar recreación o eliminación incompleta de objetos.

## Alcance funcional
Preparar manifest inmutable revisionado de originales, derivados, EventAssets/portadas, exports y partes, staging/partials, versiones y multipart; invalidar grants y verificar quiescencia, writers/fences y autorización externa antes de purga.

## Fuera de alcance
No borrar bytes ni liberar cuota; inventario no se infiere de un backup restaurado incompleto.

## Criterios de aceptación
### Escenario 1
Dado scope elegible, cuando se prepara, entonces el manifest identifica keys/versiones/partes y referencias por propietario y generación.

### Escenario 2
Dada URL firmada o transferencia activa, cuando no se prueba drenaje, entonces no se declara writer quiet ni purga principal concluida.

### Escenario 3
Dado manifest stale o autoridad UNKNOWN, cuando se reintenta, entonces falla cerrado o reconstruye por revisión con control CAS.

## Reglas de negocio
La revocación API no deshace URL emitida; versiones/multipart y outputs aislados deben figurar en evidencia.

## Validaciones y permisos
Solo worker con lease/fence/epoch y recibo de claim; no exposición cliente.

## Casos de error y estados vacíos
Missing vs Unknown, provider temporal, writes late, partes huérfanas, grant revocado, colisiones de key.

## Datos / contratos afectados
ObjectStorage owner adapters, grants MOD-003/005, Quota MOD-006 consulta, manifest y writer drain.

## Dependencias técnicas y funcionales
EL-TK-188, EL-TK-193; EL-TK-128 para manifest de exportaciones; contratos ARCH-006/010.

## Dependencias de tickets
- **depends_on:** EL-TK-188, EL-TK-193; EL-TK-128 para manifest de exportaciones; contratos ARCH-006/010.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Storage S3-compatible real en integración: versions/multipart, late writes, lease loss, CAS y partial inventory.

## Observabilidad / auditoría
Manifest sanitizado con hashes/referencias y conclusiones de writer; no firma ni bytes.

## Prioridad / estimación
P0 / L

## Traceability
DEC-063/092/109/110; ARCH-006/010/019; EL-EP-015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12.

## Evidencia de cierre — 2026-10-12
- **Implementación:** `packages/event-management/src/deletion-purge-execution.ts` (`DeletionPurgeExecutionService.prepareVerifiableManifestAndDrainWriters`), tabla `deletion_inventory_manifest` en `packages/event-management/prisma/migrations/202610120055_deletion_purge_and_tombstones/migration.sql`.
- **Verificación:** `test/deletion-purge-and-residual.unit.test.ts` y `test/deletion-purge-and-residual.integration.test.ts` (PASS en PostgreSQL 16 real) + `pnpm --filter @eventlens/event-management build` (0 errores).

