# EL-TK-134 — Asignar y resolver el plan BETA efectivo de un evento

## Parent epic
EL-EP-011

## Status
READY

## User story
**Como** sistema, **quiero** asignar y resolver el plan BETA y sus límites efectivos, **para** aplicar una base consistente sin alterar el plan original por overrides.

## Alcance funcional
Definir el plan BETA base aplicable al evento y resolver límites efectivos de almacenamiento, cantidad de archivos, tamaño/duración y vigencia combinando plan base y overrides autorizados.

## Fuera de alcance
Checkout, precios, renovación comercial, reservas de upload concretas o UI.

## Criterios de aceptación
### Escenario 1
**Dado** un evento sin override, **cuando** se resuelven límites, **entonces** recibe exactamente el plan BETA base vigente.

### Escenario 2
**Dado** existe un override autorizado, **cuando** se resuelven límites, **entonces** se aplican valores efectivos sin mutar el plan base.

### Escenario 3
**Dado** un override es retirado, **cuando** se vuelve al plan base, **entonces** los valores efectivos se recalculan respetando restricciones temporales vigentes.

## Reglas de negocio
Plan base MVP: 1500 archivos, 10 GB decimales, foto 25 MB, video 500 MB/5 min y vigencia 7/30/90 días con default 30. Overrides no reescriben el plan base.

## Validaciones y permisos
Lectura por owner/admin autorizado; cambios solo mediante comandos administrativos propietarios.

## Casos de error y estados vacíos
Plan ausente/inconsistente, override inválido, versión concurrente y evento no autorizado.

## Datos / contratos afectados
PlanAssignment, EffectiveLimits, PlanOverride reference/version.

## Dependencias técnicas y funcionales
Cuenta BETA EL-EP-001 y lifecycle EL-EP-003.

## Dependencias de tickets
- **depends_on:** contrato EL-EP-001
- **blocks:** EL-TK-135, EL-TK-136, EL-TK-139, EL-TK-141, EL-TK-142, EL-TK-143, EL-TK-144, EL-TK-145

## Pruebas requeridas
Plan base, override, retorno, unidades decimales, concurrencia y aislamiento por evento.

## Observabilidad / auditoría
Registrar resolución/configuración sin datos sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-011, Q-020; DEC-010, DEC-011, DEC-020, DEC-026, DEC-027, DEC-039, DEC-100; EL-EP-011.

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
