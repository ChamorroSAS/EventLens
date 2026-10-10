# EL-TK-067 — Avanzar automáticamente por vencimiento y fin de gracia

## Parent epic
EL-EP-003

## Status
READY

## User story
**Como** sistema, **quiero** avanzar el lifecycle al vencer la vigencia y la gracia, **para** aplicar restricciones temporales aunque no haya tráfico.

## Alcance funcional
ACTIVE/CLOSED al vencer → GRACE_PERIOD; al finalizar gracia → PENDING_DELETION conforme contrato de eliminación. Si está SUSPENDED, el tiempo sigue avanzando y la reconciliación conserva la barrera administrativa.

## Fuera de alcance
Purga física y transición final ejecutada por EL-EP-015.

## Criterios de aceptación
### Escenario 1
**Dado** ACTIVE o CLOSED cuyo expiresAt llega, **cuando** corre el scheduler, **entonces** el lifecycle efectivo entra en GRACE_PERIOD idempotentemente.

### Escenario 2
**Dado** GRACE_PERIOD cuyo graceEndsAt llega, **cuando** corre el scheduler, **entonces** queda PENDING_DELETION fijando purge_started_at conforme a DEC-092 y el contrato de EL-EP-015, sin purgar contenido aquí.

### Escenario 3
**Dado** SUSPENDED que atraviesa vencimiento o gracia, **cuando** pasa el tiempo, **entonces** los plazos no se congelan.

## Reglas de negocio
No existe EXPIRED. Scheduler/worker debe ser recuperable e idempotente.

## Validaciones y permisos
Transiciones del sistema; acciones humanas no invocan este ticket directamente.

## Casos de error y estados vacíos
Job duplicado, retrasado o recuperado no produce retrocesos ni resurrección.

## Datos / contratos afectados
status efectivo, expiresAt, graceEndsAt, purge_started_at, lifecycle revision, JobQueue.

## Dependencias técnicas y funcionales
Scheduler/Workers, JobQueue PostgreSQL y contrato de EL-EP-015 para PENDING_DELETION.

## Dependencias de tickets
- **depends_on:** EL-TK-062, EL-TK-064, EL-TK-065, EL-TK-055 y contrato de EL-EP-015.
- **blocks:** EL-TK-069, EL-TK-071, EL-TK-072.

## Pruebas requeridas
Vencimiento ACTIVE/CLOSED, fin de gracia, SUSPENDED atravesando plazos, retry/replay y job tardío.

## Observabilidad / auditoría
Registrar transición temporal, scheduledAt del job, ejecución y resultado.

## Prioridad / estimación
P0 / M

## Traceability
Q-010, Q-015; DEC-012, DEC-017, DEC-061..064, DEC-078, DEC-082, DEC-092, DEC-098; EL-EP-003, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el worker de transiciones temporales encolado en JobQueue PostgreSQL (EL-TK-055 DONE); sus cambios de estado se reflejan en la UI vía refresco del snapshot sin robar foco ni emitir anuncios de tick según el handoff UI/UX de EL-EP-003.
