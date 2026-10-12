# EL-TK-149 — Ejecutar acciones administrativas autorizadas sobre jobs

## Parent epic
EL-EP-012

## Status
DONE

## User story
**Como** administración autorizada, **quiero** reintentar, cancelar o marcar no repetir un job cuando el contrato lo permita, **para** recuperar operación sin editar directamente la cola.

## Alcance funcional
Exponer comandos administrativos sobre jobs según capacidades vigentes, con motivo/auditoría e idempotencia; reutiliza reglas de JobQueue.

## Fuera de alcance
Cambiar estados de media arbitrariamente, saltar políticas propietarias o editar payloads.

## Criterios de aceptación
### Escenario 1
**Dado** job DEAD elegible, **cuando** admin solicita retry con motivo, **entonces** se crea/reprograma acción según contrato sin duplicar ciclo.

### Escenario 2
**Dado** job no permite cancelar/no repetir, **cuando** admin intenta, **entonces** se deniega con estado actual.

### Escenario 3
**Dado** comando se repite, **cuando** replay, **entonces** no duplica efectos.

## Reglas de negocio
JobQueue no sustituye autoridad del dominio; una acción de cola no publica/libera media por sí sola.

## Validaciones y permisos
Admin autorizado y capability específica; motivo obligatorio.

## Casos de error y estados vacíos
Estado incompatible, lease/carrera, replay, permiso y rollback.

## Datos / contratos afectados
AdminJobCommand, action, reason, idempotency receipt.

## Dependencias técnicas y funcionales
JobQueue EL-TK-055/038 y contratos de dominio.

## Dependencias de tickets
- **depends_on:** EL-TK-148, EL-TK-044; contrato JobQueue
- **blocks:** EL-TK-153, EL-TK-154, EL-TK-155

## Pruebas requeridas
Retry/cancel/no-repeat elegibles/no elegibles, concurrencia e idempotencia.

## Observabilidad / auditoría
Auditar actor, motivo, job y resultado sanitizado.

## Prioridad / estimación
P0 / M

## Traceability
DEC-038, DEC-064; EL-EP-012.

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
