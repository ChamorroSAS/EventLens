# EL-TK-067 — Avanzar automáticamente por vencimiento y fin de gracia

## Parent epic
EL-EP-003

## Status
DRAFT

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
**Dado** GRACE_PERIOD cuyo graceEndsAt llega, **cuando** corre el scheduler, **entonces** queda PENDING_DELETION según el contrato de EL-EP-015, sin purgar contenido aquí.

### Escenario 3
**Dado** SUSPENDED que atraviesa vencimiento o gracia, **cuando** pasa el tiempo, **entonces** los plazos no se congelan.

## Reglas de negocio
No existe EXPIRED. Scheduler/worker debe ser recuperable e idempotente.

## Validaciones y permisos
Transiciones del sistema; acciones humanas no invocan este ticket directamente.

## Casos de error y estados vacíos
Job duplicado, retrasado o recuperado no produce retrocesos ni resurrección.

## Datos / contratos afectados
status efectivo, expiresAt, graceEndsAt, lifecycle revision, JobQueue.

## Dependencias técnicas y funcionales
Scheduler/Workers, JobQueue PostgreSQL y contrato de EL-EP-015 para PENDING_DELETION.

## Dependencias de tickets
- **depends_on:** EL-TK-062, EL-TK-064, EL-TK-065, EL-TK-055 y contrato de EL-EP-015.
- **blocks:** EL-TK-069, EL-TK-071, EL-TK-072.

## Pruebas requeridas
Vencimiento ACTIVE/CLOSED, fin de gracia, SUSPENDED atravesando plazos, retry/replay y job tardío.

## Observabilidad / auditoría
Registrar transición temporal, scheduledAt del job, ejecución y resultado.

## Prioridad
P0

## Estimación
M

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
