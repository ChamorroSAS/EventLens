# EL-TK-112 — Validar moderación, papelera y restauración de extremo a extremo

## Parent epic
EL-EP-008

## Status
DONE

## User story
**Como** equipo de producto, **quiero** validar el flujo de moderación y papelera, **para** comprobar que ninguna acción evade seguridad, visibilidad o retención.

## Alcance funcional
Cubrir API/UI/scheduler para aprobar, rechazar, ocultar, republicar, papelera, restaurar, vencimiento y cambio de modo.

## Fuera de alcance
Certificar resolución completa de denuncias graves, retención jurídica o purga física integral de EL-EP-015.

## Criterios de aceptación
### Escenario 1
**Dado** un conjunto de medias cubre estados elegibles/no elegibles, **cuando** se ejecutan acciones, **entonces** cada transición respeta el contrato.

### Escenario 2
**Dado** una restauración compite con expiración, **cuando** se ejecuta la carrera, **entonces** solo una decisión consistente prevalece.

### Escenario 3
**Dado** cambia el modo con pendientes y trabajos en vuelo, **cuando** finalizan, **entonces** se conserva DEC-087.

## Reglas de negocio
La prueba debe verificar que cuarentena/procesamiento/retiro no pueden evadirse.

## Validaciones y permisos
Datos sintéticos/controlados y roles autorizados.

## Casos de error y estados vacíos
Conflictos, jobs repetidos, media purgada, bloqueo seguridad y UI parcial.

## Datos / contratos afectados
EL-TK-103..111 y contrato de purga EL-EP-015.

## Dependencias técnicas y funcionales
Entorno integrado con JobQueue/scheduler y biblioteca owner.

## Dependencias de tickets
- **depends_on:** EL-TK-103, EL-TK-104, EL-TK-105, EL-TK-106, EL-TK-107, EL-TK-108, EL-TK-109, EL-TK-110, EL-TK-111
- **blocks:** validación integrada de EL-EP-008 antes de consumidores EL-EP-009/010/015

## Pruebas requeridas
E2E, integración, concurrencia, idempotencia, lifecycle, seguridad y WCAG 2.2 AA.

## Observabilidad / auditoría
Evidencias sanitizadas sin media privada real.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019, Q-023; DEC-005, DEC-022, DEC-039, DEC-086, DEC-087, DEC-096; EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-086/087/096 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §8.5..9; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Diseñada y ejecutada la suite de integración E2E `packages/media-inspection/test/media-moderation-e2e.integration.test.ts` interactuando con PostgreSQL 16 sin mocks de SQL transaccional.
- **Criterios de aceptación verificados:**
  - Escenario 1: Flujo completo de ciclo de vida (`PENDING_REVIEW` -> `PUBLISHED` -> `HIDDEN` -> `PUBLISHED` -> `TRASHED` -> `restore` -> `PUBLISHED`), preservación estricta de `previousStatus` (`HIDDEN`, `PENDING_REVIEW`) sin auto-publicación indebida (DEC-086), y rechazo con `INVALID_STATE` al intentar enviar a papelera estados no elegibles (`PROCESSING`, `UPLOADED`) según DEC-096.
  - Escenario 2: Carrera de concurrencia entre restauración y expiración cerca del deadline (`restoreDeadline`): gracias al bloqueo transaccional por fila (`SELECT ... FOR UPDATE`) y actualización CAS por revisión, sólo una decisión consistente prevalece (o se restaura y la purga se omite de forma segura con `SKIPPED_ALREADY_RESTORED`, o se marca la purga y la restauración se rechaza con `RESTORE_WINDOW_EXPIRED`).
  - Escenario 3: Cambio de modo de moderación de `AUTO_PUBLISH` a `MANUAL_REVIEW` en evento `ACTIVE`: los pendientes y publicados preexistentes no sufren mutaciones (DEC-087).
- **Pruebas:** 8/8 tests PASS en `packages/media-inspection/test/media-moderation-e2e.integration.test.ts` con aislamiento completo de datos y llaves foráneas íntegras. Regresión de moderación en 10/10 tests de integración y 213/213 tests unitarios PASS.

