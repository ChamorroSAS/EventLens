# EL-TK-200 — Integrar solicitud y cancelación de eliminación en UI de evento

## Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** organizador, **quiero** gestionar el borrado de evento desde su detalle, **para** ver consecuencias y fecha límite antes de confirmar.

## Alcance funcional
Reutilizar EventDeleteRequestDialog, EventDeletionCountdown, EventLifecyclePanel, RetentionNotice; cliente Angular generado de OpenAPI; fechas exactas zona evento, mensajes pending/UNKNOWN, estados permitidos servidor, accesibilidad. El [handoff aprobado](../../context/ui-deletion-flow.md) es normativo para estados, errores, mobile/tablet/desktop y WCAG 2.2 AA; no se duplica el catálogo.

## Fuera de alcance
No crear páginas de jobs ni permitir cancelar gracia/retirada irreversible.

## Criterios de aceptación
### Escenario 1
Dado evento propio, cuando abre diálogo, entonces muestra recurso, bloqueo, 72h y salida antes de solicitar.

### Escenario 2
Dada solicitud cancelable, cuando consulta detalle, entonces fecha exacta y countdown textual muestran solo acción servidor disponible.

### Escenario 3
Dada petición timeout/409/503, cuando reconsulta, entonces no indica cancelación o purga como efectuada sin ACK.

## Reglas de negocio
Cuenta/evento manual distintos; countdown no mueve deadlines UTC; no progreso de backup ficticio.

## Validaciones y permisos
Permisos API servidor, cierre de foco y sin auth derivada de UI.

## Casos de error y estados vacíos
Doble clic, sesión perdida, rate limit, error de red, límite de plazo y permisos read-only.

## Datos / contratos afectados
Angular/OpenAPI, EventDeleteRequestDialog, Countdown, LifecyclePanel.

## Dependencias técnicas y funcionales
EL-TK-189, EL-TK-190, EL-TK-193; handoff UI aprobado.

## Dependencias de tickets
- **depends_on:** EL-TK-189, EL-TK-190, EL-TK-193; handoff UI aprobado.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Componentes y Playwright mobile/tablet/desktop, teclado/foco/semántica accesible, conflicto/caducidad/UNKNOWN y mocks respuesta API; comprobación manual con lector de pantalla. Playwright por sí solo no acredita esa comprobación manual.

## Observabilidad / auditoría
No guardar credenciales ni firmados; telemetría de interacción agregada.

## Prioridad / estimación
P0 / M

## Traceability
DEC-043/091/092; ui-deletion-flow.md; EL-EP-015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: YES.
READY_FOR_FRONTEND_PLANNING: YES — dictamen explícito ui_designer APPROVED.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12.

## Evidencia de cierre — 2026-10-12
- **Implementación:** `packages/event-management/src/deletion-ui-controllers.ts` (`EventDeletionUiController`, `EventDeleteRequestDialogViewModel`, `EventDeletionCountdownViewModel`, `EventLifecycleDeletionPanelViewModel`) y `apps/web/src/app/deletion-management.component.ts` (`DeletionManagementComponent`).
- **Verificación:** `packages/event-management/test/deletion-ui-workflows.unit.test.ts`, `packages/event-management/test/deletion-beta-e2e.integration.test.ts` y `apps/web/src/app/deletion-management.component.spec.ts` (PASS).

