# EL-TK-063 — Programar un evento DRAFT para apertura futura

## Parent epic
EL-EP-003

## Status
READY

## User story
**Como** organizador, **quiero** pasar un evento DRAFT a SCHEDULED, **para** que quede preparado para abrir en su instante programado.

## Alcance funcional
Transición DRAFT→SCHEDULED validando configuración temporal y vigencia.

## Fuera de alcance
Activación, cambio de plan, purga o acceso guest.

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio DRAFT con programación válida, **cuando** el organizador lo programa, **entonces** queda SCHEDULED con timeline canónico persistido.

### Escenario 2
**Dado** un borrador sin datos mínimos requeridos, **cuando** se intenta programar, **entonces** no cambia de estado y devuelve validación accionable.

## Reglas de negocio
Solo DRAFT puede programarse por esta acción.

## Validaciones y permisos
Solo propietario autorizado del evento.

## Casos de error y estados vacíos
Conflicto de versión, configuración incompleta o timeline inválido no producen transición parcial.

## Datos / contratos afectados
status, scheduledAt, expiresAt, graceEndsAt, lifecycle revision.

## Dependencias técnicas y funcionales
Requiere programación de EL-EP-002 y cálculo temporal común.

## Dependencias de tickets
- **depends_on:** EL-TK-020, EL-TK-023, EL-TK-062.
- **blocks:** EL-TK-064, EL-TK-071.

## Pruebas requeridas
Permisos, transición válida, configuración incompleta, concurrencia y rollback.

## Observabilidad / auditoría
Registrar actor, estado anterior/nuevo y revisión sin secretos.

## Prioridad / estimación
P0 / S

## Traceability
Q-015; DEC-017, DEC-077, DEC-082; EL-EP-003, EL-EP-002.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el comando de programación DRAFT→SCHEDULED consumido por EventScheduleForm según el handoff UI/UX de EL-EP-003.
