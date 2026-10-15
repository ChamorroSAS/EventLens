# Gestión administrativa de organizadores Beta

Fecha: 2026-10-14. Cambio localizado MOD-001/onboarding/consola. UI_REQUIRED: YES:
nuevo listado, formularios, navegación y cambio inicial obligatorio de contraseña.

## Decisiones y alcance

- CONFIRMED por el usuario: crear cuentas desde la consola con contraseña temporal;
  ingreso inmediato; cambio obligatorio antes de gestionar eventos; deshabilitar
  acceso conservando cuenta y eventos como operación de eliminación del CRUD.
- RECOMMENDED y adoptado para esta implementación: nombre opcional editable, correo
  de ingreso inmutable, razones obligatorias, revisión esperada para editar acceso,
  temporal aleatoria que vence en siete días y regeneración administrativa explícita.
- Preservar alta pública por invitación. No fabricar invitación consumida, correo
  verificado ni declaración adulta. El organizador declara adultez durante el cambio.
- Sin borrado de datos ni cambio de lifecycle de los eventos, sin elevación pública,
  sin entrega de correos ni selección de proveedor SMTP.

## Contrato arquitectónico aceptado

Baseline EL-TD-001..007 vigente: Angular/NestJS/PostgreSQL/Prisma interno/REST OpenAPI
y cliente generado. Identity posee cuentas, credenciales, sesiones y el servicio de
gestión; HTTP obtiene admin únicamente de sesión servidor, Origin/CSRF y audit.

Migración aditiva: procedencia INVITATION/ADMIN_PROVISIONED, invitation_id nullable
con constraint de procedencia, display_name, password_change_required, revisión
administrativa y vencimiento temporal. ACTIVE↔SUSPENDED mantiene obligación de
cambio; nunca reactivar REVOKED/PENDING_DELETION/DELETED ni pendientes públicos.

Nuevas cuentas comparten autoridad durable administrativa. PREPARE→SQL→ACK para
crear/editar acceso/cambiar contraseña, usando CREDENTIAL_ROTATED para mantener
revisiones vigentes. ACK incierto no habilita permisos. Contraseñas Argon2id; texto
plano únicamente en respuesta inicial o regeneración autorizada, no listados,
detalles, registros o almacenamiento del navegador. Comandos idempotentes con
binding actor/payload y revisiones esperadas; replay no reexpone una temporal.

PASSWORD_CHANGE_REQUIRED/PASSWORD_CHANGE_ONLY: sesión permite consultar su estado,
cambiar contraseña y salir. Backend bloquea todas las acciones ordinarias. Cambio
exige temporal actual, contraseña distinta válida, declaración adulta, Origin y
CSRF. Revoca todas las sesiones y requiere reingreso con nueva contraseña; no
declara verificación de correo. Suspensión/reactivación revoca sesiones y avanza
revisión sin borrar los eventos. Editar nombre no modifica identidad de ingreso.

## Handoff UI incorporado

/admin/organizadores: navegación Eventos/Organizadores, listado paginado con
búsqueda, correo/nombre/estado/cambio pendiente y Crear organizador. Formulario
email, nombre opcional y motivo; temporal presentada una vez con vencimiento,
copiado opcional y aviso de custodia. Cerrar limpia el secreto. Gestión muestra
email de solo lectura, nombre editable, motivo y habilitar/deshabilitar con
confirmación que explica conservación de eventos. Regenerar temporal exige
confirmación y no habilita una cuenta suspendida.

/cambiar-contrasena: temporal actual, nueva, confirmación y declaración adulta;
aviso de acceso limitado; salir disponible. Tras éxito volver a ingresar.
Cubrir carga, vacío, error/reintento, duplicado, revisión obsoleta, sesión expirada,
falta de permisos, temporal vencida, resultado incierto y autoridad indisponible.
Sin reintento automático de mutaciones inciertas. Etiquetas/errores asociados,
foco visible y restaurado, diálogo con foco contenido, teclado/Escape fuera de
envío, tarjetas móviles y tabla adaptable, Manrope/tokens vigentes. Secretos fuera
de URLs/logs/storage/analytics. No modificar branding ni tokens.

## Gates y ejecución

Requisitos de este alcance completos; sin nueva autoridad de borrado. Arquitectura
incorporada desde handoff del architect; UI diseñada incorporada y dependencia de
contrato restringido resuelta por este documento. Revisar UI YES antes de frontend.

1. Identidad/API: schema aditivo, CRUD/control de acceso, cambio inicial/restricción,
   authority común para cuentas administrativas y OpenAPI explícito.
2. Frontend: sección administrativa y onboarding obligatorio sobre cliente generado.
3. Validación: typecheck completo, PostgreSQL aislado, autorización/CSRF/concurrencia,
   temporal restringida, conservación de eventos, expiración/replay y Chromium.
4. Revisión independiente y documentación/evidencia final. No publicar ni desplegar
   Beta pública por esta implementación; sus gates existentes siguen vigentes.

## Gap Resolution Log (EL-TK-242)

Cierre de brechas entre este plan y la implementación EL-TK-239/240/241. Ticket:
`.codex/product/tickets/EL-TK-242.md`.

- **Ya cubierto por la implementación (verificado, no reimplementado).** `Manrope`/
  tokens vigentes; tarjetas móviles (`@media (max-width: 639px)` con `data-label`) y
  tabla adaptable; touch targets ≥44px (`min-height: 2.75rem`); `<dialog>` con foco
  contenido y Escape fuera de envío (interceptado en `cancelDialog`); aislamiento
  PostgreSQL vía `IsolatedTestTransactions`; gate UI satisfecho por EL-TK-241
  (`READY_FOR_FRONTEND_PLANNING: YES`).
- **Resuelto en EL-TK-242.** `aria-describedby`/`aria-invalid` en todos los campos de
  `/admin/organizadores` y `/cambiar-contrasena`; mensajes accionables distinguidos por
  estado (400/422 vs 401 vs 403 vs 404 vs 409 vs 503); docs operativas
  (`admin-organizers-runbook.md`, `admin-organizers-troubleshooting.md`); E2E Playwright
  Chromium + mobile viewport; typecheck/build/tests limpios; `novalidate` en el cambio
  de contraseña para que la validación accesible del cliente sea alcanzable.
- **Resuelto (BLOCKER-1, EL-TK-242).** Diferenciación por **código de dominio** dentro
  del 409/422/503: `PublicErrorFilter` ahora expone una **allowlist** explícita
  código→mensaje público fijo (`EMAIL_EXISTS`, `IDEMPOTENCY_CONFLICT`, `STALE_REVISION`,
  `CONCURRENCY_CONFLICT`, `INVALID_STATE`, `INVALID_ARGUMENT`, `AUTHORITY_UNAVAILABLE`),
  sin usar nunca el mensaje interno de la excepción. El resto conserva el `code`
  derivado del estado, así que `UNTRUSTED_CODE` sigue saneado. Decisión opción 1
  (allowlist global) confirmada por el usuario; evidencia en `errors.test.ts` (18 casos).
  Detalle en `.codex/product/tickets/EL-TK-242.md`.
- **Deuda de ejecución.** La auditoría manual con lector de pantalla y la corrida real
  de los E2E no son verificables en el entorno local (requieren stack aislado +
  PostgreSQL de pruebas y un principal administrativo bootstrapped, hoy POSIX-only).
  El flujo E2E autenticado queda `skip` sin `EVENTLENS_E2E_ADMIN_IDENTIFIER`/
  `EVENTLENS_E2E_ADMIN_SECRET`.
