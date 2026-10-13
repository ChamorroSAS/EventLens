# EL-TK-165 — Validar notificaciones, deduplicación y obsolescencia de extremo a extremo

## Parent epic
EL-EP-013

## Status
DONE

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

## Evidencia de implementación y pruebas (2026-10-13)
- Suite E2E completa: `packages/notifications/test/notifications-epic-e2e.test.ts` (4 escenarios cubiertos al 100%).
  - Escenario 1: Hecho de dominio procesado repetidamente produce exactamente una sola intención y no duplica entregas (Idempotent replay + Job deduplication).
  - Escenario 2: Cambio de fecha/permiso antes de entrega marca aviso obsoleto y excluye avisos caducados de la proyección (`EXPORT_INVALIDATED` sobre `EXPORT_AVAILABLE` — DEC-090).
  - Escenario 3: Proveedor de email falla temporalmente y se recupera con reintento sin duplicar envíos semánticos (`RETRY_SCHEDULED`, segundo intento `SENT`, exactamente 1 email entregado, auditoría sanitizada).
  - Escenario E2E Completo: Orquestación transversal de los 5 tipos de avisos de `EL-EP-013` (Lifecycle, Capacity, Case, Export, Account Security) sin exposición de credenciales ni secrets en payload ni logs.
- Suites de pruebas asociadas en `@eventlens/notifications`: 8 archivos unitarios (75 tests) + 1 suite E2E (4 tests) = 79 tests pasando.
- Typecheck y build: `tsc -p tsconfig.build.json` exitoso sin errores en `@eventlens/notifications`.

