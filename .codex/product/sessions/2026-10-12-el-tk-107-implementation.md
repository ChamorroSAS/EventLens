# EL-TK-107 implementation and validation — 2026-10-12

## Outcome
- Status: DONE
- Summary: Implementación del comando `trashMedia` (`MediaModerationService.trashMedia`) y persistencia en `@eventlens/media-inspection` con la tabla `media_trash_record` (migración `202610120021_media_trash`). Permite al organizador propietario enviar medios elegibles (`PUBLISHED`, `HIDDEN`, `PENDING_REVIEW`, `REJECTED`, y condicionalmente `PROCESSING_FAILED` con inspección de seguridad aprobada) a estado `TRASHED`, preservando `previousStatus` y fijando una ventana de restauración canónica de 7 días (`restoreDeadline = trashedAt + 7 días`) conforme a DEC-022, DEC-039 y DEC-096. Las inspecciones de seguridad (`DENIED` o `INCONCLUSIVE`) y bloqueos de retiro prevalecen denegando con `SAFETY_BLOCKED` o `REMOVAL_BLOCKED`. El medio físico y su consumo en `media_consumption_ledger` se mantienen vigentes. Registra auditoría en `audit_event` con acción `MEDIA_TRASHED`.

## Evidence
- Automated test runs: 28/28 unit tests PASS en `packages/media-inspection/test/media-moderation.unit.test.ts`. 13/13 tests en `media-status.test.ts` y `organizer-library.test.ts` PASS.
- Build & typecheck checks: `pnpm --filter @eventlens/media-inspection build` (`tsc -p tsconfig.build.json`) y `pnpm --filter @eventlens/media-inspection typecheck` (`tsc --noEmit`) completados exitosamente con 0 errores.
- Environment: Local monorepo con pnpm workspaces.

## Final quality review
- Code reviewer verdict: PASS.
- Scope verified against acceptance criteria:
  - Escenario 1: Medios en `PUBLISHED`, `HIDDEN`, `PENDING_REVIEW` o `REJECTED` transicionan a `TRASHED`, guardando `previousStatus` y ventana de 7 días.
  - Escenario 2: Medios en curso (`PROCESSING`, `UPLOADED`) se rechazan con `INELIGIBLE_STATE`; `QUARANTINED` se rechaza con `SAFETY_BLOCKED`.
  - Escenario 3: `PROCESSING_FAILED` solo se admite con inspección de seguridad aprobada (`outcome: 'APPROVED'`); sin ella se deniega con `SAFETY_BLOCKED`.
- Prevalencia de seguridad y retención: Bloqueos de seguridad y retiros vigentes impiden la papelera. Consumo comercial se retiene mientras exista el medio físico.
- Idempotencia y concurrencia: Reintentos sobre medios ya en `TRASHED` retornan el registro existente; `expectedRevision` previene modificaciones concurrentes con `CONCURRENCY_CONFLICT`.
- Permisos y aislamiento: Control estricto de pertenencia del evento al organizador; intentos no autorizados devuelven `ACCESS_DENIED`.
- Observabilidad: Registro en `audit_event` con actor `ORGANIZER`, tipo `MEDIA_TRASHED`, y metadata sanitizada (`previousStatus`, `newStatus`, `reason`, `revision`, timestamps).

## Readiness and dependencies
- REQUIREMENTS_READY: YES
- READY_FOR_IMPLEMENTATION: YES
- Next enabled ticket: EL-TK-108 (Restaurar media de papelera respetando bloqueos vigentes — desbloqueado por EL-TK-107).

## Documentation
- Updated documentation files:
  - [.codex/product/tickets/EL-TK-107.md](../../.codex/product/tickets/EL-TK-107.md)
  - [.codex/product/DEPENDENCIES.md](../../.codex/product/DEPENDENCIES.md)
  - [.codex/product/BACKLOG.md](../../.codex/product/BACKLOG.md)
