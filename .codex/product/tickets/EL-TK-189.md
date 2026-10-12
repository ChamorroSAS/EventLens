# EL-TK-189 — Solicitar eliminación manual de evento con bloqueo inmediato

## Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** organizador, **quiero** solicitar borrar un evento propio tras confirmación explícita, **para** abrir ventana cancelable de 72 horas sin exposición de nuevos aportes.

## Alcance funcional
Comando owner de solicitud de evento, requestId/revisión/idempotency; barrera PREPARE antes de SQL; evento PENDING_DELETION, cancelUntil fijo 72h, rechazo de uploads/acceso público desde solicitud, ancla física al vencer ventana.

## Fuera de alcance
No purga física, eliminación de cuenta, ni reautenticación adicional para evento.

## Criterios de aceptación
### Escenario 1
Dado evento propio elegible, cuando confirma, entonces queda PENDING_DELETION y bloqueado con cancelUntil exacto.

### Escenario 2
Dado retry o ACK incierto, cuando se consulta/reconcilia, entonces conserva el mismo request, ancla prevista y no levanta barrera.

### Escenario 3
Dado evento ajeno, DELETED o restricción concurrente, cuando solicita, entonces no pierde datos ni concede acceso.

## Reglas de negocio
No anclar purga al clic ni dar ventana nueva después de la gracia; UTC servidor, snapshot evento actual.

## Validaciones y permisos
Solo organizador dueño con sesión autorizada y confirmación explícita; CAS/revisión.

## Casos de error y estados vacíos
409 por cambios, 403 sin enumeración, 503/timeout resultado UNKNOWN.

## Datos / contratos afectados
MOD-002 lifecycle owner port, MOD-008 request endpoint, RecoveryAuthority barrier.

## Dependencias técnicas y funcionales
EL-TK-188, EL-TK-072; integración con 193 antes de exposición completa.

## Dependencias de tickets
- **depends_on:** EL-TK-188, EL-TK-072; integración con 193 antes de exposición completa.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
PostgreSQL real y authority PREPARE/SQL/ACK, carreras con uploads, doble click, sesión revocada, reloj borde.

## Observabilidad / auditoría
Auditar causa, actor, requestId y barrera sin URLs ni credenciales.

## Prioridad / estimación
P0 / M

## Traceability
DEC-043/091/092/097..099; ARCH-002/010; EL-EP-003/015

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
- **Implementación:** `packages/event-management/src/manual-deletion-workflows.ts` (`ManualDeletionWorkflowService.requestManualEventDeletion`), `packages/event-management/prisma/migrations/202610120054_deletion_barriers/migration.sql`.
- **Verificación:** `packages/event-management/test/manual-deletion-workflows.unit.test.ts` y `packages/event-management/test/manual-deletion-workflows.integration.test.ts` (PASS en PostgreSQL 16 real: ventana fija 72h, barrera `PREPARE -> SQL -> ACK`, revocación guest/credenciales públicas, vigilancia de writers en vuelo, prohibición tras fin de gracia, aislamiento sin enumeración y estado `OUTCOME_UNKNOWN`).

