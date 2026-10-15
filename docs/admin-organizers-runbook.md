# Runbook — Gestión administrativa de organizadores Beta

Referencia funcional: `docs/admin-organizers-implementation-plan.md`.
Alcance: EL-TK-239/240/241/242 sobre el baseline EL-TD-001..007.

## Superficies

| Superficie | Ruta | Guardia |
|------------|------|---------|
| Consola de organizadores | `/admin/organizadores` | `adminSessionGuard` |
| Consola de eventos (referencia de navegación) | `/admin/eventos` | `adminSessionGuard` |
| Cambio obligatorio de contraseña | `/cambiar-contrasena` | sesión `PASSWORD_CHANGE_REQUIRED` |

API (`contracts/openapi.json`):

| Operación | Método y ruta |
|-----------|----------------|
| Listar | `GET /api/v1/admin/organizers?search=&limit=&offset=` |
| Detalle | `GET /api/v1/admin/organizers/{accountId}` |
| Crear | `POST /api/v1/admin/organizers` |
| Editar nombre | `PATCH /api/v1/admin/organizers/{accountId}` |
| Deshabilitar | `POST /api/v1/admin/organizers/{accountId}/disable` |
| Habilitar | `POST /api/v1/admin/organizers/{accountId}/enable` |
| Regenerar temporal | `POST /api/v1/admin/organizers/{accountId}/temporary-password` |

## Autorización de transporte

Toda mutación exige simultáneamente:

1. Cookie de sesión administrativa del host (nunca un actor enviado por el cliente).
2. `Origin` igual a `webOrigin` configurado.
3. `X-CSRF-Token` ligado a la sesión (comparación en tiempo constante).
4. Autenticación reciente (`assertFreshAuthentication`).

La UI nunca es autoridad: cada lectura y mutación revalida contra el servidor. Las
respuestas usan `Cache-Control: no-store`.

## Procedimientos

### Crear un organizador

1. `/admin/organizadores` → **Crear organizador**.
2. Correo (obligatorio, único), nombre (opcional), motivo (obligatorio).
3. **Crear cuenta**. Se muestra la contraseña temporal **una sola vez** con su
   vencimiento a siete días.
4. Entregar la credencial por un canal seguro y pulsar **Ya guardé la credencial**.
   El diálogo se cierra y limpia el secreto tras un minuto.

La cuenta nace `ADMIN_PROVISIONED`, `password_change_required = true`, con
`invitation_id` nulo y sin verificación de correo ni declaración adulta fabricadas.
El organizador declara adultez durante el cambio obligatorio.

### Editar el nombre

**Gestionar cuenta** → editar **Nombre (opcional)** → **Guardar nombre**. El correo
de ingreso es inmutable y se muestra de solo lectura; no cambia la identidad.

### Deshabilitar / habilitar acceso

1. **Gestionar cuenta** → **Deshabilitar acceso** → confirmar (o **Habilitar acceso**).
2. La confirmación explica que los eventos se conservan.

Deshabilitar pasa la cuenta a `SUSPENDED` y revoca sus sesiones; no borra datos ni
cambia el lifecycle de los eventos. Habilitar vuelve a `ACTIVE` **sin** omitir el
cambio de contraseña pendiente. Nunca se reactivan cuentas `REVOKED`,
`PENDING_DELETION`, `DELETED` ni altas públicas pendientes.

### Regenerar la contraseña temporal

Solo disponible para cuentas `ADMIN_PROVISIONED` en estado `ACTIVE`/`SUSPENDED`.
**Gestionar cuenta** → **Generar nueva contraseña temporal** → confirmar. Regenerar
**no** habilita una cuenta suspendida; solo repone la credencial y reinicia el
vencimiento. La contraseña anterior deja de funcionar y todas las sesiones se cierran.

### Cambio obligatorio del organizador

El organizador ingresa con la temporal → `/cambiar-contrasena`. El cambio exige
temporal actual, nueva contraseña distinta y válida, declaración adulta, `Origin` y
CSRF. Al confirmar se revoca la temporal y **todas** las sesiones, y se exige
reingreso. No se declara verificación de correo.

## Recuperación de un ACK incierto (autoridad durable)

El flujo es `PREPARE → SQL → ACK`. Si el `ACK` no se confirma (503), la operación
queda cerrada: **no habilita permisos**. Procedimiento:

1. Verificar el estado real de la cuenta (`GET` del detalle o la lista).
2. Si la credencial ya es la nueva pero el ACK se perdió, **regenerar la contraseña
   temporal** de forma explícita para reconciliar la autoridad
   (`CREDENTIAL_ROTATED` con revisión vigente).
3. Si el cambio inicial de contraseña quedó con ACK perdido, la prueba persiste en
   `organizer_management_request`; la regeneración administrativa la reconcilia.
4. No reintentar a ciegas: cada comando usa `idempotencyKey`; un replay compatible
   no reexpone la temporal.

## Idempotencia y revisión

- Cada mutación envía `idempotencyKey` (UUID) y `reason` (1–500 caracteres).
- Las acciones de estado envían `expectedRevision`; un conflicto devuelve error de
  revisión y no modifica nada (CAS).
- Replay con el mismo actor y payload devuelve el mismo resultado sin mostrar la
  contraseña temporal; replay con payload distinto devuelve conflicto de idempotencia.

## Registro de auditoría

Cada operación registra un `admin_audit_event` con `procedure`
(`ADMIN_ORGANIZER_CREATE|UPDATE|DISABLE|ENABLE|RESET_TEMPORARY_PASSWORD`) e IDs. La
auditoría **no** incluye correo ni contraseña.
