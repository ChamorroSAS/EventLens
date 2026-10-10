# EL-TK-111 — Integrar acciones de moderación y papelera en la biblioteca del organizador

## Parent epic
EL-EP-008

## Status
READY

## User story
**Como** organizador, **quiero** moderar y gestionar papelera desde la biblioteca compartida, **para** controlar contenido sin duplicar pantallas ni perder contexto.

## Alcance funcional
Integrar MediaModerationActions, HideMediaDialog, RejectMediaDialog, TrashMediaDialog, RestoreMediaAction, ModerationSettings y RetentionNotice sobre OrganizerMediaLibrary.

## Fuera de alcance
Crear una segunda biblioteca, resolver denuncias EL-EP-009, descargas EL-EP-010 o liberar cuarentena.

## Criterios de aceptación
### Escenario 1
**Dado** media pendiente/publicada/oculta/elegible, **cuando** la UI recibe capacidades, **entonces** muestra únicamente acciones autorizadas para su estado.

### Escenario 2
**Dado** una acción destructiva requiere confirmación, **cuando** el usuario confirma o cancela, **entonces** la UI preserva foco y comunica consecuencia real.

### Escenario 3
**Dado** papelera está vacía o ventana venció, **cuando** se muestra el estado, **entonces** no se ofrece restauración inválida.

## Reglas de negocio
La UI no infiere elegibilidad; consume capacidades del servidor. Sin batch nuevo ni auto-publicación al restaurar.

## Validaciones y permisos
Owner autenticado; controles deshabilitados/ocultos conforme contrato.

## Casos de error y estados vacíos
Read-only, bloqueo seguridad/retiro, conflicto, ventana vencida, ya purgado y error temporal.

## Datos / contratos afectados
Clientes OpenAPI de EL-TK-103..110, OrganizerMediaLibrary, capability map.

## Dependencias técnicas y funcionales
Handoff UI EL-EP-008 y biblioteca EL-TK-100.

## Dependencias de tickets
- **depends_on:** EL-TK-100, EL-TK-103, EL-TK-104, EL-TK-105, EL-TK-106, EL-TK-107, EL-TK-108, EL-TK-110
- **blocks:** EL-TK-112

## Pruebas requeridas
Component/unit, estados/capabilities, dialogs, foco, responsive, WCAG 2.2 AA y conflictos.

## Observabilidad / auditoría
Sin telemetría sensible; acciones delegan auditoría al backend.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019; DEC-005, DEC-022, DEC-086, DEC-087, DEC-096; EL-EP-008; ui-mvp-epic-review.md#el-ep-008.

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
