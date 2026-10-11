# @eventlens/notifications (MOD-009)

Package responsible for communication and reliable notification intents under **MOD-009** (EL-EP-013, DEC-021, DEC-064).

## Scope & Architectural Invariants

1. **Separation of Domain from Dispatch Channels (EL-TK-156):**
   - Core domain facts from owner modules emit persistent, sanitized `NotificationIntent` records.
   - Dedicated workers (`EL-TK-157`) and UI projections (`EL-TK-158`) consume intents without coupling domain logic to specific email delivery vendors or presentation components.
2. **Deterministic Deduplication & Replay:**
   - Intent records are keyed by semantic `dedupKey` (`UNIQUE`).
   - Identical domain events result in `IDEMPOTENT_REPLAY` without creating duplicate records.
   - Conflicting parameters under the same `dedupKey` throw `IDEMPOTENCY_CONFLICT`.
3. **Obsolescence & Supersession:**
   - Obsolete domain conditions (e.g. suspension followed by reactivation, or resolved quota warnings) can be marked as `SUPERSEDED` atomically or revalidated prior to dispatch, preventing delivery of stale or inaccurate risk notices.
4. **Auditability & Privacy:**
   - Audit entries are persisted in `notification_audit_event` without leaking credentials, authentication tokens, or raw media payloads.

## Verification

- Unit tests: `pnpm --filter @eventlens/notifications test:unit` (11 tests PASS)
- Integration tests (PostgreSQL 16): `pnpm --filter @eventlens/notifications test:integration` (5 tests PASS)
- Typecheck: `pnpm --filter @eventlens/notifications typecheck` (0 errors)
- Build: `pnpm --filter @eventlens/notifications build` (0 errors)
