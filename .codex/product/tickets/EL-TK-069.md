# EL-TK-069 — Reactivar un evento SUSPENDED recalculando su estado vigente

## Parent epic
EL-EP-003

## Status
DRAFT

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
