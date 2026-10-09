# EventLens — arquitectura de navegador

**CONFIRMED:** web mobile-first, español inicial, sin app/cuenta de invitado, WCAG 2.2 AA y últimas dos versiones mayores de navegadores acordados. Stack y contrato de consumo API aprobados en [technical-baseline.md](technical-baseline.md), EL-TD-001 y EL-TD-004. **RECOMMENDED:** una aplicación web con recorridos invitado/organizador/admin; las decisiones de rendering pendientes se evaluarán por compatibilidad y necesidades dentro del stack aprobado.

## Organización

Features alineadas con MOD-001..009 y componentes accesibles compartidos. Separar controles de cuenta/admin de experiencia pública privada de evento, sin tratar ocultamiento UI como autorización. Las pantallas consumen capacidades del servidor (canUpload/canView/canDownload/canModerate), no reconstruyen matrices de estado. Vista previa de organizador no comparte un token administrativo en QR.

## Cargas y estado

Cola de UI por archivo, progreso individual, concurrencia navegador acotada configurable, retry temporal con backoff/jitter y cancelación independiente. Intent/key estable por selección/reintento, no idempotency nueva al repetir confirmación. Multipart retoma partes verificadas consultando API; URL vencida se renueva previa autorización. Persistencia local opcional solo IDs/partes mínimos, nunca permiso ampliado ni copia de originales obligatoria. Tras cerrar navegador puede requerirse reseleccionar archivo y cotejar size/hash; no prometer continuidad automática del handle local.

La selección/MIME del navegador es ayuda UX; backend/worker validan realmente. HEIC puede mostrarse mediante preview derivado después del procesamiento. Polling corto adaptativo por lote/job mientras visible, con backoff al pasar a background; no introducir websocket/realtime inicial. Confirmación muestra recibido/procesando/pendiente/fallido según respuesta real, no éxito solo porque PUT terminó.

## Sesiones y entrega privada

Cookie segura para sesión organizador y guest contribution; el token de aportes no se expone en rutas/analítica ni habilita contenido ajeno. Enlace QR es credencial pública revocable distinta de guest session y signed media URL. Perder datos del navegador conduce a solicitud de retiro, no recuperación insegura. PL-003/004 preservan semántica de revocación/aportes según estado.

Preview/video/thumbnail solicitan autorizaciones temporales por variantes, con renovación y reintento por expiry; no almacenar signed URLs como referencias permanentes. Exports 48h es ventana funcional, con firma breve renovable mientras autorizado. Proteger referrer/caché, limpiar estado al logout/cambio de evento. Formularios con labels/focus/errores asociados, contraste/touch targets, progreso accesible y reducción de movimiento.

## Compatibilidad

Validación en Safari iOS/iPadOS y Chrome Android reales: selección múltiple, cámara/galería estándar, HEIC/MOV/MP4, red inestable, PIN, cookies, backgrounding, multipart y descarga. Desktop Chrome/Edge/Firefox/Safari cubren galería/admin/ZIP. No descargar originales por invitados; reproducción de un derivado visible implica que no se puede impedir toda copia por el receptor. Versiones y herramientas complementarias se registrarán cuando corresponda dentro del baseline aprobado, respetando decisiones DEFERRED.
