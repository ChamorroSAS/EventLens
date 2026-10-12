# EL-EP-002 Ruta 2 Completion (EL-TK-024, EL-TK-025, EL-TK-031) — 2026-10-12

## Outcome
- Status: DONE
- Summary:
  - **EL-TK-024 (DONE):** Implementación de `EventDraftService.changeTimezone` en `@eventlens/event-management`. Permite al organizador propietario cambiar la zona horaria IANA de su evento en estado `DRAFT` o `SCHEDULED`. Valida autorización exclusiva del propietario (`UNAUTHORIZED`), bloquea eventos que ya hayan alcanzado `ACTIVE` o posterior (`INVALID_STATE`), valida zona IANA estándar mediante `validateIanaTimezone` (`INVALID_ARGUMENT`), conserva la fecha y hora local (`starts_at_local`), recalcula el instante UTC determinista (`scheduled_at`) con `resolveScheduleLocalTime`, rechaza horas DST inexistentes (`DST_GAP_TIME`) sin mutar el evento, exige selección de offset explícito ante horas locales ambiguas/repetidas (`AMBIGUOUS_LOCAL_TIME` / `INVALID_OFFSET`), emite advertencia explícita `warning: 'RECALCULATED_SCHEDULE'` cuando el evento está en `SCHEDULED`, permite cambiar TZ en `DRAFT` sin fecha conservando nulls en horario, garantiza idempotencia transaccional (`IDEMPOTENT_REPLAY` / `IDEMPOTENCY_CONFLICT`) y registra auditoría inmutable (`EVENT_TIMEZONE_CHANGED`).
  - **EL-TK-025 (DONE):** Implementación de `EventDraftService.adminCorrectTimezone` en `@eventlens/event-management`. Permite a un administrador autenticado (`AdminActorContext` con `ADMIN_HUMAN`) corregir justificadamente la zona horaria de un evento que alcanzó el estado `ACTIVE` (`ACTIVE`, `CLOSED`, `GRACE_PERIOD`, `SUSPENDED`). Valida contexto administrativo (`UNAUTHORIZED`), exige justificación no vacía obligatoria (`JUSTIFICATION_REQUIRED`), rechaza eventos que no hayan alcanzado `ACTIVE` (`DRAFT`, `SCHEDULED` vía `INVALID_STATE`) o que sean terminales/eliminados (`PENDING_DELETION`, `ARCHIVED` vía `EVENT_TERMINAL`), valida zona IANA, conserva `starts_at_local` recalculando el instante UTC `scheduled_at`, rechaza DST gaps sin modificar el evento, preserva estrictamente sin alteraciones las fechas y plazos de ciclo de vida (`expires_at`, `grace_ends_at`, `purge_started_at` quedan intactos), soporta idempotencia transaccional y audita la corrección administrativa registrando actor, valores anterior/nuevo y justificación (`ADMIN_EVENT_TIMEZONE_CORRECTED`).
  - **EL-TK-031 (DONE):** Implementación de `EventDraftService.previewDraftAsGuest` en `@eventlens/event-management`. Emite un `EventSnapshot` privado para el organizador propietario sobre su evento en estado `DRAFT`. Refleja la configuración vigente con los defaults y ausencias de DEC-069, `pinEnabled` boolean sin revelar hashes ni sales de credenciales, `coverPreviewUrl` (o null si ausente) resuelto mediante `coverAssetResolver` opcional por contrato, y flag `isPreview: true`. Garantiza aislamiento multi-inquilino estricto con anti-enumeración (`EVENT_NOT_FOUND` para actores no propietarios), garantiza no-mutación de la base de datos, no publica el evento, no crea sesiones de invitado ni emite QR o enlaces públicos, y audita la solicitud de vista previa (`EVENT_DRAFT_PREVIEWED`).

