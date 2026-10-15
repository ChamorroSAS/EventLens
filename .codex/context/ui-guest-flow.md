1. Entrada al evento
2. Consentimiento
3. Identificación del invitado
4. Selección de archivos
5. Progreso de carga
6. Carga completada
7. Galería opcional

## Correctivo focal EL-TK-263 — 2026-10-14

UI_REQUIRED YES; gate ui_designer APPROVED y READY_FOR_FRONTEND_PLANNING YES para información auténtica/menú/apodo/selección sin simulaciones. No acredita transporte o consentimiento jurídico versionado completo.

Landing usa nombre/fecha TZ/bienvenida autorizados, sin ciudad/portada ficticias. Subir visible en menú/CTA con motivo cuando no permitido; aviso de subida aún no disponible antes de solicitar consentimiento/apodo. Primer aporte conserva consentimiento → apodo → selección vacía. Editar/completar apodo desde sesión vuelve al origen tras éxito/cancelar; sin cuenta ni correo. Selector local conserva archivos elegidos, anuncia que no se han enviado y no habilita transferencia ni éxitos ficticios mientras el transporte real esté pendiente. Checkbox sin preselección, errores visibles/guard de pasos, menú Escape/expanded/foco y previews liberados al salir/cambiar evento. No nuevos tokens/componentes ni cambios a permisos PIN/HttpOnly.

## Recepción privada operativa — EL-TK-265

CONFIRMED en implementación local: selección → Cargar archivos explícito → POST real con progreso medido → confirmación idempotente → «Transferido; validación pendiente» (`CONFIRMING`). Mis aportes se actualiza con snapshot autorizado. Reintentar una confirmación incierta conserva el intento sin retransmitir bytes. Cambiar evento/sesión o salir cancela operaciones locales y descarta respuestas anteriores. El estado técnico sigue cancelable por policy; no acredita aceptación/publicación. Ver `docs/local-guest-uploads.md` y EL-TK-265. MinIO es exclusivo de desarrollo; almacenamiento Beta y pipeline conservan sus gates pendientes.
