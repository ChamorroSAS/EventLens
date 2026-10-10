# EL-TK-066 — Reabrir un evento CLOSED antes de vencer

## Parent epic
EL-EP-003

## Status
READY

## User story
**Como** organizador, **quiero** reabrir un evento CLOSED todavía vigente, **para** permitir nuevamente la participación sin extender su plazo.

## Alcance funcional
CLOSED→ACTIVE únicamente mientras no haya vencido.

## Fuera de alcance
Extender vigencia, reactivar SUSPENDED o salir de GRACE_PERIOD.

## Criterios de aceptación
### Escenario 1
**Dado** un CLOSED aún vigente, **cuando** el propietario lo reabre, **entonces** vuelve a ACTIVE conservando el mismo vencimiento.

### Escenario 2
**Dado** un CLOSED cuyo vencimiento ya pasó, **cuando** intenta reabrirse, **entonces** se deniega y se reconcilia con el estado temporal aplicable.

## Reglas de negocio
Reabrir no altera el ancla temporal.

## Validaciones y permisos
Solo propietario autorizado.

## Casos de error y estados vacíos
Conflicto con vencimiento o suspensión devuelve estado vigente.

## Datos / contratos afectados
status y lifecycle revision.

## Dependencias técnicas y funcionales
Cierre manual y timeline canónico.

## Dependencias de tickets
- **depends_on:** EL-TK-065, EL-TK-062.
- **blocks:** EL-TK-071, EL-TK-072.

## Pruebas requeridas
Antes/después del vencimiento, autorización, carrera y replay.

## Observabilidad / auditoría
Auditar CLOSED→ACTIVE y denegaciones relevantes.

## Prioridad / estimación
P0 / S

## Traceability
Q-015; DEC-017, DEC-077, DEC-082; EL-EP-003.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el comando de reapertura CLOSED→ACTIVE consumido por la acción «Reabrir evento» en EventLifecycleAction conforme al handoff UI/UX de EL-EP-003.
