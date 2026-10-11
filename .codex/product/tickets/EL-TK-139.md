# EL-TK-139 — Crear una solicitud de ampliación para almacenamiento o vigencia

## Parent epic
EL-EP-011

## Status
READY

## User story
**Como** organizador propietario, **quiero** solicitar GB o días adicionales con motivo, **para** pedir una ampliación sin modificar directamente mis límites.

## Alcance funcional
Crear una única solicitud abierta por evento con tipo almacenamiento/extensión/ambos, cantidades correspondientes y motivo obligatorio.

## Fuera de alcance
Adjuntos, aprobación automática, checkout o modificar límites al enviar.

## Criterios de aceptación
### Escenario 1
**Dado** no existe solicitud abierta, **cuando** owner completa campos válidos, **entonces** se crea una solicitud PENDING.

### Escenario 2
**Dado** ya existe una solicitud abierta, **cuando** intenta crear otra, **entonces** se rechaza y se devuelve la solicitud vigente.

### Escenario 3
**Dado** tipo ambos omite una cantidad requerida, **cuando** envía, **entonces** se rechaza validación conservando campos.

## Reglas de negocio
GB son adicionales y decimales; días son adicionales. Solicitar no altera límites efectivos.

## Validaciones y permisos
Owner del evento; admin no necesita usar este intake para aplicar un override.

## Casos de error y estados vacíos
Duplicada abierta, campos inválidos, actor ajeno, concurrencia y timeout idempotente.

## Datos / contratos afectados
ExtensionRequest, requestType, additionalGb, additionalDays, reason, status/history.

## Dependencias técnicas y funcionales
Límites EL-TK-134/135.

## Dependencias de tickets
- **depends_on:** EL-TK-134, EL-TK-135
- **blocks:** EL-TK-140, EL-TK-141, EL-TK-143, EL-TK-144, EL-TK-145

## Pruebas requeridas
Cada tipo, exclusividad por evento, validación, replay y aislamiento.

## Observabilidad / auditoría
Auditar solicitud y actor sin texto sensible innecesario.

## Prioridad / estimación
P0 / M

## Traceability
DEC-093, DEC-100; EL-EP-011.

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