## Evidence
- Automated test runs:
  - **Pruebas Unitarias:** 238/238 tests PASS en `@eventlens/event-management`:
    - `test/event-draft-timezone-preview.unit.test.ts`: 28/28 tests PASS (cobertura exhaustiva de EL-TK-024, EL-TK-025 y EL-TK-031: validaciones de actor, IANA TZ, DST gaps, ambigüedad DST, recalculación UTC, advertencia SCHEDULED, estados permitidos y prohibidos, fechas de ciclo de vida intactas, idempotencia y auditoría).
    - `test/event-draft-config.unit.test.ts`: 30/30 tests PASS.
    - `test/guest-session.unit.test.ts`: 24/24 tests PASS.
    - `test/event-draft.unit.test.ts`: 12/12 tests PASS.
    - `test/event-access-management.unit.test.ts`: 11/11 tests PASS.
    - `test/event-lifecycle.unit.test.ts`: 50/50 tests PASS.
    - `test/event-schedule.unit.test.ts`: 6/6 tests PASS.
    - `test/event-timeline.unit.test.ts`: 11/11 tests PASS.
    - `test/upload-lifecycle.unit.test.ts`: 15/15 tests PASS.
    - `test/upload-authorization.unit.test.ts`: 14/14 tests PASS.
    - `test/qr-generator.unit.test.ts`: 4/4 tests PASS.
    - `test/event-public-access.unit.test.ts`: 11/11 tests PASS.
    - `test/event-organizer-query.unit.test.ts`: 8/8 tests PASS.
    - `test/guest-contributions.unit.test.ts`: 7/7 tests PASS.
    - `test/event-access-policy.unit.test.ts`: 7/7 tests PASS.
  - **Pruebas de Integración:** 75/75 tests PASS en PostgreSQL 16 real:
    - `test/event-draft-timezone-preview.integration.test.ts`: 6/6 tests PASS (persistencia real de cambio de zona en PostgreSQL, recálculo UTC exacto en base de datos, advertencia en SCHEDULED, idempotencia y replay, corrección administrativa post-ACTIVE con justificación, verificación de que `expires_at` y `grace_ends_at` no sufren alteraciones en PostgreSQL, snapshot de preview privado y anti-enumeración ante actor ajeno).
    - `test/event-draft-config.integration.test.ts`: 6/6 tests PASS.
    - `test/guest-session.integration.test.ts`: 7/7 tests PASS.
    - `test/guest-access-lifecycle.integration.test.ts`: 1/1 tests PASS.
    - `test/upload-lifecycle.integration.test.ts`: 7/7 tests PASS.
    - `test/event-draft.integration.test.ts`: 6/6 tests PASS.
    - `test/upload-e2e-flow.integration.test.ts`: 4/4 tests PASS.
    - `test/event-lifecycle.integration.test.ts`: 20/20 tests PASS.
    - `test/event-schedule.integration.test.ts`: 3/3 tests PASS.
    - `test/event-public-access.integration.test.ts`: 8/8 tests PASS.
    - `test/event-organizer-query.integration.test.ts`: 4/4 tests PASS.
    - `test/upload-authorization.integration.test.ts`: 3/3 tests PASS.
  - **Total de pruebas en `@eventlens/event-management`:** 313/313 tests PASS (100% PASS, 0 fallos).
  - **Pruebas en `@eventlens/identity`:** 152/152 tests PASS (100% PASS).
- Compilación y tipado:
  - `pnpm --filter @eventlens/event-management build` (`tsc -p tsconfig.build.json`) completado con código de salida 0.

## Final quality review
- Code reviewer verdict: PASS.
- Multi-tenancy y anti-enumeración: Solo el organizador propietario puede cambiar zona u obtener preview privado; accesos ajenos o no existentes retornan `EVENT_NOT_FOUND` de forma indistinguible.
- Zero-secrets: `EventSnapshot` expone únicamente `pinEnabled` boolean; nunca expone hashes, sales ni credenciales de acceso.
- Integridad temporal: Preserva la hora local (`starts_at_local`), valida transiciones de horario de verano IANA y recalcula UTC sin alterar las fechas de expiración o gracia en eventos activos.

## Status Summary of EL-EP-002 (13/17 Tickets DONE)
| ID | Nombre | Estado |
|---|---|---|
| EL-TK-020 | Crear un borrador de evento | DONE |
| EL-TK-021 | Cambiar el nombre de un borrador | DONE |
| EL-TK-022 | Definir la bienvenida de un borrador | DONE |
| EL-TK-023 | Definir la fecha y hora local de un borrador | DONE |
| EL-TK-024 | Cambiar la zona horaria de un evento preparado | DONE |
| EL-TK-025 | Corregir la zona horaria de un evento que alcanzó ACTIVE | DONE |
| EL-TK-027 | Establecer el PIN inicial de un borrador | DONE |
| EL-TK-028 | Elegir el modo de moderación de un borrador | DONE |
| EL-TK-029 | Configurar la carga de invitados en un borrador | DONE |
| EL-TK-030 | Configurar la galería invitada en un borrador | DONE |
| EL-TK-031 | Previsualizar un borrador como invitado | DONE |
| EL-TK-047 | Consultar mis eventos y su configuración autorizada | DONE |
| EL-TK-048 | Navegar por la configuración de un evento propio | DONE |
| EL-TK-049 | Autorizar y confirmar una carga de portada EVENT_COVER | READY (Próxima: Ruta 3) |
| EL-TK-050 | Integrar el procesamiento seguro de una portada EventAsset | READY (Próxima: Ruta 3) |
| EL-TK-051 | Asignar una portada READY segura mediante revisión CAS | READY (Próxima: Ruta 3) |
| EL-TK-052 | Limpiar portadas anteriores o no asignadas sin borrar la vigente | READY (Próxima: Ruta 3) |
