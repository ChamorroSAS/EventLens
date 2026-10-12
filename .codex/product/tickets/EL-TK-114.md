# EL-TK-114 — Retirar irreversiblemente un aporte propio con sesión guest válida

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** invitado con sesión válida, **quiero** retirar definitivamente uno de mis aportes, **para** sacar de visibilidad mi contenido sin aprobación del organizador.

## Alcance funcional
Confirmar ownership por GuestSession, retirar visibilidad inmediatamente, fijar purge_started_at y emitir la eliminación irreversible conforme DEC-089/097.

## Fuera de alcance
Retirar contenido ajeno, usar papelera, permitir cancelación/restauración o recuperar una sesión perdida.

## Criterios de aceptación
### Escenario 1
**Dado** la sesión vigente es dueña del aporte, **cuando** el usuario confirma retiro, **entonces** se retira de visibilidad y comienza la ruta irreversible sin veto del owner.

### Escenario 2
**Dado** la media no pertenece a la sesión, **cuando** se intenta retirar, **entonces** se deniega sin revelar información ajena.

### Escenario 3
**Dado** se repite la confirmación, **cuando** se procesa, **entonces** no cambia purge_started_at ni duplica la eliminación.

## Reglas de negocio
Sin papelera ni ventana cancelable. Deadlines de purga siguen DEC-092/097/098.

## Validaciones y permisos
GuestSession válida y ownership por sessionId.

## Casos de error y estados vacíos
Sesión revocada, media ajena, ya retirada, conflicto y timeout de resultado desconocido.

## Datos / contratos afectados
OwnRemoval command, purge_started_at, removal status, tombstone/purge contract.

## Dependencias técnicas y funcionales
Mis aportes EL-TK-078 y eliminación EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-078; contrato EL-EP-015
- **blocks:** EL-TK-121, EL-TK-123

## Pruebas requeridas
Ownership, ajeno, replay, sesión revocada, visibilidad inmediata y ancla de purga.

## Observabilidad / auditoría
Auditar mínimo técnico de retiro sin conservar media para auditoría.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-019; DEC-084, DEC-089, DEC-097, DEC-098; EL-EP-009, EL-EP-015.

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

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Implementado servicio `OwnMediaRemovalService`, repositorio `PostgresOwnRemovalRepository` y `PostgresGuestSessionResolver` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Creada tabla canónica y modelo `media_own_removal_record` (migración `202610120050_media_reports_and_removal`) con deduplicación por clave única `own-removal:${mediaRef}`.
  - Integrado con `PurgeDispatcherPort` fijando ancla inmutable en el instante de confirmación: `purgeStartedAt = now` con plazos `mainPurgeDeadline = +7 días UTC` y `residualPurgeDeadline = +30 días UTC` (DEC-089, DEC-097, DEC-098).
- **Criterios de aceptación verificados:**
  - Escenario 1: Al confirmar el retiro con sesión guest válida, la media se retira inmediatamente de visibilidad pasando a `status = 'DELETED'` con incremento de revisión, sin papelera ni ventana cancelable, emitiendo la solicitud a purga sin requerir aprobación ni admitir veto del organizador.
  - Escenario 2: Si la media pertenece a otro aportante (`guestRef` distinto), se deniega con `NOT_OWNER` sin revelar metadatos del dueño real.
  - Escenario 3: Reintentos de confirmación son idempotentes: retornan `outcome = 'ALREADY_REMOVED'` conservando el `purgeStartedAt` original inmutable sin duplicar emisiones a purga.
- **Pruebas:** 5 pruebas unitarias en `media-report-and-removal.unit.test.ts` y 3 pruebas de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16. Build limpio.

