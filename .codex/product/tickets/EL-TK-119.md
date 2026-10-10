# EL-TK-119 — Resolver un caso de reporte o retiro registrando la intervención

## Parent epic
EL-EP-009

## Status
READY

## User story
**Como** administración autorizada, **quiero** resolver un caso con resultado y justificación, **para** cerrar la revisión con trazabilidad y acciones proporcionales.

## Alcance funcional
Registrar resolución de casos revisados, su decisión, motivo, comunicaciones aplicables y, cuando corresponda, emitir contrato de eliminación grave/no restaurable hacia EL-EP-015.

## Fuera de alcance
Definir texto jurídico final, garantizar plazo contractual, conservar multimedia para auditoría o ejecutar físicamente toda purga.

## Criterios de aceptación
### Escenario 1
**Dado** un caso revisado tiene decisión, **cuando** admin resuelve, **entonces** se registra estado final, actor, motivo y acciones ejecutadas/solicitadas.

### Escenario 2
**Dado** la decisión exige eliminación no restaurable, **cuando** se confirma, **entonces** se emite el contrato de purga correspondiente sin papelera del owner.

### Escenario 3
**Dado** un caso ya resuelto, **cuando** se intenta resolver otra vez, **entonces** se devuelve conflicto/idempotencia sin doble acción destructiva.

## Reglas de negocio
Casos graves válidos pueden omitir papelera. Auditoría retiene mínimos, no media.

## Validaciones y permisos
Admin autorizado; acciones destructivas requieren capability/motivo.

## Casos de error y estados vacíos
Caso ya cerrado, acción downstream fallida, media inexistente, conflicto y permiso vencido.

## Datos / contratos afectados
CaseResolution, resolutionType, reason, action refs, purge request, notification event.

## Dependencias técnicas y funcionales
EL-EP-015 purga, EL-EP-013 comunicaciones y EL-EP-014 auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-117; contrato EL-EP-013, EL-EP-014, EL-EP-015
- **blocks:** EL-TK-120, EL-TK-122, EL-TK-123

## Pruebas requeridas
Resolución normal/grave, replay, fallo downstream, auditoría y no restaurabilidad cuando aplica.

## Observabilidad / auditoría
Auditar resolución y referencias; no adjuntar media al log.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013, Q-019; DEC-023, DEC-029, DEC-059, DEC-088, DEC-097; EL-EP-009, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
