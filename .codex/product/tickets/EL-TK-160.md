# EL-TK-160 — Generar avisos de capacidad al 80 y 100 por ciento

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** sistema, **quiero** convertir señales de cuota en comunicaciones útiles, **para** avisar al organizador sin spam cuando se acerca o alcanza el límite.

## Alcance funcional
Consumir UsageThresholdReached de EL-EP-011 y generar intenciones panel/email apropiadas, preservando deduplicación del hecho.

## Fuera de alcance
Calcular cuota, autorizar uploads o emitir avisos por cada refresco.

## Criterios de aceptación
### Escenario 1
**Dado** se recibe señal 80%, **cuando** procesa, **entonces** crea aviso contextual/correo según política una sola vez.

### Escenario 2
**Dado** se recibe 100%, **cuando** procesa, **entonces** comunica capacidad agotada con acción autorizada hacia ampliación.

### Escenario 3
**Dado** se repite la misma señal, **cuando** procesa, **entonces** no duplica comunicación.

## Reglas de negocio
No inferir capacidad en frontend; la señal de EL-EP-011 es autoridad.

## Validaciones y permisos
Owner del evento.

## Casos de error y estados vacíos
Señal obsoleta, destinatario no vigente, replay y fallo de delivery.

## Datos / contratos afectados
Usage notification intent/templates/actions.

## Dependencias técnicas y funcionales
EL-TK-138 y EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-156; contrato EL-TK-138
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
80/100, dedupe, obsolescencia y enlaces autorizados.

## Observabilidad / auditoría
Registrar tipo/threshold/resultados sin media.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021, DEC-027; EL-EP-013, EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-021 y DEC-061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-013; sin componentes nuevos ni NotificationCenter obligatorio).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
