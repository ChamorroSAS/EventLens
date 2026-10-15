# EL-TK-242 — Gaps de accesibilidad, validación y documentación admin organizers

CR-008, MOD-001/007; depende EL-TK-239/240/241. READY, READY_FOR_IMPLEMENTATION YES.

## Alcance
Completar los gaps identificados entre el plan `docs/admin-organizers-implementation-plan.md` y la implementación actual (EL-TK-239/240/241 aprobados y en código).

### 1. Accesibilidad en `/admin/organizadores`
- **Focus trap en `<dialog>`**: foco contenido al abrir, restaurado al cerrar, ESC cierra sin enviar
- **`aria-describedby`** en todos los errores dinámicos (formulario + lista)
- **Labels/errores asociados** completos en campos y acciones confirmadas

### 2. Vista móvil (tarjetas) responsive
- Breakpoint ≤640px: tabla → tarjetas con misma información (nombre, email, estado, cambio pendiente, acción)
- Touch targets ≥44px en botones y áreas clicables

### 3. Diferenciación de mensajes de error HTTP
- 409 `EMAIL_EXISTS` / `IDEMPOTENCY_CONFLICT` → mensaje específico "El correo ya existe" / "La operación ya estaba registrada"
- 422 `STALE_REVISION` / `INVALID_ARGUMENT` → "La cuenta cambió, recarga antes de continuar" / "Revisa los datos"
- 503 `AUTHORITY_UNAVAILABLE` → mantiene mensaje actual "No se confirmó... consulta antes de reintentar"

### 4. Tests E2E Chromium (Playwright)
- Flujo completo: login admin → listar → crear → ver temporal → gestionar → deshabilitar → habilitar → regenerar temporal
- Flujo organizador: login con temporal → cambio obligatorio → reingreso con nueva
- Verificar denegaciones backend: sin admin, sin CSRF, temporal vencida, cuenta suspendida

### 5. Documentación operativa
- `docs/admin-organizers-runbook.md`: procedimientos admin (crear, suspender, regenerar, recuperar ACK perdido)
- `docs/admin-organizers-troubleshooting.md`: códigos de error, escenarios ACK perdido, replay

### 6. Verificación CI
- Typecheck estricto (`npm run typecheck` o equivalente) pasa en CI
- Build Angular (`npm run build`) sin warnings de accesibilidad

## Aceptación
- Auditoría manual con teclado + screen reader (NVDA/VoiceOver) en `/admin/organizadores` y `/cambiar-contrasena`: sin traps de foco, anuncios correctos
- Resize a 375px: tarjetas funcionales, botones ≥44px
- Cada código de error 409/422/503 muestra mensaje distinto y accionable
- Playwright tests en CI verdes (desktop + mobile viewport)
- Runbook y troubleshooting publicados en `/docs`
- Typecheck y build limpios en pipeline

## Archivos a tocar
- `apps/web/src/app/admin/admin-organizers.component.ts` (accesibilidad)
- `apps/web/src/app/admin/admin-organizers-api.service.ts` (errores diferenciados)
- `apps/web/src/app/admin/admin-organizers-api.service.spec.ts` (nuevo)
- `apps/web/src/app/organizer-auth/organizer-temporary-password.component.ts` (accesibilidad)
- `e2e/tests/admin-organizers.spec.ts` (nuevo)
- `e2e/tests/organizer-password-change.spec.ts` (nuevo)
- `e2e/playwright.config.ts` (proyecto mobile-chromium)
- `docs/admin-organizers-runbook.md` (nuevo)
- `docs/admin-organizers-troubleshooting.md` (nuevo)

## Validación
Typecheck, build, unit tests, E2E Chromium, auditoría accesibilidad manual, review independiente.

## Estado de implementación (verificado)

**Corrección de alcance (evidencia sobre suposición):** al inspeccionar el CSS real
(antes truncado) se confirmó que **la vista móvil en tarjetas ya estaba implementada**
(`@media (max-width: 639px)` convierte `table/tr/td` en bloques con `data-label`, y los
botones ya tienen `min-height: 2.75rem` = 44px). El `<dialog>` nativo con `showModal()`
ya aporta contención de foco y ESC (interceptado en `cancelDialog` → `closeDialog`, sin
enviar). Por ello estos puntos no se reimplementaron; se verificaron.

