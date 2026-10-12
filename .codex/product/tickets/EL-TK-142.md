# EL-TK-142 — Aplicar overrides administrativos y retorno al plan base

## Parent epic
EL-EP-011

## Status
DONE

## User story
**Como** administración autorizada, **quiero** modificar límites efectivos o volver al plan base con motivo, **para** ajustar capacidad de forma controlada y reversible.

## Alcance funcional
Aplicar storage total, file count total y vigencia total desde ancla aprobada; permitir retorno al plan base mostrando/validando consecuencias y preservando reglas DEC-080/102.

## Fuera de alcance
Cambiar precios, borrar archivos por reducción, provocar vencimiento retroactivo o redefinir lifecycle.

## Criterios de aceptación
### Escenario 1
**Dado** override válido, **cuando** admin confirma, **entonces** se persiste old/new/actor/motivo y se recalculan límites efectivos.

### Escenario 2
**Dado** reducción queda bajo consumo/reservas, **cuando** se aplica, **entonces** se conservan archivos/reservas y se bloquean nuevas autorizaciones.

### Escenario 3
**Dado** después de ACTIVE el cambio dejaría vencimiento pasado, **cuando** se intenta, **entonces** se deniega sin alterar valores vigentes.

## Reglas de negocio
Plan base permanece intacto. Retorno/reducción no elimina contenido. Vigencia total se calcula desde ancla aprobada.

## Validaciones y permisos
Admin autorizado; motivo obligatorio.

## Casos de error y estados vacíos
Valor inválido, vencimiento pasado, conflicto, actor sin permiso y rollback.

## Datos / contratos afectados
PlanOverride command/version, effective limits, audit old/new.

## Dependencias técnicas y funcionales
Plan EL-TK-134, cuota EL-TK-136/137 y lifecycle EL-EP-003.

## Dependencias de tickets
- **depends_on:** EL-TK-134, EL-TK-141; contratos EL-EP-003
- **blocks:** EL-TK-144, EL-TK-145

## Pruebas requeridas
Aumento/reducción/retorno, ACTIVE pasado, consumo superior, concurrencia y auditoría.

## Observabilidad / auditoría
Auditar old/new/actor/motivo.

## Prioridad / estimación
P0 / M

## Traceability
DEC-080, DEC-095, DEC-100, DEC-102; EL-EP-011.

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
