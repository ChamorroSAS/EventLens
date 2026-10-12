# EL-TK-006, EL-TK-007, EL-TK-008 & EL-TK-009 Delivery — 2026-10-12

## Outcome
- Status: DONE
- Summary: 
  - **EL-TK-006:** Implementación de `BetaInvitationService.revokeInvitation` en `@eventlens/identity`. Permite a un administrador (`ADMIN_HUMAN`) revocar transaccionalmente una invitación `PENDING` o `EXPIRED`, avanzando atómicamente la revisión CAS `revision + 1n` y registrando `revoked_at`. Si la invitación ya fue consumida por una cuenta activa (`CONSUMED`), no altera la invitación ni la cuenta y devuelve `CANNOT_REVOKE_CONSUMED`. Es idempotente ante invitaciones ya revocadas (`ALREADY_REVOKED`). Registra auditoría append-only `BETA_INVITE_REVOKE`.
  - **EL-TK-007:** Implementación de `BetaInvitationService.listInvitations` y `getInvitation` en `@eventlens/identity`. Permite consulta administrativa con paginación (`limit`, `offset`) y filtros por estado. Protege los tokens omitiendo digests y tokens planos de las proyecciones (`BetaInvitationSummaryRecord`). Devuelve estado vacío neutro (`items: []`, `total: 0`) si no hay resultados. Registra auditoría `BETA_INVITE_LIST_VIEWED`.
  - **EL-TK-008:** Implementación de `BetaAccessRequestService.requestAccess` en `@eventlens/identity`. Endpoint público para registrar solicitudes de acceso sin crear cuentas ni emitir invitaciones. Valida sintaxis RFC 5322 (`INVALID_EMAIL`), previene enumeración de usuarios garantizando respuesta neutra idéntica (`REQUEST_RECEIVED`), deduplica de forma idempotente y aplica limitación de tasa configurable (`RATE_LIMITED`). Persiste en PostgreSQL en la tabla `beta_access_request` y registra auditoría `BETA_ACCESS_REQUEST_SUBMITTED`. Desbloquea downstream `EL-TK-009`.
  - **EL-TK-009:** Implementación de `BetaAccessRequestService.listAccessRequests` y `getAccessRequest` en `@eventlens/identity`. Inspección administrativa de solo lectura con paginación y detalle sin transiciones de estado ni aprobaciones. Maneja estados vacíos de forma segura. Emite auditoría inmutable (`BETA_ACCESS_REQUEST_LIST_VIEWED`, `BETA_ACCESS_REQUEST_DETAIL_VIEWED`).

## Evidence
- Automated test runs:
  - Unit tests: 78/78 tests PASS en `@eventlens/identity` (`test/invitation.unit.test.ts` 15/15 PASS, `test/access-request.unit.test.ts` 8/8 PASS, `test/authentication.unit.test.ts` 13/13 PASS, `test/provisioning.unit.test.ts` 12/12 PASS, etc.).
  - PostgreSQL integration tests:
    - `test/invitation.integration.test.ts`: 7/7 tests PASS en PostgreSQL 16 real.
    - `test/access-request.integration.test.ts`: 3/3 tests PASS en PostgreSQL 16 real.
- Build & typecheck checks: `tsc --noEmit` en `@eventlens/identity` completado con 0 errores (exit code 0).
- Database migrations:
  - Migración DDL para tabla `beta_access_request` en `packages/identity/prisma/migrations/202610120045_beta_access_request/migration.sql` y `packages/database/prisma/migrations/202610120045_beta_access_request/migration.sql`. Modelos Prisma sincronizados.

## Final quality review
- Code reviewer verdict: PASS.
- Scope verified against acceptance criteria:
  - **EL-TK-006:** Aceptación validada para revocar invitaciones no usadas e impedir activación; denegación de revocación para invitaciones consumidas por cuentas activas; control de concurrencia y auditoría inmutable.
  - **EL-TK-007:** Aceptación validada para consulta administrativa segura; omisión estricta de tokens/hashes; manejo de listas vacías y rechazo para no administradores.
  - **EL-TK-008:** Aceptación validada para solicitud pública; validación de correo; protección anti-enumeración; rate limiting y deduplicación idempotente sin conceder acceso ni crear cuentas.
  - **EL-TK-009:** Aceptación validada para inspección de solo lectura; lista vacía sin error; cero efectos colaterales de mutación o activación.

## Readiness and dependencies
- REQUIREMENTS_READY: YES
- READY_FOR_IMPLEMENTATION: YES
- Estado en `EL-EP-001`:
  - `EL-TK-005`: DONE
  - `EL-TK-006`: DONE
  - `EL-TK-007`: DONE
  - `EL-TK-008`: DONE
  - `EL-TK-009`: DONE
  - `EL-TK-010`: DONE
  - `EL-TK-011`: DONE
  - `EL-TK-013`: DONE
  - `EL-TK-043`: DONE
  - `EL-TK-044`: DONE
  - `EL-TK-046`: DONE
- Tickets restantes en `EL-EP-001` (Ruta 2 y Ruta 3):
  - **Ruta 2 (Verificación y Gestión de Sesiones del Organizador):**
    - `EL-TK-012`: Reenviar la verificación de correo
    - `EL-TK-014`: Consultar mis sesiones activas
    - `EL-TK-015`: Cerrar mi sesión actual
    - `EL-TK-016`: Cerrar una sesión propia seleccionada
    - `EL-TK-017`: Cerrar todas mis otras sesiones
  - **Ruta 3 (Recuperación y Revocación Admin):**
    - `EL-TK-018`: Solicitar recuperación de contraseña
    - `EL-TK-019`: Completar una recuperación de contraseña
    - `EL-TK-045`: Revocar un principal administrativo
    - Cierre final de `EL-EP-001`

## Documentation
- Updated documentation files:
  - [.codex/product/tickets/EL-TK-006.md](../../.codex/product/tickets/EL-TK-006.md)
  - [.codex/product/tickets/EL-TK-007.md](../../.codex/product/tickets/EL-TK-007.md)
  - [.codex/product/tickets/EL-TK-008.md](../../.codex/product/tickets/EL-TK-008.md)
  - [.codex/product/tickets/EL-TK-009.md](../../.codex/product/tickets/EL-TK-009.md)
  - [.codex/product/BACKLOG.md](../../.codex/product/BACKLOG.md)
  - [.codex/product/DEPENDENCIES.md](../../.codex/product/DEPENDENCIES.md)