**Gaps reales implementados:**

| Punto | Estado | Evidencia |
|-------|--------|-----------|
| `aria-describedby`/`aria-invalid` en **todos** los campos del formulario admin | ✅ | solo el email lo tenía; nombre y motivo añadidos |
| `aria-describedby`/`aria-invalid` en `/cambiar-contrasena` | ✅ | inputs + checkbox adultos |
| Diferenciación por **código de dominio** (no solo estado HTTP): `EMAIL_EXISTS`, `IDEMPOTENCY_CONFLICT`, `STALE_REVISION`, `CONCURRENCY_CONFLICT`, `INVALID_STATE`, `INVALID_ARGUMENT`, `AUTHORITY_UNAVAILABLE` | ✅ | `PublicErrorFilter` expone una allowlist explícita código→mensaje público fijo; sanitización intacta (`errors.test.ts` ahora 18 casos). `admin-organizers-api.service.ts` ya leía `result.error.code`. Ver BLOCKER-1 resuelto. |
| E2E guard/denegaciones (sin sesión admin, transporte JSON, redirección) | ✅ | `e2e/tests/admin-organizers.spec.ts` |
| E2E flujo autenticado (crear→gestionar→deshabilitar→habilitar→regenerar) y flujo organizador (temporal→cambio→reingreso) | ✅ (gated) | requiere `EVENTLENS_E2E_ADMIN_IDENTIFIER`/`EVENTLENS_E2E_ADMIN_SECRET`; el bootstrap admin es POSIX-only |
| Proyecto mobile viewport | ✅ | `e2e/playwright.config.ts` (`Pixel 5`) |
| Runbook + troubleshooting | ✅ | `docs/admin-organizers-runbook.md`, `docs/admin-organizers-troubleshooting.md` |
| Typecheck/build/tests limpios | ✅ | web 256 unit verdes, typecheck web+e2e verde, build web OK |

**Fixes de "terminar lo definido" (rompían la suite por trabajo pendiente previo):**
- `organizer-temporary-password.component.ts`: `declaredAdult: true` literal (contrato exige `true`).
- `app.routes.spec.ts`: mock de sesión sin `refreshSessionProjection` (nuevo `organizerSessionGuard`).
- `admin-read-only-shell.component.spec.ts`: primer `<a>` ahora es nav; y `RouterLink` requiere router.
- `packages/api-client`: `dist` estaba desactualizado respecto a `src/schema.ts` (`PASSWORD_CHANGE_REQUIRED`, `canChangePassword`); reconstruido.

**Pendiente no verificable en este entorno:** auditoría manual con lector de pantalla
(NVDA/VoiceOver) y ejecución real de los E2E (requieren stack aislado + PostgreSQL de
pruebas; sin `EVENTLENS_TEST_ADMIN_URL` no corren localmente). El flujo autenticado
E2E queda `skip` sin credenciales de bootstrap.

## BLOCKER-1 — RESUELTO: allowlist de códigos de dominio en `PublicErrorFilter`

**Decisión:** opción 1 (allowlist explícita código→mensaje público fijo), confirmada por
el usuario. Aditiva, sanitización intacta y alineada con `api-conventions.md`.

**Implementación (`apps/api/src/platform/http/error.filter.ts`):**
- Nueva allowlist `publicDomainErrors: Record<code, {code, message}>` con
  `EMAIL_EXISTS`, `IDEMPOTENCY_CONFLICT`, `STALE_REVISION`, `CONCURRENCY_CONFLICT`,
  `INVALID_STATE`, `INVALID_ARGUMENT`, `AUTHORITY_UNAVAILABLE`. El `message` es fijo:
  **nunca** se usa el mensaje de la excepción.
- `allowlistedDomainError(error)` sólo honra un `code` presente en la allowlist; el
  resto conserva el comportamiento derivado del estado (`publicErrors[status]`). Un
  cuerpo con `UNTRUSTED_CODE` sigue saneándose.
