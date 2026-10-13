# EL-EP-017 — Contratos HTTP de integración transversales

**Fecha:** 2026-10-12. **Estado:** CONTRACT_PROPOSED / NOT_IMPLEMENTED / LEGAL_GATE_BLOCKED. Documento de diseño; no reemplaza `contracts/openapi.json` generado ni autoriza nuevos permisos.

## Evidencia de baseline en `stage`

- `apps/api/src/app.module.ts` monta solo `HealthController`; el OpenAPI actual solo contiene `/api/v1/health/live` y `ready`. No hay rutas HTTP de negocio publicadas.
- `apps/web/src/app/admin/admin-api.service.ts` consume `/api/admin` y puede enviar `x-admin-actor-id`; eso **no** acredita autenticación ni debe servir como credencial.
- `apps/web/src/app/guest/guest-container.component.ts` emite sesión local de prueba y usa versión `v1.0` fija; `GuestService.recordConsent` solo muta estado Angular. `GuestSessionService.recordConsent/checkConsent` sí persiste/checkea versión en dominio.
- `BetaAccessRequestService.requestAccess` realiza deduplicación/no enumeración en dominio; un controller HTTP aún no acredita información/autorización jurídica para captar correos.

## Reglas transversales del adaptador API

1. Prefijo canónico **`/api/v1`**, JSON/OpenAPI generado desde controllers NestJS y cliente Angular regenerado. No editar `contracts/openapi.json` manualmente; usar `pnpm openapi:export`, `pnpm client:generate` y `pnpm client:check`.
2. Identidad administrativa obtenida exclusivamente de **sesión/credencial validada del servidor** (MOD-001). Rechazar `x-admin-actor-id` como fuente de actor; eliminar su uso en cliente. Para mutaciones con cookie: comprobar origen y CSRF. Aislamiento de recurso y capabilities se autorizan en dominio.
3. DTOs HTTP dedicados, validados por esquema y allowlist; no exponer Prisma, AuditSink, `actorContext`, IDs privados ajenos, `downstreamResult` sin sanitizar ni información técnica de seguridad. `X-Correlation-Id`, `Cache-Control: no-store` en respuestas sensibles; nunca correo, PIN ni tokens de sesión, administrador o recuperación en URL, trazas o analytics; la credencial pública compartible QR se rige por DEC-013/083 y controles de referrer/noindex.
4. Errores uniformes `{code,message,correlationId}`: 400 DTO inválido, 401 sesión inválida, 403 permiso sin revelar recurso ajeno, 404 no disponible autorizado, 409 conflicto/versionado, 429 rate-limit y 503 temporal. No copiar excepciones, datos privados o estados ajenos a respuesta pública.
5. Idempotencia por operación/actor/recurso; mutación+auditoría necesaria+outbox en una unidad de trabajo PostgreSQL según ARCH aceptados. No acreditar entrega de correo por registrar una intención de notificación.

## Contratos de interfaz propuestos (no rutas existentes)

