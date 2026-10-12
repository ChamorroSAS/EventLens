# EL-TK-069 — Reactivar un evento SUSPENDED recalculando su estado vigente

## Parent epic
EL-EP-003

## Status
DONE

## Implementation & Verification Evidence
- **Method:** `EventLifecycleService.reactivateEvent(command: ReactivateEventCommand)`
- **DEC-081 & DEC-078 Business Rules Implemented:**
  - Exige rol de administrador humano (`ADMIN_HUMAN`), rechazando accesos no autorizados con `UNAUTHORIZED`.
  - Recalcula el estado vigente a fecha actual `now`:
    - Si el fin de gracia ya transcurrió (`now >= grace_ends_at`), prevalece `PENDING_DELETION` y se fija `purge_started_at`.
    - Si la vigencia ya transcurrió (`now >= expires_at`), prevalece `GRACE_PERIOD`.
    - Si se encuentra dentro de vigencia: restaura `previous_status` para `DRAFT`, `CLOSED` (conservando cierre voluntario per DEC-081), `ACTIVE`, y para `SCHEDULED` compara `now >= scheduled_at` pasando a `ACTIVE` con `activated_at = now` o conservando `SCHEDULED` si el inicio aún es futuro.
  - Limpia atómicamente en PostgreSQL los campos de suspensión: `suspended_at = NULL`, `suspension_reason = NULL`, `previous_status = NULL`.
  - Rechaza si el evento no está en `SUSPENDED` (`EVENT_NOT_SUSPENDED`) o si `previous_status` es terminal/inválido (`INVALID_PREVIOUS_STATUS`).
  - Idempotencia determinista: repeticiones exactas devuelven `IDEMPOTENT_REPLAY` sin doble transición.
  - Registro de auditoría `EVENT_REACTIVATED` con resultado `SUCCESS` o `IDEMPOTENT_REPLAY`.
- **Tests & Evidence:**
  - 6 tests unitarios en `test/event-lifecycle.unit.test.ts`.
  - 2 tests de integración en PostgreSQL 16 real en `test/event-lifecycle.integration.test.ts`.
  - Suite de validación en Docker: 82/82 tests PASS.

## User story
**Como** administrador autorizado, **quiero** levantar una suspensión, **para** devolver el evento al estado temporal que realmente corresponde en ese instante.

## Alcance funcional
Salir de SUSPENDED aplicando DEC-081: DRAFT/CLOSED/ACTIVE según previous_status; SCHEDULED compara inicio con ahora; vencimiento/gracia prevalecen.

## Fuera de alcance
Extender automáticamente la vigencia o restaurar ciegamente previous_status.

## Criterios de aceptación
### Escenario 1
**Dado** SUSPENDED aún dentro de vigencia, **cuando** se reactiva, **entonces** aplica el mapping de estado previo y tiempo actual.

### Escenario 2
**Dado** SUSPENDED cuyo vencimiento o gracia transcurrió, **cuando** se reactiva, **entonces** prevalece GRACE_PERIOD/PENDING_DELETION según corresponda.

### Escenario 3
**Dado** previous_status SCHEDULED, **cuando** se reactiva, **entonces** compara scheduledAt con ahora para elegir SCHEDULED o ACTIVE si aún es temporalmente válido.

## Reglas de negocio
Nunca restaurar DELETED. Tiempo de suspensión sigue contando.

## Validaciones y permisos
Solo administración autorizada.

## Casos de error y estados vacíos
previous_status inválido o revisión obsoleta falla cerrado sin transición parcial.

## Datos / contratos afectados
status, previous_status, timestamps y lifecycle revision.

## Dependencias técnicas y funcionales
Cálculo temporal, suspensión y transición automática.

## Dependencias de tickets
- **depends_on:** EL-TK-062, EL-TK-067, EL-TK-068, EL-TK-044.
- **blocks:** EL-TK-071, EL-TK-072.

## Pruebas requeridas
Cada mapping DEC-081, suspensión que cruza vencimiento/gracia, permisos y concurrencia.

## Observabilidad / auditoría
Auditar actor, previous_status, estado calculado y motivo/resultado.

## Prioridad / estimación
P0 / M

## Traceability
Q-015, Q-017; DEC-017, DEC-078, DEC-081, DEC-082; EL-EP-003, EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: PARTIAL (YES para el alcance contractual propio neutral de reactivación y mapping temporal de DEC-081 consumido por ReactivateEventDialog según el handoff UI/UX; NO para ejecución integrada humana hasta la disponibilidad de autenticación administrativa EL-TK-044).
