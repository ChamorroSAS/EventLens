# EL-TK-152 — Reutilizar solicitudes, reportes e invitaciones en el detalle administrativo

## Parent epic
EL-EP-012

## Status
READY

## User story
**Como** administración autorizada, **quiero** acceder desde un único detalle a flujos administrativos existentes, **para** operar sin crear módulos paralelos.

## Alcance funcional
Componer referencias/capabilities para invitaciones BETA, solicitudes de ampliación y reportes, delegando lectura/acciones a EL-EP-001/009/011.

## Fuera de alcance
Duplicar colas, reglas o componentes propietarios.

## Criterios de aceptación
### Escenario 1
**Dado** evento tiene solicitud de ampliación, **cuando** admin abre sección, **entonces** consume el contrato de EL-EP-011.

### Escenario 2
**Dado** evento tiene reportes, **cuando** abre sección, **entonces** consume cola/detalle de EL-EP-009 sin preview automático.

### Escenario 3
**Dado** flujo propietario aún no está disponible, **cuando** consulta, **entonces** se muestra restricción explícita y no una falsa acción.

## Reglas de negocio
Ownership permanece en cada épica; consola compone, no copia.

## Validaciones y permisos
Admin autorizado y permisos del flujo propietario.

## Casos de error y estados vacíos
Sección no disponible, permiso, dato parcial y conflicto.

## Datos / contratos afectados
AdminEventDetail section links/capabilities.

## Dependencias técnicas y funcionales
EL-EP-001, EL-EP-009, EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-147; contratos EL-EP-001/009/011
- **blocks:** EL-TK-154, EL-TK-155

## Pruebas requeridas
Composición por sección, permiso, parcial y no duplicación.

## Observabilidad / auditoría
Sin logging adicional de datos sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-017; DEC-019, DEC-020; EL-EP-012.

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
