# EL-TK-131 — Consultar estado, partes y disponibilidad de una exportación

## Parent epic
EL-EP-010

## Status
DONE

## User story
**Como** organizador propietario, **quiero** consultar el progreso y resultado de mis exportaciones, **para** saber cuándo y qué partes puedo descargar.

## Alcance funcional
Exponer ExportStatus con REQUESTED/PREPARING/AVAILABLE/FAILED/EXPIRED/INVALIDATED o equivalentes canónicos, progreso solo cuando sea real, partes/tamaños/fechas y capacidades.

## Fuera de alcance
Mostrar progreso inventado, afirmar descarga completada en el dispositivo o consultar exportaciones ajenas.

## Criterios de aceptación
### Escenario 1
**Dado** export PREPARING, **cuando** owner consulta, **entonces** ve estado y progreso únicamente si existe métrica real.

### Escenario 2
**Dado** export AVAILABLE, **cuando** consulta, **entonces** ve partes numeradas, tamaños y fecha de expiración.

### Escenario 3
**Dado** export FAILED/EXPIRED/INVALIDATED, **cuando** consulta, **entonces** ve causa pública y acciones autorizadas sin resucitar paquete.

## Reglas de negocio
Solicitud exitosa no significa bytes descargados. Estados deben distinguir fallo, expiración e invalidación.

## Validaciones y permisos
Solo owner del evento/export.

## Casos de error y estados vacíos
Sin exportaciones, actor ajeno, estado parcial y error temporal.

## Datos / contratos afectados
ExportStatusSnapshot, ExportPartSummary, capabilities.

## Dependencias técnicas y funcionales
Estados producidos por EL-TK-125..130.

## Dependencias de tickets
- **depends_on:** EL-TK-125, EL-TK-126, EL-TK-127, EL-TK-128, EL-TK-130
- **blocks:** EL-TK-132, EL-TK-133

## Pruebas requeridas
Cada estado, partes, progreso real/no disponible, cross-event y vacíos.

## Observabilidad / auditoría
Consultas sin secretos ni URLs.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-047, DEC-048, DEC-049, DEC-090; EL-EP-010.

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

- **Servicio y contratos:** `ExportQueryService` en `@eventlens/export-management` (`src/export-query.ts`); tipos `QueryExportStatusCommand`, `ExportStatusSnapshot`, `ExportPartSummary`, `ExportProgressInfo` y `ExportCapabilities` (`src/contracts.ts`).
- **Comportamiento y reglas canónicas:**
  - Consulta acotada al organizador propietario por evento (o exportId específico); actor ajeno responde `UNAUTHORIZED` sin filtrar información. Retorna `null` si no existen exportaciones.
  - Distingue claramente los estados `REQUESTED`, `PREPARING`, `AVAILABLE`, `FAILED`, `EXPIRED` e `INVALIDATED`.
  - Progreso real: durante `PREPARING`, expone métricas exactas (`partsReady`, `partsTotal`, `percent`) solo si existen partes planificadas; no inventa porcentajes ficticios (retorna `null` cuando no hay partes aún).
  - Disponibilidad y partes: en `AVAILABLE`, expone partes numeradas con tamaños exactos en bytes, SHA-256 verificado y nombres de archivo canónicos `event-<id>-export-part-<num>.zip`, con fecha de expiración y capacidades `canDownload: true`.
  - Reconciliación en tiempo de consulta: si la ventana de 48 h venció, la exportación se expone como `EXPIRED` con `canRegenerate: true`, impidiendo descargas aunque el reconciliador en background no haya corrido aún.
  - Estados terminales `FAILED` e `INVALIDATED`: exponen códigos y razones sanitizadas (`failureCode`, `statusReason`), permitiendo `canRetry: true` en fallo y bloqueando regeneración directa en invalidación (requiere nueva solicitud).
- **Pruebas:** `test/export-query.unit.test.ts` (8/8 unitarias PASS). Build de `@eventlens/export-management` limpio.
- **Desbloquea:** EL-TK-132 (integración UI/HTTP) y EL-TK-133 (validación integrada E2E).
