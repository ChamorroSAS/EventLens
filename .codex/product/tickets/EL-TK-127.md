# EL-TK-127 — Publicar disponibilidad y expiración de una exportación preparada

## Parent epic
EL-EP-010

## Status
DONE

## User story
**Como** sistema, **quiero** marcar una exportación preparada como disponible, **para** informar al organizador qué partes puede descargar y hasta cuándo.

## Alcance funcional
Al completar todas las partes autorizadas, marcar AVAILABLE, registrar lista/tamaños y expiresAt de 48h; no considerar disponible una exportación parcial incompleta.

## Fuera de alcance
Descargar bytes, regenerar exportación o notificar por email directamente si pertenece a EL-EP-013.

## Criterios de aceptación
### Escenario 1
**Dado** todas las partes requeridas están listas, **cuando** finaliza preparación, **entonces** la exportación queda AVAILABLE con expiresAt +48h.

### Escenario 2
**Dado** solo algunas partes existen, **cuando** se evalúa, **entonces** no se declara AVAILABLE por la mera existencia parcial.

### Escenario 3
**Dado** llega expiresAt, **cuando** se reconcilia, **entonces** pasa a EXPIRED y deja de emitir nuevos grants.

## Reglas de negocio
DEC-048: disponibilidad 48h. Estado de disponibilidad representa el conjunto autorizado, no un archivo parcial.

## Validaciones y permisos
Sistema; owner solo consulta estado.

## Casos de error y estados vacíos
Manifest inconsistente, parte faltante, reloj/replay y cleanup pendiente.

## Datos / contratos afectados
Export status AVAILABLE/EXPIRED, parts metadata, expiresAt.

## Dependencias técnicas y funcionales
Preparación EL-TK-126 y avisos EL-EP-013.

## Dependencias de tickets
- **depends_on:** EL-TK-126
- **blocks:** EL-TK-129, EL-TK-131, EL-TK-132, EL-TK-133; contrato de aviso EL-EP-013

## Pruebas requeridas
Completo, parcial, expiración, replay y timestamps.

## Observabilidad / auditoría
Auditar disponibilidad/expiración y conteos.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-048, DEC-049; EL-EP-010, EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-009/013/046..049/063/064/075/079/090 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §9.1..8; sin componentes nuevos ni centros de exportación paralelos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Evidencia de implementación y verificación — 2026-10-12

- **Migración `202610120055_export_availability`:** `available_at`/`expires_at`/`expired_at` en `export_request`; CHECK que exige ventana, `prepared_at` y manifiesto para `AVAILABLE`; índice parcial de expiración; estado de parte `EXPIRED`.
- **Disponibilidad (`src/export-availability.ts`):** `publishExportAvailability` solo marca `AVAILABLE` si todas las partes del snapshot están `READY` con key/tamaño/SHA-256, el conteo de entradas por parte coincide con el manifiesto congelado y existe el manifiesto preparado; ventana de 48 h (DEC-048) con el reloj de la base de datos. Se ejecuta de forma atómica con la finalización del job de EL-TK-126 (y revierte junto con él si falla el aviso). `ExportAvailabilityService` es el camino idempotente de recuperación; un replay no mueve `expiresAt` ni duplica avisos/auditoría. Una exportación parcial devuelve `PARTS_INCOMPLETE` y un manifiesto/parte inconsistente `MANIFEST_INCONSISTENT`; terminal -> `NOT_PUBLISHABLE`.
- **Expiración:** `ExportExpiryReconciler` pasa `AVAILABLE -> EXPIRED` (distinto de FAILED/INVALIDATED) con `SKIP LOCKED` (varios schedulers expiran una sola vez) y encola un job `EXPORT_CLEANUP` idempotente por generación. `isExportAvailable` bloquea nuevos grants aunque el reconciliador se retrase (insumo para EL-TK-129). `ExportCleanupWorker` borra partes y manifiesto, deja las partes `EXPIRED` conservando tamaños, reintenta con backoff y, agotado el presupuesto, queda `DEAD` (alerta) sin deshacer la expiración.
- **Aviso EL-EP-013:** puerto `ExportLifecycleNotifier` (`exportAvailable`/`exportExpired`) invocado dentro de la misma transacción; este paquete no envía correo ni depende de `notifications` (el adaptador se compone en el composition root).
- **Auditoría:** `EXPORT_AVAILABLE`, `EXPORT_EXPIRED` y `EXPORT_CLEANED_UP` solo con conteos, sin keys ni URLs.
- **Pruebas:** `test/export-availability.integration.test.ts` (11 de PostgreSQL 16 real + 1 unitaria de `isExportAvailable`). Paquete completo 51/51 y `scripts/workspace.mjs build` OK. Las pruebas de EL-TK-126 se actualizaron al nuevo estado final `AVAILABLE`.
- **Alcance:** consulta de estado/partes para el owner es EL-TK-131; regenerar tras FAILED/EXPIRED es EL-TK-130; emisión de grants de partes es EL-TK-129.