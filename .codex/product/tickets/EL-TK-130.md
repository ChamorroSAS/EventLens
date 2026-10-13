# EL-TK-130 — Reintentar o regenerar una exportación fallida o expirada cuando siga autorizada

## Parent epic
EL-EP-010

## Status
DONE

## User story
**Como** organizador propietario, **quiero** solicitar una nueva preparación cuando mi exportación falló o expiró, **para** recuperar mis recuerdos sin reutilizar un paquete inválido.

## Alcance funcional
Crear un nuevo ciclo autorizado a partir del alcance permitido cuando la exportación está FAILED o EXPIRED, revalidando permisos y generando una nueva preparación/expiración.

## Fuera de alcance
Resucitar partes expiradas, reutilizar URLs antiguas, ampliar silenciosamente el snapshot o reintentar INVALIDATED sin resolver la causa.

## Criterios de aceptación
### Escenario 1
**Dado** exportación FAILED y permisos siguen válidos, **cuando** owner reintenta, **entonces** se abre un nuevo ciclo idempotente de preparación.

### Escenario 2
**Dado** exportación EXPIRED, **cuando** owner regenera, **entonces** se prepara un nuevo paquete autorizado con nueva vigencia.

### Escenario 3
**Dado** exportación INVALIDATED por retiro, **cuando** se intenta regenerar sin cambio de causa, **entonces** se deniega o exige nueva solicitud conforme contrato.

## Reglas de negocio
Regenerar no revive una URL/parte vieja. Revalidar permisos antes del nuevo ciclo.

## Validaciones y permisos
Owner autorizado.

## Casos de error y estados vacíos
Estado no elegible, permiso revocado, retry duplicado, fallo de job.

## Datos / contratos afectados
ExportRetry/Regenerate command, priorExportId, new cycle/request reference.

## Dependencias técnicas y funcionales
JobQueue y snapshot/revalidación de esta épica.

## Dependencias de tickets
- **depends_on:** EL-TK-126, EL-TK-127, EL-TK-128
- **blocks:** EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
FAILED retry, EXPIRED regenerate, invalidated, replay y access revoke.

## Observabilidad / auditoría
Auditar relación old/new export sin datos binarios.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-047, DEC-048, DEC-090; EL-EP-010.

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

## Evidencia de implementación y verificación — 2026-10-13

- **Servicio y contratos:** `ExportRetryService` en `@eventlens/export-management` (`src/export-retry.ts`); tipos `RetryExportCommand` y `RetryExportResult` (`src/contracts.ts`).
- **Reglas y revalidación:**
  - Solo el organizador propietario puede solicitar reintentar o regenerar; actor ajeno o evento no coincidente devuelven `UNAUTHORIZED`.
  - Reintento de exportaciones en `FAILED`: incrementa atómicamente la generación (`generation + 1`), limpia marcas de fallo y timestamps, resetea a `REQUESTED` y encola un nuevo job `EXPORT_PREPARE` aislado para la nueva generación (DEC-047, DEC-064).
  - Regeneración de exportaciones en `EXPIRED`: abre un nuevo ciclo con nueva generación y fecha de solicitud, garantizando que no se reutilicen URLs ni partes expiradas (DEC-048).
  - Replay idempotente: si la exportación ya se encuentra activa en `REQUESTED` o `PREPARING`, retorna el ciclo en curso con `replayed: true` sin re-encolar jobs.
  - Exportaciones en `AVAILABLE` vigentes: se rechaza la regeneración con `EXPORT_IN_PROGRESS` para evitar preparar paquetes redundantes.
  - Exportaciones en `INVALIDATED` (DEC-090): se deniega la regeneración directa con `EXPORT_INVALIDATED`, exigiendo crear una nueva solicitud de exportación si la causa lo permite.
  - Revalidación obligatoria previa al reintento: si se detecta que algún medio fue retirado o el evento fue suspendido antes de reiniciar, la exportación pasa a `INVALIDATED` y se deniega el reintento.
- **Auditoría:** emite `EXPORT_REQUESTED` con código de procedencia (`RETRY_FAILED` o `REGENERATE_EXPIRED`).
- **Pruebas:** `test/export-retry.unit.test.ts` (6/6 unitarias PASS). Build de `@eventlens/export-management` limpio.
- **Desbloquea:** EL-TK-131 (consulta de estado), EL-TK-132 (integración UI/HTTP) y EL-TK-133 (validación integrada E2E).
