# EL-TK-070 — Extender la vigencia autorizada de un evento

## Parent epic
EL-EP-003

## Status
READY

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
La ampliación no cambia silenciosamente el plan base ni revive DELETED. Conforme a DEC-102, después de ACTIVE se bloquean reducciones de vigencia o retornos al plan base que dejen el vencimiento en el pasado.

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

## Prioridad / estimación
P0 / M

## Traceability
Q-015, Q-017; DEC-017, DEC-020, DEC-082, DEC-093, DEC-095, DEC-100, DEC-102; EL-EP-003, EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el handler propio de extensión en lifecycle consumido por AdminUsageOverrideForm (EL-EP-011) conforme a DEC-102 y las directrices del handoff UI/UX de EL-EP-003.
