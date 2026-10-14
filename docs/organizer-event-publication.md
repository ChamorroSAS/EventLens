# Publicación manual de eventos

Guardar una fecha en **Programación** configura los datos del evento, pero lo deja en estado `DRAFT`. Para publicarlo, abre **Configurar evento → Ciclo de vida**.

1. Elige **Programar evento** y confirma. La programación conserva las duraciones efectivas que devuelve el servidor; si no se configuraron otras, los valores predeterminados son 30 días de vigencia y 7 días de gracia.
2. Cuando quieras habilitar el evento, elige **Activar ahora** y confirma. El estado pasa de `SCHEDULED` a `ACTIVE`; se conservan las fechas de expiración y gracia calculadas al programarlo.

La transición requiere acción manual: el servicio de ejecución automática de la programación todavía no está disponible. Si cierras la página antes de activar, vuelve a **Ciclo de vida** y revisa el estado para continuar. La activación del evento tampoco habilita por sí sola las subidas de fotos ni la galería. La configuración operativa de esas opciones no forma parte de esta corrección.

## Cambiar la fecha de inicio

En **Programación** puedes editar y guardar la fecha y hora local mientras el evento está en `DRAFT` o `SCHEDULED` y nunca se ha activado. Si está `SCHEDULED`, conserva ese estado y el mismo acceso/QR; se vuelven a calcular las fechas de expiración y gracia usando las duraciones efectivas existentes. La edición no programa ni activa el evento por sí sola. Después de la primera activación, ya no se puede cambiar la fecha mediante esta opción.

Si otra sesión actualiza el evento antes de guardar, la interfaz informa el conflicto y permite recargar la última revisión. Recarga los datos y vuelve a comparar la fecha confirmada antes de continuar; así se descarta el aviso obsoleto y se actualiza el formulario. Si una solicitud termina con tiempo de espera, el formulario conserva esa propuesta para permitir un reintento explícito con la misma intención y clave de idempotencia. No reintenta ni modifica el evento automáticamente.

## Acceso de invitados y código QR

En **Configurar evento → Acceso y PIN**, los eventos `SCHEDULED` y `ACTIVE` permiten crear un QR cuando todavía no existe, o descargar el SVG y copiar el enlace cuando ya existe. La activación conserva el mismo acceso; la interfaz no genera un QR nuevo al cambiar el estado. Los invitados de un evento programado siguen restringidos hasta que el organizador lo active manualmente.

El enlace del QR usa `PUBLIC_ENTRY_BASE_URL`, que es independiente de `WEB_ORIGIN`. Compose la toma de `.env`; en desarrollo local usa `http://localhost:4200`. Para usar un dominio público, configura, por ejemplo, `PUBLIC_ENTRY_BASE_URL=https://eventos.tudominio.com`, y recrea únicamente el servicio API:

```sh
docker compose up -d --no-deps --force-recreate api
```

Después, vuelve a **Consultar QR** o descarga de nuevo el SVG antes de imprimirlo. Esta variable solo define la base del enlace: el dominio debe servir la aplicación. Un QR impreso conserva la base que tenía al generarse; si cambia, actualiza el enlace y vuelve a imprimir el código.

La migración de `pin_hash` y `pin_salt` es aditiva para los esquemas existentes. No se deben registrar secretos de `.env` en logs ni documentación.

## API

Las operaciones de organizador son:

- `GET events/{id}/lifecycle`: consulta el estado y las duraciones efectivas.
- `POST events/{id}/lifecycle/schedule`: programa un borrador.
- `POST events/{id}/lifecycle/activate`: activa un evento programado.
- `GET events/{id}/share-access`: consulta el enlace y QR vigentes.
- `POST events/{id}/share-access`: prepara el acceso inicial conservando cualquier credencial vigente.

Las operaciones `POST` requieren `expectedRevision` en el cuerpo e `Idempotency-Key`. Se autorizan con la sesión del organizador propietario y las protecciones de `Origin` y CSRF. Ante un conflicto de concurrencia, recarga la última revisión, compara la fecha confirmada y vuelve a decidir. Si el resultado de una operación queda incierto, consulta el estado antes de continuar; cualquier reintento debe conservar la misma intención y clave de idempotencia. Los errores de estado (por ejemplo, un evento que ya fue activado) se informan como tales y no como conflictos de concurrencia. No se reejecutan operaciones automáticamente.
