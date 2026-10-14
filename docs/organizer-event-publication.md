# Publicación manual de eventos

Guardar una fecha en **Programación** configura los datos del evento, pero lo deja en estado `DRAFT`. Para publicar un borrador, abre **Configurar evento → Ciclo de vida**.

1. Elige **Programar evento** y confirma. La programación conserva las duraciones efectivas que devuelve el servidor; si no se configuraron otras, los valores predeterminados son 30 días de vigencia y 7 días de gracia.
2. Cuando quieras habilitar el evento, elige **Activar ahora** y confirma. El estado pasa de `SCHEDULED` a `ACTIVE`; se conservan las fechas de expiración y gracia calculadas al programarlo.

La transición requiere acción manual: el servicio de ejecución automática de la programación todavía no está disponible. Si cierras la página antes de activar, vuelve a **Ciclo de vida** y revisa el estado para continuar. La activación del evento tampoco habilita por sí sola las subidas de fotos ni la galería. La configuración operativa de esas opciones no forma parte de esta corrección.

## API

Las operaciones de organizador son:

- `GET events/{id}/lifecycle`: consulta el estado y las duraciones efectivas.
- `POST events/{id}/lifecycle/schedule`: programa un borrador.
- `POST events/{id}/lifecycle/activate`: activa un evento programado.

Las dos operaciones `POST` requieren `expectedRevision` en el cuerpo e `Idempotency-Key`. Se autorizan con la sesión del organizador propietario y las protecciones de `Origin` y CSRF. Ante `409`, actualiza el estado y vuelve a decidir. Si el resultado de una operación queda incierto, consulta el estado antes de continuar; cualquier reintento debe conservar la misma intención y clave de idempotencia. No se reejecutan transiciones automáticamente.
