# Corpus EL-TK-061

Coloque originales neutros y permitidos sin convertirlos ni recomprimirlos:
- `physical/ios/`: iPhone 14 Pro; fotos HEIC/HEIF o JPEG y videos MOV/MP4.
- `physical/android/`: Redmi A5; fotos JPEG y videos MP4 disponibles.

Capture una escena neutra con texto/flecha visible para comprobar orientación, en vertical y horizontal. Capture video corto con sonido reconocible y otro sin audio, si el dispositivo permite producirlo. No active geolocalización para crear datos personales: el caso de metadata sensible se cubrirá posteriormente con metadata sintética. No renombre una extensión para simular un formato. HEIF no se presupone disponible por existir un iPhone.

Las muestras y fixtures generados están ignorados por Git y por Docker build. `manifest.json` define slots/expectativas versionadas; `infra/spikes/.local/media-processing/registered.json` conserva referencias privadas, checksums y observaciones reales, sin coordenadas GPS. Slots vacíos siguen pendientes. La autorización de contenido neutro es la confirmada por el usuario; el inspector no acredita jurídicamente su contenido.

Los casos adicionales de orientación, metadata, audio/sin audio, codecs, duración/límites, interrupción y resultados obsoletos permanecen pendientes hasta disponer del corpus y ejecutar el spike completo. Generar fixtures no acredita playback.

Transferir originales por cable/AirDrop/transferencia de archivos que conserve el archivo original. No usar WhatsApp ni exportación que recomprima/transcodifique. Se pueden conservar nombres originales; el catálogo público no publica sus nombres. HEIC y HEIF se registran por marcas reales de contenedor y codec; renombrar no acredita cobertura distinta.
