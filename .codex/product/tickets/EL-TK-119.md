# EL-TK-119 — Resolver un caso de reporte o retiro registrando la intervención

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** administración autorizada, **quiero** resolver un caso con resultado y justificación, **para** cerrar la revisión con trazabilidad y acciones proporcionales.

## Alcance funcional
Registrar resolución de casos revisados, su decisión, motivo, comunicaciones aplicables y, cuando corresponda, emitir contrato de eliminación grave/no restaurable hacia EL-EP-015.

## Fuera de alcance
Definir texto jurídico final, garantizar plazo contractual, conservar multimedia para auditoría o ejecutar físicamente toda purga.

## Criterios de aceptación
### Escenario 1
**Dado** un caso revisado tiene decisión, **cuando** admin resuelve, **entonces** se registra estado final, actor, motivo y acciones ejecutadas/solicitadas.

### Escenario 2
**Dado** la decisión exige eliminación no restaurable, **cuando** se confirma, **entonces** se emite el contrato de purga correspondiente sin papelera del owner.

### Escenario 3
**Dado** un caso ya resuelto, **cuando** se intenta resolver otra vez, **entonces** se devuelve conflicto/idempotencia sin doble acción destructiva.

## Reglas de negocio
Casos graves válidos pueden omitir papelera. Auditoría retiene mínimos, no media.

## Validaciones y permisos
Admin autorizado; acciones destructivas requieren capability/motivo.

## Casos de error y estados vacíos
Caso ya cerrado, acción downstream fallida, media inexistente, conflicto y permiso vencido.

## Datos / contratos afectados
CaseResolution, resolutionType, reason, action refs, purge request, notification event.

## Dependencias técnicas y funcionales
EL-EP-015 purga, EL-EP-013 comunicaciones y EL-EP-014 auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-117; contrato EL-EP-013, EL-EP-014, EL-EP-015
- **blocks:** EL-TK-122, EL-TK-123

## Pruebas requeridas
Resolución normal/grave, replay, fallo downstream, auditoría y no restaurabilidad cuando aplica.

## Observabilidad / auditoría
Auditar resolución y referencias; no adjuntar media al log.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013, Q-019; DEC-023, DEC-029, DEC-059, DEC-088, DEC-097; EL-EP-009, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Implementado método `resolveCase` en `MediaCaseGovernanceService` y `PostgresMediaCaseGovernanceRepository` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Agregadas columnas de resolución en `media_report_case` y `media_removal_request` (`resolved_at`, `resolved_by`, `resolution_type`, `resolution_notes` vía migración `202610120051_media_case_governance`).
  - Soporte de resoluciones `DISMISSED`, `REMOVED_PERMANENTLY` y `HIDDEN_PERMANENTLY`.
  - Enlace con `PurgeDispatcherPort` fijando anclajes inmutables `purge_started_at = now`, `main_purge_deadline = now + 7d`, `residual_purge_deadline = now + 30d`.
- **Criterios de aceptación verificados:**
  - Escenario 1: Resolución formal registra estado final (`DISMISSED` o `ACTION_TAKEN`/`RESOLVED`), actor, motivo y trazabilidad inmutable en `media_case_history` y `audit_event` sin adjuntar multimedia sensible al log.
  - Escenario 2: Ante decisión `REMOVED_PERMANENTLY`, la media pasa a `DELETED` en el catálogo y se emite inmediatamente el contrato de purga a `PurgeDispatcherPort` **sin pasar por papelera del organizador ni ventana de cancelación**, conforme a `DEC-089` y `DEC-097`.
  - Escenario 3: Replay idempotente: ante un caso ya resuelto, se devuelve el resultado previo con flag `alreadyResolved: true` y no se duplican acciones destructivas ni despachos de purga.
- **Pruebas:** 4 pruebas unitarias en `media-report-and-removal.unit.test.ts` y prueba de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16 real. Build limpio.

