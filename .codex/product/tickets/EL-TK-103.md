# EL-TK-103 — Aprobar una media pendiente de revisión

## Parent epic
EL-EP-008

## Status
READY

## User story
**Como** organizador propietario, **quiero** aprobar una media pendiente, **para** publicarla cuando no exista un bloqueo vigente.

## Alcance funcional
Autorizar la transición de una media PENDING_REVIEW a PUBLISHED desde la biblioteca del evento, revalidando ownership, estado y barreras de seguridad/retiro.

## Fuera de alcance
Cambiar el modo de moderación, liberar cuarentena, resolver denuncias o publicar contenido que no esté pendiente.

## Criterios de aceptación
### Escenario 1
**Dado** una media propia en PENDING_REVIEW sin bloqueos, **cuando** el organizador la aprueba, **entonces** pasa a PUBLISHED y queda visible para la galería guest cuando ésta esté habilitada.

### Escenario 2
**Dado** la media tiene un bloqueo de seguridad o retiro vigente, **cuando** se intenta aprobar, **entonces** la transición se rechaza sin modificar el estado.

### Escenario 3
**Dado** la media dejó de estar PENDING_REVIEW por una carrera, **cuando** llega el comando, **entonces** se devuelve conflicto idempotente sin forzar publicación.

## Reglas de negocio
Aprobar no evade seguridad, retiro ni lifecycle. La visibilidad guest sigue dependiendo de EL-EP-007 y guest_gallery_enabled.

## Validaciones y permisos
Solo propietario del evento; autorización server-side y estado vigente.

## Casos de error y estados vacíos
Media no encontrada, actor ajeno, estado incompatible, bloqueo vigente y conflicto concurrente.

## Datos / contratos afectados
Media moderation command, publicationState, version/concurrency token, actorId, reason opcional si el contrato vigente lo contempla.

## Dependencias técnicas y funcionales
Biblioteca owner de EL-EP-007 y estado/procesamiento de EL-EP-006.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-037
- **blocks:** EL-TK-111, EL-TK-112

## Pruebas requeridas
Aprobación válida, actor ajeno, bloqueo seguridad/retiro, carrera de estado e idempotencia.

## Observabilidad / auditoría
Auditar actor, media, estado anterior/nuevo y resultado sin guardar contenido binario.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019; DEC-005, DEC-087, DEC-096; EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-086/087/096 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §8.5..9; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
