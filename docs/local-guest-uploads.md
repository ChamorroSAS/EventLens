# Cargas reales de invitados en desarrollo

El entorno Compose recibe archivos reales en MinIO privado sobre el volumen persistente `objects-data`. PostgreSQL conserva autorización, reserva e identidad del objeto recibido. Este receptor no selecciona el almacenamiento de la Beta en AWS ni modifica CR-011.

## Uso

1. Organizador: Mis eventos → Configurar evento → Invitados y Aportes → Permitir subir fotos y videos → Guardar permisos. El evento debe estar activo y vigente.
2. Invitado: abrir el enlace/QR, completar PIN cuando corresponda, consentimiento y nombre/apodo.
3. Subir fotos y videos → elegir archivos → Cargar archivos. El progreso corresponde a bytes transferidos; los archivos inválidos se indican individualmente.
4. La confirmación dice **Transferido; validación pendiente**. Mis aportes se consulta al servidor; una respuesta perdida se reintenta con el mismo intento, sin reenviar bytes cuando la transferencia ya terminó.

La recepción técnica termina en `CONFIRMING`. No significa original aceptado, escaneo terminado ni publicación. La galería HTTP y el pipeline de validación/publicación mantienen su seguimiento pendiente. Deshabilitar las subidas puede cancelar este estado conforme a la política vigente; el cliente respeta la cancelación del snapshot autorizado.

## Configuración local

Compose habilita `LOCAL_MEDIA_UPLOAD_ENABLED` en desarrollo y pasa las credenciales locales de MinIO desde el entorno. `.env.example` documenta las variables; no versionar `.env` ni sus secretos. Fuera de Compose, habilitar explícitamente el receptor y configurar un endpoint MinIO local admitido. No se admite habilitarlo en `NODE_ENV=production`.

`media-init` prepara un bucket privado con versioning antes del arranque de la API. Una política de bucket inesperada hace fallar la inicialización para revisión; no se reemplaza silenciosamente. Los POST del navegador usan `/storage/{bucket}` en el mismo origen web: no necesitan resolver `minio:9000` desde el teléfono. Ese proxy permite únicamente POST al bucket configurado; deniega lectura/listado y rutas de otros buckets. La firma limita el key temporal, MIME declarado, bytes exactos y plazo.

Para pruebas en teléfonos, `PUBLIC_ENTRY_BASE_URL` debe apuntar al origen accesible del frontend y `WEB_BIND` permitir la LAN, conforme a `.env.example`. No utilizar `localhost` en tarjetas destinadas a otros dispositivos. No se han acreditado pruebas en los teléfonos físicos en esta entrega.

## Integridad y persistencia

Cada selección tiene una clave estable y un intento UUID aleatorio. El navegador sólo escribe staging. La API lee una versión concreta, calcula SHA-256 real y sella esa versión en un destino privado. Tras IO, revalida cuenta, evento, credencial, sesión, intento, plazo y reserva en una transacción corta; registra versión/hash/bytes y `CONFIRMING` atómicamente.

Los reintentos no duplican reserva ni recibo. Sobrescribir staging con un grant anterior no cambia la versión sellada que referencia el recibo. El original y sus versiones sobreviven a recrear contenedores mientras se conserven los volúmenes. La reserva continúa activa hasta la aceptación futura; no se simula su liquidación ni la creación de media/jobs.

Un fallo o cancelación después del IO puede dejar versiones privadas huérfanas. La limpieza física, el drenaje de escritores y la recuperación requieren su integración posterior; no se borran objetos basándose sólo en un timeout o una lectura SQL anterior y no se afirma purga física.

## Evidencia reproducible

- `scripts/validate-local-upload.mjs`: ejecutado en imagen workspace y red `eventlens-isolated-tests_default`, con `EVENTLENS_TEST_ADMIN_URL` del servidor aislado; crea y elimina su base temporal mediante el guard. Pruebas HTTP con MinIO real en `test-minio`, bucket aleatorio y sin datos del evento local.
- `scripts/validate-local-media-proxy.mjs`: POST firmado real por Angular, Host alternativo, bytes idénticos y versión real; lectura/listado denegados. Usa almacenamiento desechable de prueba, no el volumen local.
- `node --test apps/web/test/local-media-proxy.test.mjs`: restricción de métodos, bucket y rutas del proxy.

Trazabilidad: EL-TK-265, dependencia funcional EL-TK-263/264 y EL-EP-005. Las pruebas de receptor no certifican publicación ni recuperación de producción.
