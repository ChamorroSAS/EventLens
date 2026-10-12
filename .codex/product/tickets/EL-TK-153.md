# EL-TK-153 — Integrar diagnóstico y operaciones de jobs en la consola administrativa

## Parent epic
EL-EP-012

## Status
DONE

## User story
**Como** administración autorizada, **quiero** ver y operar jobs autorizados desde el detalle, **para** resolver fallos técnicos con feedback claro y accesible.

## Alcance funcional
Integrar JobQueueSummary, JobDetail, RetryDeadJobAction y ConfirmDialog para acciones habilitadas, mostrando errores sanitizados y resultados reales.

## Fuera de alcance
Crear dashboard operacional nuevo, mostrar payloads o inventar acciones.

## Criterios de aceptación
### Escenario 1
**Dado** job DEAD elegible, **cuando** admin abre detalle, **entonces** ve retry y demás acciones permitidas.

### Escenario 2
**Dado** acción requiere confirmación, **cuando** confirma/cancela, **entonces** foco y estado se preservan.

### Escenario 3
**Dado** comando falla/conflicta, **cuando** responde, **entonces** UI actualiza contexto sin afirmar éxito.

## Reglas de negocio
UI consume capabilities; 'acción registrada' no significa efecto físico downstream terminado.

## Validaciones y permisos
Admin autenticado.

## Casos de error y estados vacíos
Cola vacía, permiso, reauth, conflicto y error parcial.

## Datos / contratos afectados
Clientes EL-TK-148/149.

## Dependencias técnicas y funcionales
Handoff EL-EP-012.

## Dependencias de tickets
- **depends_on:** EL-TK-148, EL-TK-149
- **blocks:** EL-TK-154, EL-TK-155

## Pruebas requeridas
Component/unit, acciones, foco, errores, responsive y WCAG 2.2 AA.

## Observabilidad / auditoría
UI no registra errores sensibles.

## Prioridad / estimación
P0 / M

## Traceability
DEC-038; EL-EP-012; ui-mvp-epic-review.md#el-ep-012.

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
