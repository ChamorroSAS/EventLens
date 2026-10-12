# EL-TK-201 — Integrar eliminación de cuenta y reautenticación en UI

## Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** organizador, **quiero** solicitar o cancelar borrado de cuenta con contraseña vigente, **para** gestionar la ventana de siete días sin perder el control de su acceso restringido.

## Alcance funcional
Reutilizar ConfirmDialog, LoginForm.REAUTH_ACCOUNT, SecurityNotice y consulta restringida; challenge→verify→comando; prueba temporal solo en memoria; seguimiento de estado/cancelUntil, ACK incierto, WAI/WCAG2.2AA. El [handoff aprobado](../../context/ui-deletion-flow.md) es normativo para estados, errores, mobile/tablet/desktop y accesibilidad; no se duplica la variante de identidad.

## Fuera de alcance
No crear AccountDeletionDialog ni persistir contraseña/evidence en localStorage, no usar email/token de reset para reauth.

## Criterios de aceptación
### Escenario 1
Dada solicitud, cuando confirma consecuencias y reautentica, entonces consume proof solo en el comando apropiado y muestra estado confirmado.

### Escenario 2
Dada cuenta pendiente, cuando entra en sesión restringida, entonces puede consultar/cancelar pero no ver funciones ordinarias.

### Escenario 3
Dado proof vencido, cambiado o timeout, cuando reintenta, entonces limpia secreto y consulta resultado antes de nuevo challenge.

## Reglas de negocio
Challenge/evidence ≤5 minutos, one-use y ligadas a operación; cancel de cuenta requiere challenge nuevo.

## Validaciones y permisos
Autorización completamente server-side; no credential/evidence en logs/UI state persistente.

## Casos de error y estados vacíos
Credencial errónea, 429, 409 revision, ACK UNKNOWN, cierre/modal, logout.

## Datos / contratos afectados
Cliente OpenAPI MOD-001/008, LoginForm, SecurityNotice, restricted account management.

## Dependencias técnicas y funcionales
EL-TK-186, EL-TK-191, EL-TK-192, EL-TK-193.

## Dependencias de tickets
- **depends_on:** EL-TK-186, EL-TK-191, EL-TK-192, EL-TK-193.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Playwright mobile/tablet/desktop, teclado/foco/semántica accesible, double click, expired evidence, restricted login y no disclosure; comprobación manual con lector de pantalla. Playwright por sí solo no acredita esa comprobación manual.

## Observabilidad / auditoría
Telemetría sin password/proof; a11y feedback seguro.

## Prioridad / estimación
P0 / L

## Traceability
DEC-107/108; ARCH-017/018; ui-deletion-flow.md; EL-EP-015

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
- **Implementación:** `packages/event-management/src/deletion-ui-controllers.ts` (`AccountDeletionUiController`, `LoginFormReauthAccountViewModel`, `AccountDeletionUiViewModel`) y `apps/web/src/app/deletion-management.component.ts` (`DeletionManagementComponent`).
- **Verificación:** `packages/event-management/test/deletion-ui-workflows.unit.test.ts`, `packages/event-management/test/deletion-beta-e2e.integration.test.ts` y `apps/web/src/app/deletion-management.component.spec.ts` (PASS).

