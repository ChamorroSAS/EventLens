# EL-TK-160 — Generar avisos de capacidad al 80 y 100 por ciento

## Parent epic
EL-EP-013

## Status
DONE

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

## Cierre de implementación — 2026-10-12
- **STATUS:** DONE
- **Implementación técnica:**
  - Servicio `CapacityNoticeService` en `@eventlens/notifications` (`capacity-notice-service.ts`), consumiendo señales de umbral de `@eventlens/capacity-management` (EL-TK-138) con deduplicación estricta.
  - Escenario 1 (80%): Genera intención `CAPACITY_WARNING_80` con severidad `WARNING` y acción `/events/${eventId}/capacity`.
  - Escenario 2 (100%): Genera intención `CAPACITY_EXCEEDED_100` con severidad `CRITICAL` y acción autorizada de ampliación `/events/${eventId}/capacity/extension`.
  - Escenario 3: Idempotencia y deduplicación garantizadas mediante `dedupKey` y máquina de estados contra re-emisiones o repetición de señales.
  - Compatibilidad de proyecciones y correo: Mapeo verificado en `NoticeProjectionService` y plantillas accesibles en `EmailRenderer`.
  - Auditoría: Registro de eventos en `NotificationAuditSink` sin fugar multimedia ni datos sensibles.
- **Validación y pruebas:**
  - Suite unitaria: `test/capacity-notice.unit.test.ts` (4 pruebas PASS).
  - Suite de integración: `test/capacity-notice.integration.test.ts` (2 pruebas PASS contra PostgreSQL 16 real).
  - Typecheck y build limpios en todo el monorepo.

