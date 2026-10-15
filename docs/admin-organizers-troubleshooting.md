# Troubleshooting — Gestión administrativa de organizadores Beta

Compañero de `docs/admin-organizers-runbook.md` y
`docs/admin-organizers-implementation-plan.md`. Alcance: EL-TK-239/240/241/242.

## Cómo leer los errores

La consola reexpresa el error en español para el operador y **nunca** muestra el
cuerpo crudo del servidor. La plataforma normaliza todo error a
`{ code, message, correlationId }`. El filtro global `PublicErrorFilter` deriva `code`
del estado HTTP y, además, expone mediante **allowlist** un vocabulario acotado de
códigos de dominio con mensaje público fijo (nunca el mensaje interno de la
excepción). La consola elige el mensaje por `code` cuando llega, y cae al mensaje por
estado si no.

Allowlist de códigos de dominio (`apps/api/src/platform/http/error.filter.ts`):
`EMAIL_EXISTS`, `IDEMPOTENCY_CONFLICT`, `STALE_REVISION`, `CONCURRENCY_CONFLICT`,
`INVALID_STATE`, `INVALID_ARGUMENT`, `AUTHORITY_UNAVAILABLE`. Cualquier otro `code`
del cuerpo de la excepción se colapsa al derivado del estado (sanitización intacta).

| Estado | Mensaje al operador | Qué hacer |
|--------|---------------------|-----------|
| 400 / 422 | Revisa el correo, el nombre y el motivo de la operación. | Corregir el formulario (correo válido, motivo ≤ 500). |
| 401 | Tu sesión expiró. Vuelve a ingresar como administrador. | Reingresar; se limpia la proyección privada local. |
| 403 | No se autorizó la operación… | Verificar `Origin` y CSRF / autenticación reciente; cerrar sesión y reingresar. |
| 404 | Esta cuenta ya no está disponible. | Recargar la lista. |
| 409 | Depende del `code`: correo duplicado, replay o revisión obsoleta (ver tabla siguiente). | Recargar la lista antes de continuar. |
| 503 | No se confirmó la operación. Consulta la cuenta antes de reintentar… | Seguir el runbook de ACK incierto; **no** se habilita acceso sin confirmación. |

Código de dominio → mensaje accionable (409/422/503 diferenciados):

| `code` | Mensaje al operador |
|--------|---------------------|
| `EMAIL_EXISTS` | Ya existe una cuenta con ese correo. Búscala en la lista o usa otro correo. |
| `IDEMPOTENCY_CONFLICT` | La operación ya estaba registrada con otros datos. Recarga la lista antes de reintentar. |
| `STALE_REVISION` | La cuenta cambió desde que abriste el formulario. Recarga la lista antes de continuar. |
| `CONCURRENCY_CONFLICT` | La operación entra en conflicto con un cambio concurrente. Recarga antes de continuar. |
| `INVALID_STATE` | La cuenta no permite esa operación en su estado actual. Recarga la lista. |
| `INVALID_ARGUMENT` | Revisa el correo, el nombre y el motivo de la operación. |
| `AUTHORITY_UNAVAILABLE` | No se confirmó la operación. Consulta la cuenta antes de reintentar; no se habilitará acceso sin confirmación. |


## Escenarios

### El correo "ya existe" pero no aparece en la lista

El duplicado puede pertenecer a un alta pública por invitación
(`INVITATION`) pendiente. La búsqueda cubre correo y nombre; probar con el correo
exacto. No se fabrican invitaciones ni se sobrescribe la cuenta existente.

### "La cuenta cambió desde que abriste el formulario" (revisión obsoleta)

La cuenta avanzó de revisión (otra operación administrativa, suspensión concurrente,
o un replay). Recargar la lista y repetir la acción sobre la revisión vigente. El
servidor usa comparación de revisión (CAS); nunca aplica sobre datos obsoletos.

### La operación devolvió 503 y no sé si se aplicó

Comportamiento por diseño: `PREPARE → SQL → ACK`; un ACK incierto **no** autoriza
permisos. Pasos:

1. Consultar la cuenta (detalle o lista) para ver el estado real.
2. Si la credencial ya cambió, **regenerar la contraseña temporal** de forma explícita
   para reconciliar (`CREDENTIAL_ROTATED`).
3. No reintentar a ciegas: reutilizar la misma `idempotencyKey` para un replay
   compatible (no reexpone la temporal) o iniciar una operación nueva y explícita.
4. Si el cambio inicial del organizador quedó con ACK perdido, la prueba persiste en
   `organizer_management_request` con `credential_revision`; la regeneración la
   reconcilia y `getCredentialRevision` vuelve a responder.

### La contraseña temporal no funciona

- ¿Venció? Vence a los **siete días** desde su emisión o última regeneración
  (`temporary_password_expires_at`). Regenerar.
- ¿La cuenta está `SUSPENDED`? Regenerar **no** habilita acceso; primero habilitar.
- ¿Se entregó correctamente? Solo se muestra **una vez**; si no se guardó, regenerar.
- Los detalles, listados, registros y el almacenamiento del navegador nunca contienen
  la contraseña; no buscarla ahí.

### No puedo regenerar la contraseña temporal

La opción solo aparece para cuentas `ADMIN_PROVISIONED` en `ACTIVE`/`SUSPENDED`. Para
altas por invitación (`INVITATION`) esa operación no aplica y devuelve
`INVALID_STATE`.

### Replay: se repitió la operación

Un replay con el mismo actor y payload devuelve el mismo resultado pero la
contraseña temporal se muestra como `null`. La UI avisa: "La operación ya estaba
registrada… genera una nueva contraseña temporal desde la cuenta". El replay **nunca**
reexpone la temporal original.

### El diálogo se cerró y perdí la credencial temporal

Comportamiento de seguridad: el diálogo se cierra y limpia el secreto al pulsarlo o
tras un minuto. Si no se guardó, regenerar la contraseña temporal desde la cuenta.

### La consola muestra "El acceso administrativo no está disponible"

La sesión no pudo revalidarse (autoridad/transporte indisponible) o expiró. La UI no
expone datos privados en ese estado. Reintentar; si persiste, cerrar sesión y
reingresar por `/admin/ingresar`. Con `logoutUncertainty` activo, usar
**Reintentar cierre de sesión**.

## Verificación

- Typecheck: `pnpm --filter @eventlens/web typecheck`, `pnpm --filter @eventlens/e2e typecheck`.
- Unit: `pnpm --filter @eventlens/web test`.
- Build: `pnpm --filter @eventlens/web build`.
- E2E (requiere stack y, para el flujo autenticado, credenciales de bootstrap):
  `pnpm test:e2e` con `EVENTLENS_E2E_ADMIN_IDENTIFIER` y `EVENTLENS_E2E_ADMIN_SECRET`.
