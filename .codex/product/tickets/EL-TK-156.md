# EL-TK-156 — Registrar intenciones de notificación idempotentes desde hechos de dominio

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** sistema, **quiero** convertir hechos confirmados en intenciones de comunicación, **para** deduplicar avisos y separar dominio de canales concretos.

## Alcance funcional
Persistir NotificationIntent a partir de hechos propietarios con destinatario, tipo, recurso, ventana/fecha, dedup key y estado; no enviar correo ni renderizar UI.

## Fuera de alcance
Seleccionar proveedor de email, determinar severidad/lifecycle o crear NotificationCenter.

## Criterios de aceptación
### Escenario 1
**Dado** llega un hecho notificable nuevo, **cuando** se procesa, **entonces** se crea una intención única.

### Escenario 2
**Dado** el mismo hecho se reprocesa, **cuando** se procesa, **entonces** no duplica la intención.

### Escenario 3
**Dado** el hecho quedó obsoleto antes de entrega, **cuando** se revalida, **entonces** la intención puede quedar superseded/cancelled sin enviarse como riesgo vigente.

## Reglas de negocio
Solo hechos confirmados de dominios propietarios generan intentos; deduplicación por semántica del evento/recurso.

## Validaciones y permisos
Sistema; destinatario debe pertenecer al contexto autorizado.

## Casos de error y estados vacíos
Hecho inválido, destinatario ausente, replay, conflicto y rollback.

## Datos / contratos afectados
NotificationIntent, dedupKey, recipientRef, notificationType, status, effectiveAt/expiresAt.

## Dependencias técnicas y funcionales
Señales de EL-EP-001/003/009/010/011/015 y JobQueue.

## Dependencias de tickets
- **depends_on:** contratos de hechos propietarios
- **blocks:** EL-TK-157, EL-TK-158, EL-TK-159, EL-TK-160, EL-TK-161, EL-TK-162, EL-TK-163, EL-TK-164, EL-TK-165

## Pruebas requeridas
Idempotencia, obsolescencia, destinatario, rollback y aislamiento.

## Observabilidad / auditoría
Auditar intención/resultado sin contenido sensible.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-064; EL-EP-013.

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
