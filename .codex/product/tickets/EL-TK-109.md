# EL-TK-109 — Entregar a purga una media cuya papelera venció

## Parent epic
EL-EP-008

## Status
DONE

## User story
**Como** sistema, **quiero** marcar y entregar a purga una media TRASHED vencida, **para** completar la eliminación normal sin ampliar indebidamente la ventana de restauración.

## Alcance funcional
Detectar expiración de la ventana de siete días, cerrar restauración y emitir idempotentemente el contrato de purga que ejecuta la capacidad propietaria de EL-EP-015.

## Fuera de alcance
Implementar toda la purga física/backups, retención jurídica o eliminar antes del deadline.

## Criterios de aceptación
### Escenario 1
**Dado** una media TRASHED alcanza su restoreDeadline, **cuando** el scheduler la procesa, **entonces** queda no restaurable y se emite una única solicitud de purga.

### Escenario 2
**Dado** el job se repite, **cuando** se reintenta, **entonces** no duplica la solicitud de purga.

### Escenario 3
**Dado** la media fue restaurada antes del deadline, **cuando** se procesa un job atrasado, **entonces** no se purga ni se invalida la restauración.

## Reglas de negocio
La ventana normal de papelera es siete días. La ejecución física y máximos de retención pertenecen a EL-EP-015.

## Validaciones y permisos
Automatización de sistema; no comando directo guest/owner para omitir ventana normal.

## Casos de error y estados vacíos
Job atrasado, media ya restaurada, purge ya solicitada, fallo de publicación y conflicto.

## Datos / contratos afectados
Trash expiry scheduler/event, PurgeRequest contract, idempotency key.

## Dependencias técnicas y funcionales
Scheduler/JobQueue y contrato de eliminación EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-107, EL-TK-055; contrato EL-EP-015
- **blocks:** EL-TK-112; consumidor de purga EL-EP-015

## Pruebas requeridas
Deadline, replay, restauración en carrera, publicación fallida e idempotencia.

## Observabilidad / auditoría
Auditar transición a no restaurable y referencia de purge request.

## Prioridad / estimación
P0 / M

## Traceability
Q-019; DEC-022, DEC-045, DEC-092; EL-EP-008, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Contrato vigente de entrega — 2026-10-12

DEC-109 / ARCH-019: [política de papelera](../../context/trash-quarantine-purge-policy.md). PurgeIntent de episodio vigente lleva sourceOperation/episode, policyRef/version, generation/revisión, purgeStartedAt=restoreDeadline original, deadlines +7/+30 UTC y referencia al inventario propietario. Al llegar deadline no se restaura; job atrasado no mueve ancla ni purga un episodio ya restaurado. Mantener responsabilidad de expiry/emisión, sin implementar físico/backups aquí.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para este contrato, según reevaluación architect/requirements_reviewer. Ejecución integrada depende de015; no hay purga acreditada ni cambio de estado READY a DONE. Los campos/guardias pendientes son implementación, no decisión abierta.

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-086/087/096 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §8.5..9; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Implementado modelo y tabla `media_trash_purge_intent` (migración `202610120049_media_trash_purge_intent`) en `@eventlens/media-inspection` con anclajes temporales inmutables `purge_started_at = restoreDeadline`, `main_purge_deadline = +7 días UTC` y `residual_purge_deadline = +30 días UTC` (DEC-109 / ARCH-019).
  - Implementados métodos `expireTrashMedia` y `processExpiredTrash` en `MediaModerationService`, integrados con `PurgeDispatcherPort`.
  - Transición a status `'DELETED'` en `media_catalog` al emitir purga con incremento de revisión.
- **Criterios de aceptación verificados:**
  - Escenario 1: Al vencer la ventana (`now >= restoreDeadline`), la media queda no restaurable y se emite la solicitud de purga idempotente hacia el dispatcher.
  - Escenario 2: Replays e intentos duplicados devuelven `ALREADY_PURGED` sin emitir purgas redundantes gracias al índice único en `dedup_key = trash-purge:${trashRecord.id}`.
  - Escenario 3: Si la media fue restaurada antes del vencimiento (`restored_at IS NOT NULL` y `status != 'TRASHED'`), un job tardío devuelve de forma segura `SKIPPED_ALREADY_RESTORED` sin alterar el contenido.
- **Pruebas:** 44/44 tests unitarios PASS en `packages/media-inspection/test/media-moderation.unit.test.ts` y validación E2E contra PostgreSQL 16 en `test/media-moderation-e2e.integration.test.ts`. Build limpio.

