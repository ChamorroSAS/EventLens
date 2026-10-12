# EL-TK-068 — Suspender administrativamente un evento conservando su estado previo

## Parent epic
EL-EP-003

## Status
DONE

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
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (EL-TK-044 disponible).

## Implementation Evidence — 2026-10-11
- **Branch:** `feature/EL-TK-068`
- **Schema & Migration:**
  - Added columns `previous_status`, `suspension_reason`, `suspended_at`, `scheduled_at`, `expires_at`, `grace_ends_at`, and `revision BIGINT DEFAULT 1` to `event` table in migration `202610110033_event_lifecycle/migration.sql`.
  - Schema assembled and deployed via Prisma migrate.
- **Service & Contracts:**
  - Expanded `EventRecord` and `EventStatus` with `SUSPENDED` and lifecycle columns in `packages/event-management/src/contracts.ts`.
  - Implemented `EventLifecycleService.suspendEvent` in `packages/event-management/src/event-lifecycle.ts` enforcing `AdminActorContext` (`ADMIN_HUMAN`), mandatory justification, `FOR UPDATE` transactional row locks, rejection of terminal `DELETED` state (`TERMINAL_STATE_CANNOT_SUSPEND`), optimistic revision increment, and audit sink recording (`EVENT_SUSPENDED`).
  - Exported `EventLifecycleService`, `SuspendEventCommand`, and `SuspendEventResult` from `@eventlens/event-management`.
- **Test Coverage:**
  - Unit tests (`packages/event-management/test/event-suspension.unit.test.ts`): 8 tests passing.
  - Integration tests (`packages/event-management/test/event-suspension.integration.test.ts`): 3 tests passing against PostgreSQL 16.
  - Full workspace test suite (`node scripts/workspace.mjs test`): all packages passing cleanly.
