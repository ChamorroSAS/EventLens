# EL-TK-141 — Revisar y decidir solicitudes de ampliación

## Parent epic
EL-EP-011

## Status
READY

## User story
**Como** administración autorizada, **quiero** aprobar, rechazar o pedir información sobre una solicitud, **para** gestionar excepciones con trazabilidad sin alterar reglas de dominio.

## Alcance funcional
Permitir decisión administrativa sobre solicitudes, incluyendo solicitud de información y registro de actor/motivo/fecha; aprobación puede producir intención de override pero no evita su validación.

## Fuera de alcance
Editar directamente plan base, aprobar sin permisos o crear políticas de precios/rangos.

## Criterios de aceptación
### Escenario 1
**Dado** solicitud PENDING_REVIEW válida, **cuando** admin aprueba, **entonces** queda decisión registrada y se aplica el cambio autorizado mediante contrato de override.

### Escenario 2
**Dado** admin requiere aclaración, **cuando** solicita información, **entonces** pasa a INFORMATION_REQUESTED sin cerrar la solicitud.

### Escenario 3
**Dado** admin rechaza, **cuando** confirma, **entonces** la solicitud se cierra sin alterar límites.

## Reglas de negocio
Toda decisión administrativa es trazable. Aprobar no puede saltar restricciones de reducción/lifecycle.

## Validaciones y permisos
Principal administrativo autorizado; motivo según acción.

## Casos de error y estados vacíos
Solicitud desactualizada, permiso denegado, conflicto, aplicación de override fallida.

## Datos / contratos afectados
ExtensionDecision, decision history, override intent/reference.

## Dependencias técnicas y funcionales
Auth admin EL-TK-044 y override EL-TK-142.

## Dependencias de tickets
- **depends_on:** EL-TK-139, EL-TK-044
- **blocks:** EL-TK-142, EL-TK-144, EL-TK-145

## Pruebas requeridas
Approve/reject/info, permisos, carreras, fallo downstream y auditoría.

## Observabilidad / auditoría
Auditar decisión y referencias sin secretos.

## Prioridad / estimación
P0 / M

## Traceability
DEC-020, DEC-094, DEC-095, DEC-101; EL-EP-011, EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-079/080/093..095/100..102 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