| Endpoint | Auth | Body/param relevante | Respuesta/semántica | Owner/gate |
|---|---|---|---|---|
| `POST /api/v1/beta/access-requests` | Público; rate limiting | `{email}`; **sin notes libres** en formulario público | `202 {status:"REQUEST_RECEIVED"}` neutra para solicitudes nuevas/repetidas; **no devolver requestId** ni existencia de cuenta | MOD-001 EL-TK-008 + LEG-01/03/04/05/06 bloquean activación pública |
| `GET /api/v1/admin/beta/access-requests` | Admin válido + scope; paginación | `limit,offset` limitados | Lista de revisión restringida, no caché; no reportar PII en auditoría | MOD-001 EL-TK-009 |
| `GET /api/v1/admin/beta/access-requests/{requestId}` | Admin válido + scope | UUID opaco | DTO de detalle limitado; auditar con requestId, no email | MOD-001 EL-TK-009 |
| `POST /api/v1/guest/sessions` | Credencial evento válida + PIN si aplica | `{lookupKey,pin?}` | Sesión guest emitida por backend según `CreateGuestSessionResult`; no tokens simulados | MOD-002/003 EL-EP-004; revisar transporte seguro del token |
| `GET /api/v1/guest/consent` | `X-Guest-Session` válida en contrato actual | Ningún `requiredVersion` enviado por cliente | `{requiredVersion,documentUrl,requiresAcceptance}` obtenidos de **registro servidor de texto jurídico aprobado**, aún inexistente | DEC-041 + LEG-03/07; gate legal |
| `POST /api/v1/guest/consent` | Sesión guest válida | `{documentVersion,accepted:true}` | Versión debe coincidir con vigente/aceptable en servidor; `200 {outcome,documentVersion,acceptedAt}`; si obsoleta, 409 sin mutación | MOD-002 `recordConsent`; versión/cuerpo legal aún PENDING |
| `POST /api/v1/admin/events/{eventId}/interventions` | Admin autenticado + capability por acción, CSRF y motivo | `{interventionType,reason,idempotencyKey?}` | `{outcome,interventionType,eventId,executedAt}` sin datos de terceros, según orquestador; 409 al violar lifecycle | MOD-007/002/003, EL-TK-151; seguridad antes de exponer |

En el endpoint de intervenciones se permiten **solo operaciones ya definidas por `AdminInterventionType`**, con política de dominio. `SUSPEND_EVENT` y `REACTIVATE_EVENT` cumplen DEC-078/081; `REVOKE_GUEST_ACCESS` **revoca TODAS las sesiones del evento** por `AdminAccessPort.revokeAllGuestSessions` y debe etiquetarse en UI como acción global de alto impacto. No reutilizarla como sanción selectiva.

**No definir ni publicar por ahora** `SUSPEND_ORGANIZER_ACCOUNT`, `REVOKE_SINGLE_GUEST_SESSION` ni un endpoint de expedientes de privacidad; esas capacidades exigen revisión de autoridad, permisos y gate propios. El canal de derechos sigue siendo correo manual (EL-EP-017).

## Pruebas de aceptación de integración (antes de habilitar)

- OpenAPI/cliente Angular coinciden y el API principal monta realmente controllers; prueba HTTP/E2E (no solo test de servicio).
- Sin sesión admin: 401; con header `x-admin-actor-id` falsificado pero sin sesión: 401; actor no autorizado/recurso ajeno: rechazo; acciones exigen reason, CSRF, idempotencia y audit del owner.
- Invitado sin aceptación versión vigente: no obtiene autorización para primera carga; versión arbitraria/obsoleta falla cerrado; rechazo no persiste consentimiento; sesión real funciona sin falsos tokens.
- Solicitud Beta nueva/repetida devuelve respuesta pública indistinguible; no revela ID, existencia ni PII; exige aviso/autorización jurídica revisados antes de activación, no solo checkbox.
- Errores, URLs, observabilidad y auditoría no exponen email, credencial, PIN, token ni fotografías; GET/list admin tiene paginación.
- Suspender/reactivar evento respeta vigencia/gracia/DELETED; notificaciones a organizador son intents verificables, delivery solo cuando se confirma proveedor.

## Pendientes y cambios controlados

- Elegir la fuente de versiones jurídicas del servidor y si `X-Guest-Session` debe evolucionar a cookie Secure/HttpOnly; preservación de contratos y análisis de seguridad antes de cualquier cambio.
- Verificar permisos actuales de admin/evento, testear operaciones y autorizar la integración por owner; cualquier ampliación requiere análisis de impacto DEC/TC/ARCH, no inferencia desde estado de la cuenta o método privado.
- Generar el OpenAPI real desde implementación, no a partir de este documento. **Sin tickets nuevos de EL-EP-017 mientras NOT_READY/Q-029 DEFERRED.**
