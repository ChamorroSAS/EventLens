# EL-EP-017 — Revisión técnica de brechas para el expediente jurídico

**Fecha:** 2026-10-12 · **Rama examinada:** `stage` · **Contexto:** PR #237.  
**Resultado:** DOCUMENT_REVIEW_WITH_TECHNICAL_GAPS; **sin ejecución de tests ni inspección de infraestructura desplegada**. No es dictamen jurídico, no autoriza captación Beta ni apertura pública.

## Evidencias verificadas en el código

| ID | Prioridad | Evidencia verificable | Brecha / acción requerida |
|---|---|---|---|
| TG-01 | P0 — gate integral | `apps/api/src/app.module.ts` registra únicamente `HealthController`; `contracts/openapi.json` expone solo `/api/v1/health/live` y `ready`; `README.md` informa baseline API/Angular. | Servicios de dominio no equivalen a endpoints operativos. Mapear composición, rutas, auth, E2E de cada flujo antes de activar usuarios reales. No atribuir la integración total a EL-EP-017. |
| TG-02 | P0 — autorización guest | `packages/event-management/src/guest-session.ts` `recordConsent/checkConsent` persiste versión, timestamp y `guest_consent_record`, pero `apps/web/src/app/guest/guest-container.component.ts` pasa versión fija `v1.0`; `onConsentAccepted` invoca solo `GuestService.recordConsent` de estado Angular local. | Conectar operación a backend con documento/versión jurídicamente aprobados, mostrar aviso accesible, asegurar evidencia verificable y pruebas de rechazo/reaceptación; no confundir la prueba de un click con autorización de retratados. |
| TG-03 | P0 — minimización Beta | `packages/identity/src/access-request.ts` `requestAccess` registra `email_normalized` en `admin_audit_event.target_identifier`, además de email en `beta_access_request`; consulta/listado registran también `target_identifier` de email. | Revisar necesidad, acceso y plazo de correo en auditoría. Evitar copias redundantes, diseñar anonimización/retención 6 meses **solo** para solicitantes Beta sin invitación y probar ausencia de datos residuales. No borrar sin reconciliar auditoría/obligaciones. |
| TG-04 | P0 — datos y consentimiento Beta | `packages/identity/src/access-request.ts` implementa solicitud, deduplicación y consulta admin; no se identificó en este servicio operación de supresión/expiración de registros ni evidencia jurídica del aviso/autoridad. | Verificar integraciones externas antes de afirmar inexistencia global; preparar diseño/ticket de minimización, consentimiento y lifecycle solo con análisis de dependencia y legal. |
| TG-05 | P1 — restricciones guest | `packages/event-management/src/guest-session.ts` tiene `revokeGuestSession(sessionId)`; `packages/admin-support/src/contracts.ts` solo expone para admin `revokeAllGuestSessions(eventId)`; orquestador `REVOKE_GUEST_ACCESS` llama a revocación total. | Hay primitiva selectiva en dominio, pero **no se acreditó autoridad administrativa ni ruta de revocación individual**. Una nueva operación requiere examen de permisos, auditabilidad y side effects, sin inferirla de DEC-083. |
| TG-06 | P1 — cuentas y sanciones | `packages/identity/src/contracts.ts` permite estado `OrganizerAccountRecord.status = SUSPENDED`; `organizer-auth.ts` no admite sesiones ordinarias para cuentas inactivas; `admin-support/src/admin-intervention.ts` contempla suspensión de **eventos**, no un comando confirmado para suspender cuentas. | Estado de datos != procedimiento administrativo de suspensión de cuenta. Evaluar permisos, causa, reversión, notificación y coexistencia con eliminación de EL-EP-015 antes de tickets. |
| TG-07 | P1 — avisos | `packages/notifications/src/account-event-notice-service.ts` puede crear intención `EVENT_SUSPENDED` y suprimir aviso por seguridad/legal. `email-notification-service.ts` implementa encolado/envío mediante puertos, pero API arranca solo HealthController. | No declarar correo enviado ni notificación integrada con el lifecycle; verificar composición de facts, destinatarios, rutas reales de soporte, worker, templates, proveedor y pruebas. |
| TG-08 | P1 — experiencia guest | `apps/web/src/app/guest/guest-container.component.ts` genera `session-local-1` y token `'token-'+Date.now()` en `onPinSubmitted`; `consent-sheet.component.ts` muestra resumen estático, sin enlace visible a PTI aprobada. | Comportamiento de demostración, no sesión guest segura desplegable. No habilitar recogida o subida real sin integrar la sesión emitida por backend, ACL y avisos. |

## Correspondencia y responsables sugeridos

- **Néstor:** TG-01 (integración/guardrails), TG-05/06 (permisos y reglas de dominio), revisión de redundancia PII TG-03.
- **Juan:** TG-03/04 (solicitud Beta, auditoría, supresión y pruebas con PostgreSQL); coordinación con Néstor por seguridad y migraciones.
- **Cristian:** TG-02/08 (UX de consentimiento y guest), TG-07 (panel/notificación) solo tras contrato API validado.
- **Asesor jurídico:** identidad y canal publicables, fundamento/evidencia de consentimiento, legitimidad para fotografías de terceros/menores, retención/hold, medidas sancionatorias; Q-029 permanece pendiente.

## Condiciones de aceptación sugeridas para posteriores tickets

1. Operación versionada de aceptación almacenada en backend; checkbox no premarcado, contenido y finalidad asociados a versión aprobada; consentimiento de uploader diferenciado del de terceros.
2. API pública de solicitud Beta neutra, sin enumeración, con evidencia jurídicamente adecuada y eliminación verificable de registros una vez vencida la política aprobada; auditoría no mantiene el email sin plazo.
3. Revocación selectiva solo con autoridad aprobada y pruebas que no afecten otras sesiones; conservar vías de derechos sin cuenta.
4. Suspensión administrativa, revisión, notificación, reactivación y purga siguen DEC-078/081/088/089/092 y las épicas propietarias, sin nuevos privilegios implícitos.
5. Pruebas de integración HTTP+DB+UI/worker y validación de código en rama objetivo antes de afirmar implementación. Este análisis **no ejecutó** esas pruebas.

## Gates inalterados

`EL-EP-017: NOT_READY` · `Q-029: DEFERRED` · `DEC-031: PROFESSIONAL_REVIEW_PENDING` · `PUBLIC_SERVICE_OPENING: BLOCKED` · `BETA_FORM_PUBLIC_COLLECTION: BLOCKED` · `DEC/TC/ARCH: UNCHANGED`.

Las rutas citadas son evidencia de fuente leída en `stage`, no certificación de runtime ni aprobación legal.
