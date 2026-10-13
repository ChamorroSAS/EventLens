# EL-TK-122 — Integrar cola y resolución de casos en la consola administrativa

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** administración autorizada, **quiero** revisar y resolver casos desde una interfaz restringida, **para** aplicar intervención justificada con trazabilidad.

## Alcance funcional
Integrar AdminModerationPanel, ReportQueue, ReportDetail, ReportSeverityBadge y AdministrativeActionReason con clasificación, acceso justificado, ocultamiento y resolución.

## Fuera de alcance
Nueva consola paralela, impersonación, acceso a media sin motivo o funciones fuera del contrato.

## Criterios de aceptación
### Escenario 1
**Dado** admin abre cola, **cuando** navega, **entonces** ve casos sanitizados y prioridad.

### Escenario 2
**Dado** necesita inspeccionar media, **cuando** solicita acceso, **entonces** se exige motivo antes del preview.

### Escenario 3
**Dado** resuelve/oculta, **cuando** confirma, **entonces** la UI muestra resultado real y no afirma purga antes de completarse.

## Reglas de negocio
Sin preview sensible en listado. Acciones usan capacidades server-side.

## Validaciones y permisos
Sesión admin vigente y capabilities por acción.

## Casos de error y estados vacíos
Permiso vencido, caso resuelto concurrentemente, media no disponible, action failure y reauth si aplica.

## Datos / contratos afectados
Clientes EL-TK-116..120 y componentes admin existentes.

## Dependencias técnicas y funcionales
Consola EL-EP-012 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-117, EL-TK-118, EL-TK-119, EL-TK-120; contrato EL-EP-012
- **blocks:** EL-TK-123

## Pruebas requeridas
Cola/detalle, motivo, accesibilidad, actor ajeno, conflicto y resultado parcial.

## Observabilidad / auditoría
Acciones delegan auditoría a backend; UI no persiste media.

## Prioridad / estimación
P0 / M

## Traceability
DEC-019, DEC-088; EL-EP-009, EL-EP-012, EL-EP-014; ui-mvp-epic-review.md#el-ep-009.

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
  - Componentes de administración creados en `apps/web/src/app/admin/`:
    - `ReportSeverityBadgeComponent`: distintivo visual accesible de severidad (`CRITICAL`, `NORMAL`, `UNCLASSIFIED`).
    - `AdministrativeActionReasonDialogComponent`: diálogo modal accesible para capturar justificación obligatoria antes de ejecutar acciones sensibles (clasificación, acceso a media, ocultamiento preventivo, resolución).
    - `ReportQueueComponent`: cola de moderación sanitizada, ordenable por severidad y fecha, **sin exponer miniaturas multimedia de privacidad en el listado**, distinguiendo con precisión `EMPTY_QUEUE` de `EMPTY_FILTER_RESULTS`.
    - `ReportDetailComponent`: vista de detalle con capacidades basadas en el ciclo de vida del caso y del catálogo, solicitud de acceso con grant temporal de 15 minutos previa justificación, clasificación prioritaria (`DEC-088`), ocultamiento preventivo a `HIDDEN`, resolución formal (`ACTION_TAKEN`, `RESOLVED`, `DISMISSED`) con purga downstream sin falsas promesas prematuras e historial inmutable.
    - `AdminModerationPanelComponent`: orquestador de cola y detalle integrado en `AdminAppShellComponent` con pestaña "Moderación y Casos".
  - Integración en `AdminApiService` con endpoints: `getModerationQueue`, `getCaseDetail`, `classifyCase`, `grantMediaAccess`, `applyPreventiveHide`, `resolveCase`.
- **Criterios de aceptación verificados:**
  - Escenario 1: El administrador consulta la cola de moderación, visualiza casos ordenados y priorizados sanitizados sin exposición visual de multimedia privada.
  - Escenario 2: Inspección técnica de multimedia sensible requiere solicitud explícita con justificación obligatoria y entrega preview temporal acotado a 15 minutos.
  - Escenario 3: Ocultamiento preventivo y resolución definitiva reflejan el estado real del servidor, despachando purga irreversible downstream y preservando historial inmutable.
- **Pruebas:** 6 pruebas unitarias en `apps/web/src/app/admin/admin-moderation-panel.component.spec.ts`. Suite completa web (18 archivos, 101 tests) pasando sin regresiones. Typecheck Angular limpio.