- El estado HTTP sigue siendo el de la excepción; sólo se reemplazan `code`/`message`.

**Evidencia:**
- `apps/api/test/errors.test.ts`: 18 casos verdes, incluida la matriz allowlist y el
  control negativo (`NOT_IN_ALLOWLIST` → `CONFLICT`).
- `pnpm --filter @eventlens/api typecheck` y `build` verdes; `pnpm --filter @eventlens/api test`
  71/71 verdes.
- Contratos existentes preservados: `beta-access-request` 422 `VALIDATION_ERROR`,
  `health` 404 `NOT_FOUND`, `unavailable` 503 `DEPENDENCY_UNAVAILABLE`,
  `organizer-session` 401 `UNAUTHENTICATED` (esas excepciones no llevan `code`).
- Documentado en `docs/admin-organizers-troubleshooting.md` (tabla código→mensaje).

**Excepción de alcance:** las pruebas de integración que importan `dist/application.js`
requieren PostgreSQL aislado; no se ejecutan en este entorno. Se verificó por build +
typecheck + suite unitaria.

## Evidencia original del hallazgo (histórico)

**Evidencia (verificada):**
- `PublicErrorFilter` se registra global (`apps/api/src/application.ts:27`) y **ignora el
  cuerpo de la excepción**: emite `{ code, message, correlationId }` con `code` derivado
  del estado (`apps/api/src/platform/http/error.filter.ts:5-15,25-29,43`).
- Es una decisión **probada**: `apps/api/test/errors.test.ts:23` afirma que un
  `HttpException({code:'UNTRUSTED_CODE'})` se sanea al código por estado; e integración
  también lo fija (`beta-access-request.test.ts:61` → `VALIDATION_ERROR`,
  `health.test.ts:23` → `NOT_FOUND`, `unavailable.test.ts:17` → `DEPENDENCY_UNAVAILABLE`,
  `organizer-session.test.ts:267` → `UNAUTHENTICATED`).
- Por ello los 409 del recurso (`EMAIL_EXISTS`, `IDEMPOTENCY_CONFLICT`, `STALE_REVISION`,
  `INVALID_STATE`) se colapsan a `CONFLICT` y no se pueden distinguir por estado.

**Contradicción con la convención aceptada:** `.codex/context/api-conventions.md` exige
`code` estable que distinga `409 revisión/replay/binding` y que los conflictos
optimistas se muestren. Varios controladores ya lanzan `code` de dominio
(`admin-read-only.service.ts`, `admin-session.service.ts`, `organizer-events.controller.ts`
409 `CONCURRENCY_CONFLICT`/`IDEMPOTENCY_CONFLICT`/`INVALID_STATE`, `admin-organizers.service.ts`),
asumiendo propagación que hoy no ocurre.

**Opciones (requiere decisión; impacto de contrato público de plataforma):**
1. **Allowlist en `PublicErrorFilter`** (recomendado): exponer una lista explícita
   código→mensaje público fijo (nunca el mensaje de la excepción). Aditivo y
   sanitización intacta; alinea con `api-conventions`. Requiere actualizar
   `errors.test.ts` y documentar el vocabulario.
2. **Filtro acotado al controlador** `AdminOrganizersController` (`@UseFilters`), sin
   tocar el contrato global; contained pero divergente y de precedencia no ejercitada
   por tests en este entorno.
3. **Re-scopear**: aceptar el `code` por estado y diferenciar solo por (operación, estado);
   no cumple el 409 diferenciado de la aceptación.

Con BLOCKER-1 resuelto, la aceptación «cada código 409/422/503 muestra mensaje distinto»
queda **cumplida por contrato**: 409 (`EMAIL_EXISTS`/`IDEMPOTENCY_CONFLICT`/`STALE_REVISION`/`INVALID_STATE`),
422 (`INVALID_ARGUMENT`) y 503 (`AUTHORITY_UNAVAILABLE`) se distinguen por `code`. Queda
pendiente únicamente la verificación manual con lector de pantalla y la ejecución E2E real
sobre stack aislado (fuera de este entorno).