# EL-TK-151 — Orquestar intervenciones administrativas mediante contratos propietarios

## Parent epic
EL-EP-012

## Status
DONE

## User story
**Como** administración autorizada, **quiero** ejecutar desde la consola acciones permitidas de lifecycle, acceso y capacidad, **para** intervenir sin duplicar reglas de otros módulos.

## Alcance funcional
Exponer desde el detalle capacidades/commands que delegan a suspensión/reactivación, invalidación de acceso, overrides y otras acciones ya definidas por sus épicas propietarias.

## Fuera de alcance
Reimplementar reglas de EL-EP-003/004/011/015 o habilitar acciones no disponibles.

## Criterios de aceptación
### Escenario 1
**Dado** acción propietaria está habilitada, **cuando** admin confirma con motivo, **entonces** se delega al comando dueño y se muestra resultado real.

### Escenario 2
**Dado** dominio la deniega por estado actual, **cuando** se intenta, **entonces** la consola no fuerza el cambio.

### Escenario 3
**Dado** acción cambia concurrentemente, **cuando** confirma, **entonces** se devuelve conflicto/contexto vigente.

## Reglas de negocio
La consola nunca es autoridad de política; solo orquesta comandos propietarios.

## Validaciones y permisos
Admin autorizado + capability de la acción y motivo cuando corresponda.

## Casos de error y estados vacíos
Acción deshabilitada, conflicto, permiso, downstream error y resultado parcial.

## Datos / contratos afectados
AdminActionCapability/Command routing hacia owners.

## Dependencias técnicas y funcionales
EL-EP-003, EL-EP-004, EL-EP-011, EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-147; contratos propietarios correspondientes
- **blocks:** EL-TK-154, EL-TK-155

## Pruebas requeridas
Delegación, denegación, concurrencia, auditoría y no bypass.

## Observabilidad / auditoría
Auditar comando dueño/ref/resultados, sin duplicar logs sensibles.

## Prioridad / estimación
P0 / M

## Traceability
DEC-019, DEC-020, DEC-027; EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-019/020/027/038/061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-012; sin componentes nuevos ni bypass de justificación).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
