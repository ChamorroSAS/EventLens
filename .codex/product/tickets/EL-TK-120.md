# EL-TK-120 — Consultar la cola y detalle de casos para revisión administrativa

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** administración autorizada, **quiero** consultar reportes y solicitudes pendientes, **para** priorizar y revisar casos sin exponer media en la lista.

## Alcance funcional
Exponer ReportQueue/ReportDetail con filtros, severidad, estado, referencias sanitizadas, historial y capacidades; el preview de media requiere EL-TK-117.

## Fuera de alcance
Mostrar media sensible en la cola, ejecutar acciones destructivas desde la consulta sin autorización o seguimiento público.

## Criterios de aceptación
### Escenario 1
**Dado** existen casos abiertos, **cuando** admin consulta la cola, **entonces** recibe items sanitizados ordenables/priorizables.

### Escenario 2
**Dado** abre un detalle, **cuando** consulta, **entonces** ve historial, datos permitidos y acciones autorizadas sin preview automático.

### Escenario 3
**Dado** no hay casos/filtro sin resultados, **cuando** consulta, **entonces** se distinguen ambos estados.

## Reglas de negocio
La lista nunca necesita mostrar el recuerdo. Datos del reportante se minimizan según función.

## Validaciones y permisos
Solo admin autorizado.

## Casos de error y estados vacíos
Cola vacía, filtro vacío, caso ya resuelto, permiso vencido y error parcial.

## Datos / contratos afectados
ReportQueueSnapshot, ReportCaseDetail, filters, severity/status, capability map.

## Dependencias técnicas y funcionales
Clasificación EL-TK-116, resolución EL-TK-119 y auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-113, EL-TK-115, EL-TK-116
- **blocks:** EL-TK-122, EL-TK-123

## Pruebas requeridas
Filtros, prioridad, sanitización, cola vacía, actor ajeno y detalle.

## Observabilidad / auditoría
No loggear datos sensibles del reportante más allá de lo necesario.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-016, DEC-088, DEC-103; EL-EP-009.

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
  - Implementados métodos `getCaseQueue` y `getCaseDetail` en `MediaCaseGovernanceService` y `PostgresMediaCaseGovernanceRepository` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Consulta unificada con `UNION ALL` entre `media_report_case` y `media_removal_request` con orden canónico (`CRITICAL` primero, `NORMAL` después, y ordenación cronológica `created_at ASC`).
  - Cálculo de capacidades vigentes (`canClassify`, `canRequestAccess`, `canPreventiveHide`, `canResolve`) en detalle según estado y ciclo de vida de la media.
- **Criterios de aceptación verificados:**
  - Escenario 1: Consulta de la cola devuelve items sanitizados, ordenables y priorizados por severidad y fecha, **sin exponer previewUrl ni URLs de descarga multimedia en ningún elemento de la lista**, preservando la privacidad per `DEC-088`.
  - Escenario 2: Consulta de detalle entrega historial completo inmutable desde `media_case_history` y mapa de capacidades vigentes, sin emitir preview automático (requiere grant justificado explícito de EL-TK-117).
  - Escenario 3: Distinción inequívoca de estados vacíos: `EMPTY_QUEUE` cuando la cola no tiene registros vs `EMPTY_FILTER_RESULTS` cuando existen casos en el sistema pero el filtro actual no tiene coincidencias.
- **Pruebas:** 3 pruebas unitarias en `media-report-and-removal.unit.test.ts` y prueba de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16 real. Build limpio.

