# EL-TK-265 — Transferencia real privada de archivos guest

Parent: EL-EP-005; continuación focal de EL-TK-263/264 y revisión del presign nuevo. Estado: DONE para el alcance de recepción técnica privada.
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para recepción privada, no publicación.
UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. Gate focal de ui_designer aprobado para CONFIRMING.

## Objetivo y alcance CONFIRMED

El invitado con sesión vigente, consentimiento y apodo selecciona archivos, pulsa Cargar archivos, transfiere bytes reales y obtiene un registro durable propio. El usuario autoriza cerrar los bloqueantes de la revisión. Reutilizar MinIO development aprobado en EL-TD-008; no AWS, no aprobar CR-011/EL-TK-251 ni introducir dependencia S3 para Beta. Estado final focal CONFIRMING: «Transferido; validación pendiente». Procesamiento, MediaAcceptance, galería y publicación siguen sujetos a sus contratos y autoridad de recuperación; no simulaciones.

## Arquitectura focal aprobada

Architect: READY_FOR_IMPLEMENTATION YES para transporte. Nuevo comando de event-management conserva las fronteras legacy: API observa storage fuera SQL, dominio recibe hechos internos y revalida policy bajo transacción. Scoped cookie HttpOnly y Origin, owner por guest/event, generación QR vigente, cuenta/evento, consentimiento/apodo, TTL y capacidad; locks cuenta → evento → credencial pública → sesión guest → intento → reserva. Descubrimiento inicial sin locks sólo es hint; owner y contexto se revalidan después de bloquear cuenta y evento. Este orden evita inversión con lifecycle/PIN/deletion existentes. Autorización idempotente por selección estable, intento UUID aleatorio y staging fijo sin nombre/hash cliente. POST firma tamaño exacto y MIME permitido; MinIO privado con versioning obligatorio. Proxy same-origin limitado a POST/bucket, sin listar ni leer objetos. SHA cliente opcional no prueba de integridad.

Confirm: GET de versión exacta con límite y SHA-256 real → Copy exact version a sello privado sin grant browser → identidad de versión original real → transacción corta de revalidación, recibo durable e intento CONFIRMING. No IO de storage dentro SQL. Receipts conservan source/sealed version, checksum, bytes y timestamps; no estado recibido a partir de HEAD vacío ni cliente. Unknown no equivale a ausencia o éxito. Retry reconcilia la identidad; no hash como deduplicación global. Ningún journal/RecoveryAuthority sustituido.

## Criterios de aceptación

1. API arranca, endpoints estrictos y cliente OpenAPI generado coinciden. Sin debug throw/logs/session storage.
2. Sin consentimiento/apodo, revocación, QR rotado, owner distinto, evento/cuenta no elegibles, falta de cuota o expiración: denegar. Clave estable no duplica intent/reserva; payload distinto conflicto.
3. Bytes exactos con storage real, versión y hash observado; recepción sobreviviente al ciclo de contenedores y reload de Mis aportes. Grants no escriben originales ni otro intento. Replay no altera receipt ni contabiliza dos veces.
4. Cierre/disable/revoke concurrente impide nueva confirmación; no reset de estados finales a UPLOADING. Original no modificable por reutilizar POST staging. Compensación/reconciliación no borra sello de otro confirmador. Reserva no se declara liberada por purge física inexistente.
5. Selección → resumen → Cargar, progreso XHR real, resultado por archivo, retry exacto e incertidumbre sin éxito inventado. Guardas en cambio evento/sesión/destroy y cancelación; nunca «Listo en galería».

## Plan y ownership

### Handoff UI incorporado

Conservar selección nativa/cámara y previews, sin autostart: resumen → Cargar archivos. Límites contractuales foto 25 MB, vídeo 500 MB; HEIC/HEIF incluidos, sin validación final inventada. Estados individuales cola/autorizar/subir/confirmar/transferido pendiente/rechazo/cancelación. Progreso sólo bytes XHR medidos. Retry conserva intento, comando y fase; si confirmación incierta, no retransmitir archivo. ACK CONFIRMING muestra «Transferido; validación pendiente», permanece cancelable por policy y no promete publicación. Mis aportes y conteos sólo con snapshot autorizado; error de refresh se muestra sin deshacer receipt ni añadir conteos. Abortar/despreciar callbacks en salida/cambio evento/sesión/generación. Quitar sólo antes de enviar; sin nuevo botón de cancelación. Targets 44px, labels/errors asociados, focus visible, live regions por fase, sin URL/keys/errores internos en UI. Sin nuevos componentes/tokens/pantallas; galería permanece fuera del alcance.

Backend/domain: adaptador MinIO, presign/confirm focal, schema/migración aditiva de receipt, pruebas. Root: configuración development opt-in, inicialización privada/versioning, Compose/proxy same-origin, contrato generado y validación real aislada. Frontend tras gate: contenedor, orchestrator, guest y pruebas dirigidas. Preservar cambios preexistentes y scripts ajenos; no commits ni push solicitados para este alcance.

## Dependencias, riesgos y cierre

Dependencias: MinIO persistente, PostgreSQL, contratos de capacidad/guest; bootstrap storage local sin nube. Riesgos: late writers, grants antiguos, rollback SQL tras IO, mutabilidad staging, quota duplicada, falsas confirmaciones y respuestas obsoletas. Pruebas reales de bytes/replay/policy/checksum, unitarias UI/transport, builds/contract y reviewer independiente requeridos. Cierre sólo con evidencia; no acreditar pipeline/publicación o móviles no probados.

## Evidencia de entrega

- 11/11 casos HTTP con PostgreSQL y MinIO reales: bytes, hash observado, versiones, sobrescritura staging, replay y concurrencia, policy tras IO, owner del mismo evento, cuota, deadline, tamaño POST, snapshot de Mis aportes y constraint de receipt completo.
- Regresiones PostgreSQL: 8/8 API (participación + entrada guest) y 10/10 upload lifecycle/authorization. Aislamiento verificado y bases temporales propias limpiadas.
- Backend: 44/44 unitarias API (incluidos 28 casos de redacción/códigos seguros) y 4/4 capacidad. Frontend: 42 pruebas focales y 2 casos adicionales cuota/expiración PASS; typecheck limpio. Proxy unitario 1/1 y bootstrap privado/versionado PASS.
- Proxy Angular real: POST firmado con otro Host, bytes idénticos, VersionId real y GET/listado denegados PASS. No equivale a prueba en teléfono físico.
- Builds API/dominio/capacidad/cliente/web y OpenAPI/client check PASS. Bundle web ~962 KB mantiene advertencia existente de 600 KB, bajo umbral de error 1 MB.
- Reviewer independiente APPROVED tras corregir constraint de byte count no nulo y revisar la lista finita de errores públicos. Sin hallazgos pendientes.
- Runtime local actualizado: API y web Healthy, readiness/página HTTP 200 y lectura por `/storage/eventlens` HTTP 404. `media-init` terminó correctamente privado/versionado y la migración aditiva se aplicó conservando volúmenes. Imagen web final actualizada con textos de recepción pendiente; servidores aislados detenidos después de la validación y limpieza de sus bases propias. `git diff --check` PASS.
- Guía `docs/local-guest-uploads.md`, contexto UI y reporte de gaps sincronizados. Commits atómicos autorizados posteriormente por el usuario; sin push, cambios AWS ni acceso a secretos `.env`. Validación multimedia, aceptación, publicación/galería y cleanup físico continúan pendientes; no se acreditan por este DONE focal.
