# EventLens — contratos conceptuales API

**RECOMMENDED:** API HTTP JSON versionada `/api/v1`, con controllers delgados que invocan casos de uso del monolito. Ejemplos de rutas son contratos propuestos, no endpoints implementados. Puertos completos en [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

| Operación | Entrada / resultado conceptual | Invariantes |
|---|---|---|
| `POST /events/{eventId}/uploads` | filename seguro de presentación, declaredBytes/type, clientFileId; retorna uploadIntentId, estrategia, partes/firma y expiración | Actor/sesión/consentimiento, estado/capacidad; key real emitida solo por servidor |
| `POST /events/{eventId}/assets/cover/uploads` | organizer owner, expectedCoverRevision, spec de foto; retorna EventAsset/UploadIntent purpose EVENT_COVER | EventConfigurationPolicy permite DRAFT/SCHEDULED; nunca sesión invitada/QR. Reutiliza complete/inspection/storage, no galería de aportes |
| `POST /events/{eventId}/assets/cover/assign` / `POST /event-assets/{id}/access` | Asset READY seguro + CAS config; grant preview privado | Owner/event coinciden; reemplazo seguro atómico + cleanup viejo async; preview DRAFT privado sin acceso guest |
| `GET /uploads/{id}` / `POST /uploads/{id}/parts/authorize` | Estado físico conocido, partes registradas; nueva autorización para números autorizados | Misma sesión/evento, permisos actuales; nunca uploadId arbitrario de storage |
| `POST /uploads/{id}/complete` | Lista de partes/checksums cuando aplique; retorna mediaId/status tras confirmación | Idempotente; verifica metadata real y asociación; confirma durable, no depende de callback cliente confiable |
| `POST /uploads/{id}/abort` | Cancelación intento; resultado idempotente | Separa detener intención de eliminación física; revoca futuras firmas y limpia cuando seguro |
| `GET /media/{id}/status` | Estado funcional, progreso técnico disponible, errores amigables | Owner o sesión own contributions según policy; detalles sensibles nunca al invitado |
| `POST /media/{id}/access` | Variante y propósito; grant temporal URL+expiresAt | Invitado solo PUBLISHED/galería habilitada y derivados; organizador original seguro; admin motivo/ámbito |
| `POST /events/{id}/exports` / `GET /exports/{id}` | Id solicitud, estado, partes/tamaños/expiry | Owner; async 202; selección/invalidación final dependen PL-010 |
| `POST /exports/{id}/parts/{partId}/access` | Firma breve con expiry ≤ ventana export | Autorización vigente + manifiesto vigente; nunca firma fija de 48h |
| `POST /downloads/{grantCorrelationId}/client-status` | Señal cliente limitada: iniciado/completado observable/cancelado; sin secreto storage | Id de correlación vinculado al owner/resource, rate limitado/idempotente; señal cliente no demuestra guardado local ni cuenta como descarga observada sin evidencia |
| `POST /resources/{type}/{id}/deletion-requests` | Confirmación/reautenticación, reason; solicitud/cancelUntil | Rutas concretas por dueño al implementar; evento72h/cuenta7d; no DELETE accidental de un clic |
| Comandos admin sobre jobs/recursos | Ref, motivo, expectedRevision, tipo acción | Identidad admin + grant; retry/cancel no omite restricciones de dominio |

## Respuestas, errores e idempotencia

GET y commands rápidos retornan DTO mínimo; procesamiento/ZIP/purga responden `202` y recurso consultable. Transferencia exitosa a storage por sí sola no implica media aceptada. `201` upload intent/media cuando durable, `200` repetición compatible; errores `400` entrada, `401` sesión, `403` policy, `404` recurso no revelable, `409` versión/idempotency conflict/lifecycle, `413` tamaño, `422` formato/validación, `429` rate limit, `503` dependencia temporal. Errores estables `code`, mensaje español, correlationId y retryAfter cuando procede; nunca stack/SDK/object keys secretos.

Commands repetibles llevan Idempotency-Key scoped a actor/evento/operación + hash de request. Mismo key/hash devuelve receipt; hash distinto → conflict. Constraint única y transacción evitan doble efecto. Complete además UNIQUE(uploadIntentId→media); job/export/delete incluyen dedup key de recurso/generación. Retención de receipts cubre vida del intento y ventana de reintento operativa configurada, sin borrar receipts de comandos destructivos antes de purga terminada.

## Autorización y DTOs

ActorContext proviene de sesión validada, nunca role/organizerId enviados por cliente. Cada recurso se valida por pertenencia, estado actual, autorización de operación y barreras padre. El token del enlace no equivale a permiso permanente a media. Consent version/date están vinculados a guest session/event; evidencia exacta queda Q-029. Admin acceso media requiere caso/justificación/grant limitado y auditoría.

Principal administrativo se autentica en MOD-001 tras provisión controlada; ningún endpoint público de registro admite elevación/role admin. MOD-007 concede intervenciones restringidas sobre ese principal, revocadas con su identidad. Cambios QR/PIN/password/recovery token/session/suspensión/borrado/cancelación escriben PREPARE externo→tx→ACK conforme RecoveryAuthority; ACK desconocido conserva barrera y responde operación pendiente/error temporal, no éxito que habilite permiso. Commands y tokens llevan auth/access revision/recovery epoch; scope no reconciliado post-PITR no emite firma ni ejecuta retry destructivo.

Download requested/grant issued/read observed/client status son eventos diferentes. Telemetría de storage se ingiere por adapter operado/autenticado, nunca por endpoint cliente que pueda declarar cualquier owner/version completado. DTO panel/beta identifica evidencia `observed/reported/unknown` y cobertura; no expone URLs/IP/filename en agregados.

No exponer entidades ORM ni navegación automática de relaciones. Timestamps ISO UTC + TZ/event display según UX; sizeBytes integer inequívoco y límites efectivos en bytes cuando PL-011 cierre unidad. Paginación cursor estable por evento/estado para galerías e inventarios. Signed URL solo en respuesta de autorización y no en consultas masivas permanentes/logs. Errores técnicos de procesamiento separados del mensaje público y protegidos para admin.

## Compatibilidad

Versionar contratos públicos y objetos de job con handlerVersion; actualizaciones compatibles/aditivas dentro v1 y lectores tolerantes a campos adicionales. Recursos llevan revision y commands destructivos/moderación usan expectedRevision; optimistic conflicts se muestran y no sobrescriben intención concurrente. CORS limitado web+storage; CSRF para cookie auth; cache privada y Referrer-Policy restrictiva. Framework y formato HTTP están aprobados en [technical-baseline.md](technical-baseline.md), EL-TD-002 y EL-TD-004; los detalles de serialización se definirán al implementar sin cambiar los invariantes.

## API Style

The EventLens application API uses:

- REST
- JSON
- OpenAPI

OpenAPI is the explicit application boundary between web and API.

Angular must not depend directly on NestJS internal classes.

Preferred flow:

NestJS API
    ↓
OpenAPI specification
    ↓
Generated TypeScript client
    ↓
Angular

Shared TypeScript code in the monorepo does not imply shared HTTP DTO classes.

A package may be shared only when the concept is genuinely independent
from a specific application layer.
