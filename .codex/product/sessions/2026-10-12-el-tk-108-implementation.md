# EL-TK-108 implementation and validation — 2026-10-12

## Outcome
- Status: DONE
- Summary: Implementación del comando `restoreMedia` (`MediaModerationService.restoreMedia`) y método `markTrashRestored` en `@eventlens/media-inspection`. Permite al organizador propietario restaurar un medio desde `TRASHED` a su estado previo canónico (`previousStatus`) durante la ventana de 7 días, respetando de forma irrestricta los bloqueos de seguridad (`SAFETY_BLOCKED`), retiros vigentes (`REMOVAL_BLOCKED`), y revalidando que si el estado previo era `PENDING_REVIEW`, no se publica automáticamente sino que regresa a `PENDING_REVIEW` conforme a DEC-086 y DEC-096. Si la ventana de 7 días expiró se deniega con `RESTORE_WINDOW_EXPIRED`, y si el medio fue purgado/eliminado (`DELETED`), se deniega con `MEDIA_PURGED`. Registra auditoría en `audit_event` con acción `MEDIA_RESTORED`.

## Evidence
- Automated test runs: 39/39 unit tests PASS en `packages/media-inspection/test/media-moderation.unit.test.ts`.
- Build & typecheck checks: `pnpm --filter @eventlens/media-inspection build` (`tsc -p tsconfig.build.json`) y `pnpm --filter @eventlens/media-inspection typecheck` (`tsc --noEmit`) completados exitosamente con 0 errores.
- Environment: Local monorepo con pnpm workspaces.

## Final quality review
- Code reviewer verdict: PASS.
- Scope verified against acceptance criteria:
  - Escenario 1: Medios en `TRASHED` restaurados dentro de la ventana recuperan su `previousStatus` registrado (`PUBLISHED`, `HIDDEN`, `REJECTED`), incrementando atómicamente la revisión CAS y registrando `restored_at`.
  - Escenario 2: Medios cuyo `previousStatus` era `PENDING_REVIEW` regresan a `PENDING_REVIEW` sin publicarse de forma indebida (DEC-086).
  - Escenario 3: Ventana expirada (`restoreDeadline < now`) deniega con `RESTORE_WINDOW_EXPIRED`; medios purgados (`DELETED`) deniegan con `MEDIA_PURGED` sin recrear contenido.
- Prevalencia de seguridad y retiros vigentes: Bloqueos de seguridad activos (`outcome: 'DENIED'` o `'INCONCLUSIVE'`) y bloqueos de retiro prevalecen impidiendo la restauración (`SAFETY_BLOCKED` / `REMOVAL_BLOCKED`).
- Idempotencia y concurrencia: Reintento sobre media ya restaurada a su `previousStatus` retorna resultado idempotente. Desacuerdos de versión contra `expectedRevision` devuelven `CONCURRENCY_CONFLICT`.
- Permisos y aislamiento: Control estricto de pertenencia del evento al organizador; intentos no autorizados o cross-event devuelven `ACCESS_DENIED`.
- Observabilidad: Registro en `audit_event` con actor `ORGANIZER`, tipo `MEDIA_RESTORED`, registrando `previousStatus: 'TRASHED'`, nuevo estado y actor sin almacenar binarios.

## Readiness and dependencies
- REQUIREMENTS_READY: YES
- READY_FOR_IMPLEMENTATION: YES
- Next enabled tickets:
  - EL-TK-105 (Ocultar una media publicada sin eliminarla — depende de 098, 101: ambos DONE).
  - EL-TK-109 (Entregar a purga una media cuya papelera venció — depende de 107, 055: ambos DONE).
  - EL-TK-110 (Cambiar el modo de moderación sin reescribir contenido existente — depende de 028, 037: ambos DONE).
  - EL-TK-111 (Integrar acciones de moderación y papelera en la biblioteca del organizador — depende de 100, 103..108, 110).

## Documentation
- Updated documentation files:
  - [.codex/product/tickets/EL-TK-108.md](../../.codex/product/tickets/EL-TK-108.md)
  - [.codex/product/DEPENDENCIES.md](../../.codex/product/DEPENDENCIES.md)
  - [.codex/product/BACKLOG.md](../../.codex/product/BACKLOG.md)
