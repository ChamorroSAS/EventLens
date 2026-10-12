# EL-TK-068 — Suspender administrativamente un evento conservando su estado previo

## Parent epic
EL-EP-003

## Status
DONE

## Implementation & Verification Evidence
- **Method:** `EventLifecycleService.suspendEvent(command: SuspendEventCommand)`
- **Schema & Migration:** `packages/event-management/prisma/migrations/202610110036_event_suspension/migration.sql` (`suspended_at TIMESTAMPTZ`, `suspension_reason TEXT`, `previous_status TEXT`).
- **DEC-078 Business Rules:**
  - Preserva `previous_status` del evento al momento de suspender.
  - Guarda `suspension_reason` (requerido, trim) y `suspended_at`.
  - La suspensión NO altera ni pausa `expires_at` ni `grace_ends_at`.
  - Rechaza suspensión si el evento se encuentra en estado terminal (`PENDING_DELETION` o `ARCHIVED`) con `EVENT_TERMINAL`.
  - Exige autorización de administrador humano (`ADMIN_HUMAN`); rechaza organizadores u otros actores con `UNAUTHORIZED`.
  - Idempotencia determinista: repetición idéntica retorna `IDEMPOTENT_REPLAY` y audita evento sin alterar `previous_status`.
- **Tests & Evidence:**
  - 5 tests unitarios en `test/event-lifecycle.unit.test.ts`.
  - 2 tests de integración en PostgreSQL 16 real en `test/event-lifecycle.integration.test.ts`.
  - Suite de validación en Docker: 74/74 tests PASS.

## User story
**Como** administrador autorizado, **quiero** suspender un evento con motivo justificado, **para** bloquear su operación sin perder el estado previo necesario para una revisión posterior.

## Alcance funcional
Transición a SUSPENDED conservando previous_status y motivo administrativo.

## Fuera de alcance
Pausar vigencia, borrar contenido o decidir investigaciones legales.

## Criterios de aceptación
### Escenario 1
**Dado** un evento suspendible, **cuando** un admin autorizado lo suspende con motivo, **entonces** queda SUSPENDED y registra previous_status.

### Escenario 2
**Dado** un evento DELETED, **cuando** se intenta suspender, **entonces** se rechaza por ser terminal.

## Reglas de negocio
SUSPENDED no pausa vigencia ni gracia.

## Validaciones y permisos
Solo administración autorizada; motivo obligatorio conforme contrato administrativo.

## Casos de error y estados vacíos
Operación sin permiso/motivo o conflicto de revisión no modifica el evento.

## Datos / contratos afectados
status, previous_status, suspensionReason, lifecycle revision.

## Dependencias técnicas y funcionales
Consume identidad/grant administrativo y auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-044.
- **blocks:** EL-TK-069, EL-TK-071, EL-TK-072.

## Pruebas requeridas
Permisos, motivo, estado previo, DELETED terminal, concurrencia y rollback.

## Observabilidad / auditoría
Auditar administrador, motivo sanitizado, estado previo y revisión.

## Prioridad / estimación
P0 / S

## Traceability
Q-015, Q-017; DEC-017, DEC-019, DEC-078; EL-EP-003, EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: PARTIAL (YES para el alcance contractual propio neutral de suspensión y registro de previous_status consumido por SuspendEventDialog según el handoff UI/UX; NO para ejecución integrada humana hasta la disponibilidad de autenticación administrativa EL-TK-044).
