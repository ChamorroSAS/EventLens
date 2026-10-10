# EL-TK-070 — Extender la vigencia autorizada de un evento

## Parent epic
EL-EP-003

## Status
DRAFT

## User story
**Como** administrador autorizado, **quiero** aplicar una ampliación válida de vigencia, **para** extender la disponibilidad sin alterar las condiciones base del plan.

## Alcance funcional
Consumir una ampliación/override autorizada por EL-EP-011, recalcular vencimiento/gracia y reconciliar el estado si el evento estaba en GRACE_PERIOD.

## Fuera de alcance
Comprar ampliaciones, definir precios o modificar el plan base.

## Criterios de aceptación
### Escenario 1
**Dado** un override autorizado, **cuando** se aplica, **entonces** recalcula expiresAt/graceEndsAt de forma consistente con el contrato de capacidad.

### Escenario 2
**Dado** un evento en GRACE_PERIOD que vuelve a quedar dentro de vigencia por una ampliación válida, **cuando** se aplica, **entonces** se reconcilia al estado permitido por lifecycle sin inventar estado nuevo.

### Escenario 3
**Dado** PENDING_DELETION o una eliminación concurrente no reversible según EL-EP-015, **cuando** llega una ampliación incompatible, **entonces** se rechaza por conflicto.

## Reglas de negocio
La ampliación no cambia silenciosamente el plan base ni revive DELETED.

## Validaciones y permisos
Solo actor administrativo autorizado y override vigente.

## Casos de error y estados vacíos
Override inexistente, consumido, expirado o conflicto de eliminación no modifica timeline.

## Datos / contratos afectados
validity override, expiresAt, graceEndsAt, status/lifecycle revision.

## Dependencias técnicas y funcionales
Contrato de EL-EP-011 y coordinación con EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-062 y contrato de ampliaciones de EL-EP-011.
- **blocks:** EL-TK-071, EL-TK-072.

## Pruebas requeridas
Recalculo, GRACE→estado vigente, conflicto de eliminación, idempotencia y auditoría.

## Observabilidad / auditoría
Auditar override aplicado, actor, timeline anterior/nuevo y resultado.

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
