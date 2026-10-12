# EL-TK-137 — Consolidar consumo al aceptar o purgar originales

## Parent epic
EL-EP-011

## Status
DONE

## User story
**Como** sistema, **quiero** convertir reservas en consumo y liberar consumo solo tras borrado físico confirmado, **para** mantener la cuota consistente con los originales realmente existentes.

## Alcance funcional
Consolidar una reserva al aceptar un original y reducir consumo cuando la purga física autorizada confirme eliminación, de forma idempotente.

## Fuera de alcance
Ejecutar aceptación de media, purgar objetos, contar derivados/exports o alterar permisos.

## Criterios de aceptación
### Escenario 1
**Dado** un original es aceptado, **cuando** se confirma consumo, **entonces** la reserva se consume exactamente una vez y el original cuenta.

### Escenario 2
**Dado** una media entra TRASHED/QUARANTINED/HIDDEN, **cuando** cambia estado, **entonces** sigue contando mientras exista físicamente.

### Escenario 3
**Dado** la purga física se confirma, **cuando** se aplica, **entonces** el consumo se libera una sola vez.

## Reglas de negocio
Estados lógicos no liberan cuota; solo desaparición física confirmada. Portadas/derivados/ZIP permanecen fuera del consumo comercial.

## Validaciones y permisos
Sistema mediante contratos propietarios de media/purga.

## Casos de error y estados vacíos
Replay, purga parcial, reserva inconsistente, media ya liberada y rollback.

## Datos / contratos afectados
QuotaConsumptionLedger, reservation settlement, purge release receipt.

## Dependencias técnicas y funcionales
EL-TK-090 aceptación y EL-EP-015 purga.

## Dependencias de tickets
- **depends_on:** EL-TK-136; contratos EL-EP-005 y EL-EP-015
- **blocks:** EL-TK-135, EL-TK-138, EL-TK-145

## Pruebas requeridas
Aceptación, estados no liberadores, purga confirmada, replay y carreras.

## Observabilidad / auditoría
Auditar deltas y referencias sanitizadas.

## Prioridad / estimación
P0 / M

## Traceability
DEC-079, DEC-080, DEC-096; EL-EP-011, EL-EP-005, EL-EP-015.

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
