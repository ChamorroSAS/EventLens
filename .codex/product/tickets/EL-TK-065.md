# EL-TK-065 — Cerrar manualmente un evento ACTIVE

## Parent epic
EL-EP-003

## Status
DONE

## Resolution
Implementado el cierre manual `ACTIVE -> CLOSED` con preservación canónica de `expiresAt` y `graceEndsAt` bajo DEC-077 y DEC-082. Implementado rechazo si ya expiró (`EVENT_ALREADY_EXPIRED`), aislamiento por propietario (`UNAUTHORIZED`), serialización bajo `FOR UPDATE` con replay idempotente y auditoría `EVENT_CLOSED`. Validado con 52 pruebas (100% PASS) en laboratorio PostgreSQL 16 aislado y typecheck global en verde.

## User story
**Como** organizador, **quiero** cerrar un evento ACTIVE, **para** detener la participación general sin pausar su vigencia.

## Alcance funcional
ACTIVE→CLOSED antes del vencimiento.

## Fuera de alcance
Pausa de vigencia, suspensión administrativa o purga.

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio ACTIVE antes de vencer, **cuando** el organizador lo cierra, **entonces** queda CLOSED y conserva expiresAt/graceEndsAt.

### Escenario 2
**Dado** un evento ya vencido, **cuando** llega un cierre manual tardío, **entonces** prevalece la transición temporal correspondiente y no se resucita CLOSED.

## Reglas de negocio
CLOSED no pausa vigencia.

## Validaciones y permisos
Solo propietario autorizado; DELETED nunca transiciona.

## Casos de error y estados vacíos
Conflicto temporal/concurrente devuelve estado vigente sin efecto parcial.

## Datos / contratos afectados
status, previous transition metadata, lifecycle revision.

## Dependencias técnicas y funcionales
Lifecycle ACTIVE y cálculo temporal vigente.

## Dependencias de tickets
- **depends_on:** EL-TK-064.
- **blocks:** EL-TK-066, EL-TK-067, EL-TK-071, EL-TK-072.

## Pruebas requeridas
Happy path, permiso, carrera con vencimiento, replay y rollback.

## Observabilidad / auditoría
Auditar actor, ACTIVE→CLOSED y resultado.

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
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el comando de cierre manual ACTIVE→CLOSED consumido por EventCloseDialog conforme al handoff UI/UX de EL-EP-003.
