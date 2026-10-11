# EL-TK-165 — Validar notificaciones, deduplicación y obsolescencia de extremo a extremo

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** equipo de producto, **quiero** validar comunicaciones panel/email, **para** comprobar que son útiles, privadas y no duplicadas bajo reintentos/cambios.

## Alcance funcional
Cubrir intent/outbox, JobQueue email, avisos panel, lifecycle, cuota, export, seguridad/casos, obsolescencia, retry/DEAD y UI.

## Fuera de alcance
Certificar proveedor definitivo, deliverability externa o marketing.

## Criterios de aceptación
### Escenario 1
**Dado** un hecho se procesa repetidamente, **cuando** E2E, **entonces** produce una sola intención/comunicación equivalente.

### Escenario 2
**Dado** fecha/permiso cambia antes de entrega, **cuando** se revalida, **entonces** aviso obsoleto no se presenta como vigente.

### Escenario 3
**Dado** proveedor falla temporalmente, **cuando** se reintenta, **entonces** no duplica semánticamente la comunicación.

## Reglas de negocio
Job enviado no equivale a correo entregado; privacidad y dedupe son parte del gate.

## Validaciones y permisos
Datos sintéticos y destinatarios controlados.

## Casos de error y estados vacíos
Provider failure, DEAD, replay, invalidación y partial UI.

## Datos / contratos afectados
EL-TK-156..164 y JobQueue.

## Dependencias técnicas y funcionales
API/worker/scheduler/UI con proveedor de prueba/puerto neutral.

## Dependencias de tickets
- **depends_on:** EL-TK-156, EL-TK-157, EL-TK-158, EL-TK-159, EL-TK-160, EL-TK-161, EL-TK-162, EL-TK-163, EL-TK-164
- **blocks:** validación integrada de EL-EP-013

## Pruebas requeridas
Integración PG/JobQueue, E2E, dedupe, retry, privacy y WCAG 2.2 AA.

## Observabilidad / auditoría
Evidencia sanitizada; no cuerpos sensibles completos.

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
