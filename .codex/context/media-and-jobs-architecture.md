# EventLens — media, almacenamiento privado y trabajos

**CONFIRMED:** DEC-009/013/014/037..039/046..049/061..064. **ACCEPTED_SIMPLIFIED:** pipeline multimedia de ARCH-015 según la sección de adopción siguiente. **RECOMMENDED:** detalles conceptuales restantes no adoptados por un ADR; las decisiones funcionales PL-001..014 no se responden mediante este diseño. Ownership en [domain-map.md](domain-map.md); operación/purga en [operations-and-recovery.md](operations-and-recovery.md).

## ObjectStorage neutral

El dominio almacena `ObjectRef {namespace, key, immutableVersion?, checksum?, sizeBytes, class}` y nunca URL firmada permanente/SDK handle. `ObjectClass = STAGING | ORIGINAL | DERIVATIVE | EXPORT | ATTEMPT_OUTPUT`; clasificación técnica, no estados de media. Paths propuestos incluyen eventId/mediaId/exportId aleatorios + generación/intento; originales/derivados/exports distinguibles, sin filename/PIN/token en key. El adapter resuelve bucket/proveedor.

```text
ObjectStorage
  capabilities() -> limits, multipart, checksum, immutableSnapshot, conditionalWrite,
                    scopedWritePermits, versionDeletion, readRange
  createUpload(spec, intentId) -> UploadHandle(strategy, expiresAt, constraints)
  createUploadUrl(handle, constraints) -> TemporaryWriteGrant
  createMultipart(handle, partPolicy) -> MultipartHandle
  authorizePart(handle, partNumber, checksum?, expiresAt) -> TemporaryWriteGrant
  listUploadedParts(handle) -> PartMetadata[]
  completeUpload(handle, orderedParts?, operationId) -> ObjectMetadata
  abortUpload(handle, operationId) -> Aborted | AlreadyCompleted | Unknown
  exists(ref) -> Present | Missing | Unknown
  getMetadata(ref) -> size, detectedStorageMetadata, checksum, version, etag
  sealOriginal(source, destination, expectedMetadata, operationId) -> ImmutableRef
  openRead(ref, range?, expectedVersion?) -> bounded byte stream
  createDownloadUrl(ref, purpose, ttl, disposition) -> TemporaryReadGrant
  writeStream(destination, stream, operationId, permit) -> ObjectMetadata
  copy(source, destination, expectedVersion?, operationId, permit) -> ObjectMetadata
  delete(ref, includeVersions, operationId) -> Deleted | AlreadyMissing | Unknown
  enumerateOwnedObjects(scope, cursor) -> internal maintenance inventory page
```

`completeUpload` vuelve a comprobar el resultado si ocurrió pero se perdió respuesta; `abortUpload` no significa borrar un objeto ya completado. `Unknown` ante timeout/5xx impide tratar objeto como inexistente. ETag no se interpreta como checksum universal. `operationId` deduplica/reconcilia acciones; adapter detecta si un destino ya existe con metadata esperada. `enumerateOwnedObjects` es mantenimiento privado, no listado público. Copy/seal no pasa el cuerpo por API; usa copia dentro del storage cuando está disponible o stream de worker acotado.

Capabilities son verificadas por contract tests. Un adapter S3-compatible puede no soportar todos los controles AWS: debe demostrar límites reales de upload, integridad, snapshot/copia, abort, privados, multipart y eliminación/versiones. No aceptar adapter incapaz de conservar original exacto o de cumplir purga. Para URLs PUT que no puedan fijar máximo real, firma de tamaño/checksum cuando soporte y finalización que rechaza exceso, abort/cuarentena/cleanup, rate/coste operativo; no confundir declaración cliente con límite físico perfecto. Credential scope no permite listar, escribir otro key o leer originales.

## Estado físico y estado funcional

| Plano | Estados/observaciones técnicas | Relación |
|---|---|---|
| UploadIntent | CREATED, AUTHORIZED, TRANSFERRING, STORED, CONFIRMING, CONFIRMED, ABORTING, ABORTED; deadlines | No media UPLOADED antes de original sellado y commit durable; intento no cambia por polling inventado |
| Objeto | Ausente, multipart incompleto, staging completo, snapshot original/derivado activo, output parcial/huérfano, ausente verificado | HEAD/list/metadata observados, distintos de status en DB |
| Media | UPLOADED, PROCESSING, PROCESSING_FAILED, QUARANTINED, PENDING_REVIEW, PUBLISHED, HIDDEN, REJECTED, TRASHED, DELETED | Solo transiciones autorizadas por facts/policy; no STALLED ni AUTHORIZED en media |
| Job | PENDING, PROCESSING, COMPLETED, RETRYING, FAILED, DEAD | Un job DEAD no vuelve automáticamente media DELETED ni elimina original |

Los estados del intento son conceptuales técnicos **RECOMMENDED**, no additions a decisiones de producto. En media guardar inspección/seguridad/gobierno separados y proyección canónica según [domain-map.md](domain-map.md).

## Carga completa y reanudación

La secuencia siguiente es `purpose=GUEST_CONTRIBUTION`. Los UploadIntent llevan purpose/actor/resource explícitos; firmar uploads sin purpose conocido falla. `EVENT_COVER` usa el contrato de configuración siguiente, reutilizando bytes/pipeline sin reutilizar permisos invitados.

### Portada y EventAsset privado — AQR-002

`EventAssetService.createCoverUpload(eventId, organizerActor, expectedConfigRevision, fileSpec, idempotencyKey)` consume `EventConfigurationPolicy` de MOD-002: organizador autenticado/activo y owner, evento DRAFT/SCHEDULED, sin barrera de cuenta/evento. QR/PIN, guest consent y uploads_enabled no autorizan esta operación. Invitado y owner de otro evento se deniegan; admin no obtiene acceso libre por su identidad. No se inventa comportamiento de reemplazo en estados posteriores: se invoca policy funcional aprobada si se extiende.

UploadIntent EVENT_COVER referencia EventAsset, event, owner y `replacementOf?/expectedCoverRevision`; misma autorización temporal a staging, multipart cuando adecuado, complete/metadata/seal, jobs e inspección. `EventAsset` tiene hechos técnicos `RECEIVED/PROCESSING/READY/FAILED/QUARANTINED/DELETING/DELETED` conceptuales y propósito COVER, separados de media.status del aporte invitado. PhotoInspector/Transformer valida tipo real/formato/tamaño/seguridad y crea thumbnail/cover preview web sin reemplazar original; límites de asset vía EventConfigurationPolicy parametrizada, no un tamaño comercial inventado. Archivo inseguro no puede ser portada.

MOD-003 posee originales/derivados físicos y estado técnico del asset; MOD-002 posee únicamente asignación/config activa. Cuando asset READY seguro, `AssignCoverAsset(eventId, assetId, expectedCoverRevision)` toma lock/config revision y valida owner/event/asset generation; cambia referencia vigente y encola cleanup del anterior + audit en una tx. Si procesa falla, asset sigue FAILED/quarantine y portada anterior permanece. CAS perdido deja asset no asignado para retry/cleanup, nunca borra el nuevo activo. Publicar evento requiere portada asignada segura/ready cuando se configuró una, no un staging inseguro.

Preview privado: organizer owner autorizado obtiene grant a derivados READY en DRAFT/SCHEDULED; invitado no abre preview admin ni original cover. Al abrir el evento autorizado se presenta variante de portada por EventAccessPolicy, con storage privado/grant temporal igual que galería; no vuelve público el asset. Cover no aparece como recuerdo en galería/Mis aportes ni export ZIP. Browser/admin no decide estado READY por upload completo.

Cleanup asset anterior/unassigned async idempotente, con referencia activa/CAS/barrera verificada antes de borrar y writer drain común. Sustituciones/reintentos nunca eliminan asset todavía asignado. Inventario separado `assetPurpose=COVER`/original/derivative/partial permite purga evento/cuenta incluir todas versiones y datos temporales. Conteo físico de asset/copies siempre observado; imputación comercial 10GB/slots queda PL-011/012, sin asumir que portada cuenta o no como aporte. Storage ObjectClass ORIGINAL/DERIVATIVE se reutiliza con resourceType EVENT_ASSET y propósito, sin bucket o módulo nuevo.

```mermaid
sequenceDiagram
  participant G as Invitado
  participant A as API / MOD-003
  participant D as PostgreSQL
  participant O as ObjectStorage privado
  participant W as Worker
  G->>A: Solicitar upload (session, event, consentimiento, idempotency)
  A->>D: Validar política + reservar cuota + UploadIntent (tx)
  A->>O: Crear capacidad temporal a staging fijo
  A-->>G: IntentId + PUT/partes + expiry
  G->>O: Transferir bytes/partes directamente
  G->>A: Complete(intentId, parts, misma clave)
  A->>O: Complete + metadata real + sellar original
  A->>D: Media UPLOADED + commit reserva + job + audit (tx)
  A-->>G: Recibido / procesando, mediaId
  W->>D: Reserve job + lease, commit
  W->>O: Leer original inmutable / generar derivados por intento
  W->>D: CAS lease + generation + policy actual + resultado
  W-->>D: PUBLISHED o PENDING_REVIEW; fallo/cuarentena según validación
```

1. Antes de autorización: sesión/QR/PIN vigente, consentimiento versionado, evento/state/flags y elegibilidad de cuenta padre, plan/límite por archivo, declaredBytes/type y rate limit. Cliente ayuda con duration, pero duración real se valida en worker. Store UploadIntent/IDs/event/session/expected key/checksum/bytes/deadlines/request hash antes de emitir capacidad. Uso de hora/revisión permite reevaluar cambios.
2. **RECOMMENDED, sujeto a PL-012:** reservar bytes declarados y un slot en transacción corta serializada sobre capacity row. `committed + reserved + requested <= effectiveLimit` conforme política aprobada; categorías/unidades PL-011. Reservas únicas por intento, vence/cancelación libera exactamente una vez cuando ya no puede producir objeto retenido. Confirmar convierte reserva en committed usando tamaño real. No descontar archivos físicos TRASHED/quarantine. Reducción de límites se implementará conforme PL-012, sin desechar finalizados para ajustar contador.
3. `createUpload` fuera de tx, pero idempotente por intent/key. Si falla, la intención durable queda recuperable y reserva no se duplica. Client retry obtiene mismo intento y nuevas firmas permitidas. Preferir multipart para videos/grandes; fotos pequeñas single request. Umbral/part size/adaptive concurrency configurables por adapter/proveedor y pruebas, sin fijar aquí número universal.
4. Browser envía partes con progreso/retry independiente. Solo backend finaliza multipart; conoce part numbers/checksums y consulta la lista real. Renovar firma no renueva automáticamente reserva/deadline/permisos. Al cambiar estado/revocar/cerrar durante upload aplica `UploadAdmissionPolicy.evaluateExistingIntent` definida después de PL-005/012, no un supuesto de permitir/cancelar. Transferencia directa físicamente puede seguir mientras grant válido, aunque la aplicación ya niegue confirmación.
5. Complete comprueba pertenencia del intento, estado, metadata real, existencia, size/checksum y permisos/policy actuales. Multipart ensamblado puede existir antes de respuesta perdida; retry consulta metadata. MIME real/decodificación/duración se comprueban después en entorno aislado: confirm no afirma seguridad solo con HEAD. Intent inválido no publica; objeto se aísla/limpia conforme razón sin destruir otros originales.
6. Sellar staging a key original sin permisos de upload del browser; destino generation/intent único. Alternativa adapter con snapshot/version inmutable equivalente. Guardar exacta identidad/version/checksum y no permitir sobrescritura del canonical por reusar PUT. Crear/actualizar estado UPLOADED + ledger + job en una sola tx revalidada. Sellado externo previo puede quedar orphan si commit falla; intento durable incluye destino y permite recuperación, no una fila media fantasma.
7. Confirms simultáneos serializan claim/revision y UNIQUE uploadIntentId→media; copy idempotente. El segundo retorna mediaId existente sin contabilizar o publicar dos veces. Para payload distinto con misma idempotency key → conflict. Un mismo archivo seleccionado dos veces deliberadamente no se deduplica globalmente sin decisión de producto.

## Abandonos, huérfanos y discrepancias

Intent TTL y write grant TTL separados, con protección contra expiración mientras exista confirm lease activo. Sweeper marca intento terminal y bloquea nuevas capacidades primero; aborta multipart, espera expiración de autorizaciones ya emitidas o quiescencia, luego borra staging/output no aceptado y verifica. Una reserva no se libera mientras bytes retenidos todavía comprometan cuota técnica; ledger distingue committed/reserved/physical orphan cost sin atribuir reglas comerciales no aprobadas.

Objeto sin confirmación: UploadIntent permite identificar dueño y reintentar confirm si policy autoriza; no se publica automáticamente desde listado storage. Sin intención comprobable → inventario de orphans tras antigüedad segura/deadline/writer drain, limpieza auditada. Nunca borrar objeto reciente por no hallarlo en una lectura DB vieja/restaurada. Canonical sin media se recupera por intent/receipt o limpia después de reconciliación.

Registro con objeto Missing comprobado: marcar inconsistencia técnica/alarma, bloquear lectura/procesamiento/publicación; retry después de verificar réplicas/restore policy. No transformar automáticamente status funcional en DELETED ni liberar cuota ante fallo storage. Repair no inventa un original distinto. Reintento upload del usuario es una nueva intención autorizada, no overwriting del original confirmado.

## Procesamiento de fotografías y videos

`MediaInspector`, `PhotoTransformer`, `VideoTransformer` y `MalwareInspection` permanecen puertos/adapters de infraestructura, sin dependencias de herramientas en el dominio. ARCH-015 adopta FFmpeg/ffprobe y libheif para inspección y transformaciones, con versiones y rendiciones en la sección siguiente; sustituye únicamente la anterior elección abierta de herramientas/targets/runtime. La decodificación HEIC/HEIF tiene evidencia representativa de EL-TK-061, no certificación universal ni de inspección antimalware. `MalwareInspection` conserva su responsabilidad/contrato de seguridad: validar formato o rechazar un corrupto no equivale a detectar todas las amenazas.

Fotos: comprobar bytes/magic/container real, parseo/decodificación, dimensiones/píxeles límites anti-bomba, checksum/orientation; extraer metadata técnica mínima. Derivados de visualización orientados/correctos y formatos web compatibles, sin EXIF/localización innecesaria. Original exacto intacto; no prometer borrado de EXIF del original y conservación byte-identical a la vez. Permisos/avisos de privacidad contemplan metadata del original. Animated/extra streams deben inspeccionarse antes de definir soporte específico.

Videos: inspeccionar contenedor y streams/códecs/duración real/resolución/tamaño/rotación/audio; duración >5min o formato real inválido no se publica. Generar thumbnail y versión web compatible mediante transcode cuando el original no cumple playback target; passthrough/remux seguro solo tras validación. Targets oficiales en ARCH-015 según la sección siguiente; no se presupone que todo MP4/MOV sea reproducible ni que toda combinación de códec esté validada. No aumentar calidad perdida artificialmente ni reemplazar el original.

Por intento: comprobar lease/generation/barrera, adquirir permisos/refs de lectura exacta, scratch acotado, inspeccionar; escribir outputs en attempt namespace, validar outputs, hacer CAS de referencias y decisión funcional vigente. Cuarentena por amenaza/validación de seguridad impide acceso normal; solo admin o proceso autorizado retorna a PROCESSING. Fallo transitorio retry hasta presupuesto; fallo técnico agotado → PROCESSING_FAILED, original conservado y descargable solo si safety policy confirma seguro. Tipo inconsistente/peligroso → QUARANTINED, no descarga owner por evasión de UI. Organización puede pedir retry de fail seguro; admin reevalúa condición vigente.

Moderación auto/previa lleva a PUBLISHED/PENDING_REVIEW según policy; cambio con jobs en curso sigue PL-007. Worker terminado no sobreescribe HIDDEN/TRASHED/retiro y no borra original por failure. Job y actualización resultado se confirman juntos cuando el adapter cola está en DB; CAS falla si job perdió lease y cleanup retire sus outputs.

## Pipeline multimedia adoptado — ARCH-015

**Status:** ACCEPTED_SIMPLIFIED — 2026-10-09. La solicitud explícita del usuario autoriza formalizar la adopción tras revisar los PASS de EL-TK-060/061; no es adopción automática por un experimento. Este documento es la fuente de verdad del contrato técnico multimedia; [ARCH-015](architecture-decisions.md#arch-015--pipeline-multimedia-aislado-y-rendiciones-adoptadas) registra la decisión. No altera formatos, reglas de producto, permisos ni EL-TD-001..007.

### Herramientas y revisión reproducible

| Responsabilidad | Baseline adoptado |
|---|---|
| Inspección de contenedor/streams y transformaciones foto/video | FFmpeg y ffprobe `8.0.1-r1` |
| Decodificación de imágenes HEVC en HEIF/HEIC | libheif/heif-convert `1.23.0-r0`, libde265 `1.0.16-r0` |
| Dependencia de la distribución multimedia ensayada | x265 `4.1-r0`; no define una salida HEVC ni sustituye playback H.264 |
| Revisión ensayada de la imagen multimedia | `sha256:bfdca4987f5afc676c208f7d31b8fb0663413d7fceafeaf17161209b7bf6a857` |

Versiones/digest identifican la revisión reproducible adoptada inicialmente; no congelan actualizaciones de seguridad. Cambiar tools/decoder/configuración requiere evidencia focalizada de compatibilidad, integridad, aislamiento y rendiciones antes de desplegar la revisión, y reevaluar MEDIA-001/CAP-001 cuando afecte sus supuestos. Un hilo de decoder/filter/encoder y de codec/tile libheif es la configuración inicial comprobada; aumentos requieren medición sin relajar controles de seguridad. No servicio SaaS ni proveedor de storage seleccionado.

### Rendiciones oficiales

| Variante | Target |
|---|---|
| Thumbnail foto/video | JPEG, ancho máximo 320 px |
| Preview foto/video | JPEG, ancho máximo 960 px |
| Playback video | MP4 con H.264/yuv420p, ancho máximo 960 px y `faststart`; AAC solo cuando existe audio en el original, sin pista de audio cuando no existe |

Se conserva orientación y proporción visual, sin upscale; en video se ajustan dimensiones pares compatibles con yuv420p. Los máximos son **ancho**, no lado mayor ni resolución mínima. No se inventa framerate/bitrate/perfil/color/HDR universal fuera de lo evidenciado; parámetros locales reproducibles deben conservar estos targets y pasar verificación del corpus correspondiente. Un passthrough/remux solo es elegible si produce el mismo target y cumple inspección/seguridad; de otro modo se transcodifica. No cambia JPEG/JPG, PNG, WebP, HEIC/HEIF, MP4, MOV y WebM como formatos de entrada aprobados.

Original sellado/versionado/checksum permanece byte-identical y protegido por el permiso vigente; no se reescribe para normalizar orientación o quitar metadata. Derivados aplican orientación y minimización de metadata sensible, incluyendo exclusión de GPS/EXIF innecesario. La evidencia comprobó tags EXIF/GPS controlados y su ausencia en derivados; no se afirma extracción universal de coordenadas ni XMP poblado validado. El tratamiento de metadata adicional debe verificarse en la implementación integrada antes de exponerla; logs/resultados contienen únicamente metadata técnica mínima, nunca coordenadas/secretos. Reutiliza el pipeline en aportes invitados y EventAsset COVER manteniendo sus permisos/ownership diferentes y los límites propios aprobados del asset.

### Aislamiento y supervisión

Se adopta el mecanismo mínimo ensayado: un contenedor Docker de parser/transformer por ejecución, con cgroups para CPU/memoria/PIDs, deadlines y threads acotados, filesystem raíz de solo lectura y entrada de original montada de solo lectura. Scratch/tmpfs es privado por intento y limitado; no conserva originales ni estado durable. Ejecuta como usuario no root, sin capacidades adicionales, con `no-new-privileges`, sin red, sin secretos DB/storage y sin socket Docker ni acceso a scratch ajeno. Las comprobaciones previas de píxeles/dimensiones/streams y límites del recurso preceden a transformaciones costosas; runtime vuelve a contener el consumo real. Config ausente/inválida falla cerrado, nunca ejecución ilimitada.

Supervisor confiable separado del parser posee los accesos mínimos autorizados a JobQueue/ObjectStorage y control del runtime; entrega entrada exacta, valida outputs privados e inicia I/O externo dentro del scope autorizado. El parser no reserva/renueva jobs, no publica, no decide permisos y no tiene credenciales de persistencia. No se montan interfaces de control del host dentro del parser; no se adopta acceso indiscriminado del supervisor a archivos/secrets ajenos. Runtime/supervisor son responsabilidades del worker del mismo monolito, no microservicios ni un nuevo servicio de consenso.

Los presupuestos exactos son configuración operacional validada por tipo de tarea/host. EL-TK-060 probó CPU 0.5/memoria 128 MiB/PIDs 32/scratch 16 MiB y parada acotada de 4 s en su perfil; EL-TK-061 probó multimedia CPU 1/memoria 512 MiB/PIDs 64/scratch 128 MiB/tmp 16 MiB. Estos perfiles son puntos reproducibles de implementación, **no** capacidad universal certificada para 40 MP/500 MB/5 min. Debe configurarse y verificarse el presupuesto suficiente de lectura/scratch/duración para cada límite de producto, sin elevar privilegios/red ni afirmar que el perfil pequeño procesa todos los máximos. CAP-001/MEDIA-001 gobiernan los recursos y tiempos reales de Beta.

### Autoridad, publicación y quiescencia

MOD-003 posee media/originales/derivados y el resultado técnico de EventAsset; la cola/supervisor ejecutan bajo JobQueue y políticas de sus owners. MOD-002 conserva assignment de portada; moderación/autorización no se trasladan al codec. Identificador de intento, owner/token, lease vigente, heartbeat, fence, resource generation y recovery epoch vinculan cada ejecución y efecto; reloj DB es autoritativo. Claim/renovación/CAS siguen ARCH-005 y la sección JobQueue, sin una segunda fuente de verdad ni lock distribuido.

Publicación exige outputs validados, autoridad vigente y políticas/barreras actuales. Estado de job, referencias/outcome del owner y auditoría se confirman en una transacción corta PostgreSQL mediante CAS; no mantiene lock mientras transforma o escribe storage. Outputs externos se escriben exclusivamente a refs por intento/generación previamente inventariadas mediante intención durable. Un PUT correcto no publica por sí solo; si CAS falla, permanece no promovido y sujeto a reconciliación/cleanup. No se sobrescriben originales ni derivados activos y nunca se revierte un retiro/TRASHED/HIDDEN por una ejecución vieja.

Ante cancelación, pérdida de heartbeat/DB/lease, fence/generation/epoch o permiso: cerrar admisión de nuevo I/O del intento y negar renovación/promoción; detener proceso/descendientes, esperar evidencia de terminación; rastrear y drenar operaciones externas ya iniciadas. `abort` del cliente, expiry o CAS fallido **no** prueban que un PUT/completeMultipart dejó de ejecutarse en storage. Si el resultado es Unknown, mantenerlo pendiente, reconciliar por ref/operación e inventario, y verificar la ausencia/presencia real y multipart antes de cleanup/finalización física. No declarar borrado/cancelación física completa mientras un writer pueda recrear objetos. Recovery tras crash reconstruye inventario durable y barreras/epoch vigentes antes de reabrir; no borra originales ni refs activas. Proveedor/adapter futuro debe demostrar esta semántica; MinIO local no la garantiza para cualquier S3-compatible. Contrato de purga/recovery completo permanece en [operations-and-recovery.md](operations-and-recovery.md).

Errores de formato/corruptos/no soportados se rechazan sin derivados promovidos, conforme a la disposición funcional del owner; una amenaza sospechosa conserva QUARANTINED según policy. Ausencia de herramienta, permisos, I/O, OOM/timeout y fallo operacional desconocido son fallos técnicos sanitizados (PROCESSING_FAILED/disposición y retry del owner), no prueba de original inválido. Parciales nunca se publican; el original se conserva y las reglas de descarga segura no cambian. Inspección/transformación exitosa no evita moderación ni certifica ausencia universal de malware.

### Evidencia, límites y validaciones abiertas

- [EL-TK-060 resultado](../../infra/spikes/evidence/spike060-result.json): 20/20 PASS de controles, autoridad/quiescencia y recuperación; controles de runtime e integración ensayados en casos acotados. La nota histórica “061 remains unexecuted” describe ese momento, superado por el resultado061 siguiente, y no se edita la evidencia cruda.
- [EL-TK-061 resultado final](../../infra/spikes/evidence/spike061-result.json): 17/17 Vitest, 26 casos base + 6 transformaciones límite, 3 fallos de procesamiento, 9 checks PostgreSQL/MinIO; original íntegro y rechazo seguro. 39 controles físicos PASS/0 FAIL/0 bloqueos activos bajo cobertura aprobada; nueve BLOCKED históricos y hashes/reportes originales se preservan. No se certifican por separado Safari/Chrome iOS como motores distintos ni nuevas variantes como físicamente ensayadas.
- HEIF cubre HEVC 8/10 bits y marca genérica mif1 representativos; no todos los codecs/perfiles/plugins, animación/secuencias msf1 o HDR. Metadata GPS es evidencia EXIF controlada, sin caso XMP poblado. Los 40 MP fueron inspección; límites de tamaño/duración usaron fixtures pequeños/bajo fps o padding válido, sin throughput de todos los máximos. Versiones físicas SO/browser siguen UNKNOWN.
- **MEDIA-001:** integración productiva con upload/sellado, adapters reales, seguridad/derivados/cover/retry/cleanup/drain, metadata sensible y matriz/corpus representativa; métricas de éxito foto>=98% y video>=95%. PASS del spike no pasa este gate.
- **CAP-001:** recursos reales de host/pools/scratch y máximos de producto, cola incluida en latencias/medianas/p95, contención app/DB y carga aprobada; no se fija capacidad por estimación.
- **DR-001:** restore/PITR, RecoveryAuthority independiente, barreras/epoch/no resurrección y borrado; **EXPORT-001:** ZIP64/partes/recursos/invalidación/cleanup reales. Reutilizar supervisor no demuestra estos gates.

Los cuatro gates conservan VALIDATION_REQUIRED en [architecture-decisions.md](architecture-decisions.md); la evidencia de laboratorio los registra NOT_EVALUATED, no PASS. Adopción habilita revisar/plantear adapters y ejecutor bajo sus dependencias; no cambia estados/readiness de tickets ni certifica apertura de Beta. Storage Beta/producción, observabilidad/proveedores y demás DEFERRED conservan su estado. La comparación mínima prefirió herramientas locales/versionadas dentro del aislamiento demostrado frente a parseo en API/proceso confiable (sin contención) o SaaS/sandbox adicional (complejidad/proveedor no justificados por evidencia). El coste aceptado es supervisor, inventario y límites verificables, con compatibilidad/rendimiento reevaluables, manteniendo el monolito.

## Inspección antimalware local adoptada — ARCH-016

**Status:** ACCEPTED_SIMPLIFIED — 2026-10-09, aprobación explícita del usuario: «usa clamAV». Cierra exclusivamente la elección independiente de `MalwareInspection` para EL-TK-033; complementa ARCH-015 sin sustituir herramientas, formatos, rendiciones ni la imagen multimedia adoptada allí. Este apartado es la fuente de verdad del contrato antimalware; el registro ADR y el handoff lo referencian.

### Mecanismo y propiedad

- MOD-003 posee la inspección, su metadata técnica mínima y los hechos de seguridad por original/generación. `MalwareInspection` es un puerto neutral; el adapter de infraestructura ejecuta **ClamAV `clamscan` por intento aislado**, no un daemon compartido `clamd`, servicio SaaS ni proceso dentro de API. `MediaInspector` conserva validación real de bytes/formato/streams/límites; ambos resultados son necesarios para aprobación del perfil de inspección aplicable. Validar formato no sustituye antimalware.
- Reutilizar supervisor, inventario durable, cancelación, autoridad y quiescencia de EL-TK-056. Incorporar un perfil de scanner explícitamente confiable con imagen/digest propios y herramientas permitidas, conservando el perfil multimedia y su digest existente. El caller de composición configura perfiles admitidos; un job, HTTP payload o archivo no puede elegir binarios, imagen, flags ni mounts arbitrarios. No duplicar lógica de drain ni abrir la allowlist genéricamente.
- Scanner recibe únicamente el original exacto de su intento y el snapshot de firmas de solo lectura, no red, secretos, DB, credenciales de storage, Docker socket, root ni archivos de otros intentos. CPU/memoria/PIDs/scratch/tiempo y stdout siguen acotados; el presupuesto scanner es independiente y no hereda ciegamente los pequeños fixtures del parser multimedia.
- Un proceso operativo confiable separado ejecuta `freshclam` para obtener firmas oficiales, verificar su procedencia/integridad y construir un snapshot versionado/inmutable. Publica un manifest con identidad, hashes, versión/fecha del contenido, instante verificable de actualización y compatibilidad; no modifica un snapshot en uso. El motor carga/verifica realmente ese snapshot. No aceptar solamente timestamp de un archivo o fecha de descarga como prueba de frescura de las firmas. El updater no procesa originales ni concede acceso a otro recurso.

### Perfil reproducible y completitud

La rama inicial seleccionada es **ClamAV 1.4 LTS**, con **1.4.6 adoptado para la implementación de EL-TK-033** después de verificar el motor y el snapshot oficial y completar la validación independiente. La imagen oficial `clamav/clamav:1.4.6_base` queda fijada al manifest de plataforma `sha256:58d9b21b5694a1f5b3a136e4f2e4fc6b463fce88635737e16f8cb9ee9455a199`; su identidad local ejecutable es `sha256:e4df73bcde9afeb6bd1b464091f053537b3df86d8bf5a0431ae87c1760b332ae`. Engine, snapshot y perfil efectivo se registran en la [evidencia independiente](../../infra/validation/media-inspection/evidence/tester-final/result.json) y su manifest de fuente. Si cambia el parche, verificar soporte y ejecutar evidencia focal en vez de congelar una revisión vulnerable. Esto no acredita capacidad ni operación Beta.

Configuración operacional obligatoria y finita: edad máxima aceptable del contenido de firmas, CPU/memoria/PIDs/scratch/wall time, límites de archivo y datos inspeccionados, recursión/número de objetos internos/tiempo del engine y bytes de reporte. Ausencia, incompatibilidad o valor no válido falla cerrado al arrancar/admitir el intento. Planner/implementer fijan valores reproducibles medidos en el laboratorio; no inventan nuevos máximos comerciales ni prometen capacidad Beta. El perfil debe cubrir los límites de archivo aprobados por producto; si un presupuesto técnico menor impide inspeccionar un archivo permitido, el resultado es INCONCLUSIVE, nunca una aprobación ni una reducción silenciosa del límite funcional.

El adapter comprueba exactamente qué original se examinó, checksum/tamaño antes y después, que fue efectivamente inspeccionado, que el snapshot se cargó y que no hubo omisión, truncamiento, alerta de límites/recursión/tiempo ni reporte incompleto. Un exit code 0 o texto «OK» no bastan: ClamAV puede omitir archivos que exceden sus límites. Activar los controles de cobertura/alertas correspondientes a la versión y probarlos expresamente, incluidos datos anidados; ninguna opción de optimización puede ocultar una omisión. No usar `--remove`, `--move` ni reescribir el original. Los límites anti-bomba contienen trabajo; alcanzar un límite impide certificar completitud.

### Resultado y persistencia

El adapter entrega un resultado interno estructurado, acotado y sanitizado: `NO_THREAT_DETECTED`, `THREAT_DETECTED` o `INCONCLUSIVE`, razón técnica tipada, motor/versión/digest, snapshot, perfil, identidad/checksum de original, generación e intento. Es resultado del perfil concreto, no garantía universal de ausencia de amenazas. Native exit 1 por detección confirmada debe distinguirse de error operacional; alerta de límites o cifrado que impide cobertura no se interpreta automáticamente como amenaza confirmada. Exit inesperado, salida ambigua/no analizable, firmas ausentes/corruptas/vencidas, omisión, timeout/OOM/cancelación, pérdida de autoridad o fallo desconocido producen INCONCLUSIVE. Cero amenazas con cobertura incompleta también produce INCONCLUSIVE. stdout/stderr crudos, rutas/nombres originales, coordenadas y nombres crudos de firmas no llegan a DTO, auditoría o logs generales.

MOD-003 combina validación de formato y antimalware para el hecho de seguridad consumido por `MediaSafetyPolicy`; sin aprobación explícita completa y vigente no habilita transformación ni descarga normal conforme DEC-075. Detección/inconsistencia queda no elegible y se entrega a la disposición funcional existente; EL-TK-033 no implementa la transición de cuarentena de EL-TK-034 ni los cierres/reintentos de EL-TK-039. Ningún adapter decide permisos ni libera cuarentena.

Persistir resultado/checkpoint, revisión e intento con auditoría pertinente en SQL corto, atómico y condicionado a permisos/policy, original, generación, lease/fence/epoch vigentes. Retry compatible reutiliza el mismo hecho/checkpoint; resultado viejo no sustituye el vigente. La inspección es una fase del job de procesamiento ya aceptado por EL-TK-032: **no llamar `JobQueue.complete` únicamente porque terminó EL-TK-033**, ni crear por defecto un segundo job/ciclo. El checkpoint mantiene el job reservado para las fases siguientes; usa un contrato público mínimo del owner de cola para comprobar pertenencia vigente dentro de la transacción si resulta necesario, sin leer directamente persistencia ajena ni ampliar frameworks. La finalización del pipeline pertenece al owner de promoción/terminación. Crash/DB loss dejan seguridad pendiente/inconclusa y recuperación por contratos existentes; no publicar ni borrar originales para resolverlos.

Las fases pertenecen a composición confiable: inventario único por `(token, phase_id)` y exclusión atómica de otro intento `ACTIVE/UNKNOWN` del mismo token; una fase siguiente requiere `QUIESCENT` durable. El valor anterior/default `processing` conserva compatibilidad. MOD-003 conserva una proyección vigente y la historia de hechos: replay de la misma ejecución compatible no reinspecciona; una nueva ejecución autorizada reinspecciona y puede sustituir `APPROVED/INCONCLUSIVE` mediante checkpoint/CAS. `DENIED` no se libera por retry genérico. El consumidor compara el linaje esperado del owner, sin exigir lease activo después de completar el job ni ordenar epochs. La [sesión de implementación](../product/sessions/2026-10-09-el-tk-033-implementation.md) conserva el handoff focal y la evidencia.

### Validación localizada requerida

Antes de aceptar aprobación real: cargar snapshot oficial verificado con engine/digest/perfil fijados, multimedia limpia representativa de los formatos aprobados, detección real con fixture controlado EICAR separado de validación de formato, firma ausente/corrupta/vencida, cobertura omitida/tamaño y límites internos, timeout/OOM/cancelación, autoridad perdida, reporte inválido y original byte-identical. Firmas de prueba inventadas sirven solo para fault injection identificada; **no** demuestran una base oficial operativa ni aprobación productiva. EICAR valida respuesta de detección, no exhaustividad de protección. Medir coste de carga de firmas y recursos del perfil; la documentación del runtime ClamAV aconseja memoria sustancialmente mayor que un parser pequeño, sin convertir esa recomendación en sizing definitivo.

Revalidar controles de aislamiento/quiescencia de EL-TK-056 que la extensión afecte y pruebas PostgreSQL de checkpoint/replay/rollback/resultados antiguos. MEDIA-001/CAP-001/DR-001/EXPORT-001 permanecen VALIDATION_REQUIRED. Capacidad, cadencia de actualización, recuperación operacional y exposición Beta requieren evidencia integrada; no seleccionar proveedor ni provisionar aquí infraestructura permanente.

Fuentes primarias verificadas: [escaneo ClamAV](https://docs.clamav.net/manual/Usage/Scanning.html), [firmas oficiales](https://docs.clamav.net/manual/Usage/SignatureManagement.html), [soporte de versiones](https://docs.clamav.net/faq/faq-eol.html), [runtime Docker y memoria](https://docs.clamav.net/manual/Installing/Docker.html). Las cifras de versiones son una selección focal de implementación y deberán coincidir con su evidencia, no con una inferencia documental.

## JobQueue PostgreSQL

```text
publish(tx, JobSpec{type, handlerVersion, resourceRef, resourceGeneration,
                   dedupKey, queue, priority, availableAt}) -> JobId
reserve(queueSet, workerId, batchLimit, leaseDuration) -> LeasedJob[]
heartbeat(jobId, fencingToken, leaseDuration) -> Renewed | LeaseLost
complete(tx, jobId, fencingToken, outcomeRef) -> Completed | LeaseLost
retry(tx, jobId, fencingToken, retryAt, errorCode) -> RETRYING | DEAD
fail(tx, jobId, fencingToken, errorCode, retryability) -> FAILED | DEAD
recoverExpiredLeases(now, batchLimit) -> Requeued | DEAD
requestCancel(jobId, actor, reason) -> CancelRequested
manualRetry(jobId, actor, reason, expectedRevision) -> AuditedExecution
```

Datos: ids/type/status/attempts/reference/created/started/completed/failed/nextRetry/lastError mínimos confirmados, más queue, priority, available_at, lease_owner, lease_expires_at, fencing_token, handler_version, resource_generation, dedup_key y cancellation metadata **RECOMMENDED**. No payload binario ni signed URL. LastError sanitizado y sin secretos; job_attempts conserva historia, manual retry no borra los tres intentos anteriores.

Reserva: transacción corta selecciona jobs elegibles PENDING/RETRYING con available_at<=DB now, deadline vigente y sin cancel; `FOR UPDATE SKIP LOCKED` + UPDATE lease/PROCESSING/attempts/fence y RETURNING. Commit antes de side effects. No SQL detallado ni algoritmo de polling atado a stack. SKIP LOCKED es adecuado para claim de cola, no consultas de negocio que necesiten vista consistente. Índice parcial por queue/status/available_at, batch acotado, polling/backoff y conexiones limitadas; no lock de fila por la duración de transcode. [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html).

Lease duración/heartbeat por tipo, monotonic fence por reserva más identificador de ejecución único y recovery epoch, DB clock autoritativo. Renovación exige lease vigente + owner/token/epoch y recurso no cancelado; si expiró, no resucitar lease antiguo. Completado/retry exige mismo fence. Recover expired leases hace CAS bajo lock y reencola si quedan intentos; el worker antiguo queda incapaz de confirmar. Side effects se escriben por attempt key y no se promueven si pierde permiso. Tras PITR se genera un nuevo recovery epoch antes de cualquier reserva/tráfico: un token de worker anterior no puede coincidir con un contador restaurado y volver a ser válido.

Tres intentos automáticos TOTALES, incluido inicial; no tres retries adicionales. Transitorio → RETRYING con backoff/jitter configurable después de intento1/2; tercer fallo → DEAD sin cuarta ejecución automática. Esperas ejemplo no son reglas rígidas. FAILED representa fallo terminal no reintentable o disposición cancelada/no repetir, con razón auditada; DEAD indica presupuesto agotado. No inventar STALLED como estado persistido obligatorio: lease-expired es condición. Scheduler recovery también contabiliza intentos abandonados para evitar loop ilimitado. Al agotar presupuesto por crash, el handler terminal propietario se registra/ejecuta durablemente: media aún vigente pasa a PROCESSING_FAILED con original preservado, export a Fallido y purga sigue pendiente con alerta. Ese resultado también verifica generation/barrera, nunca cambia DELETED/TRASHED/quarantine para reflejar un job antiguo.

DEAD admin: inspeccionar sanitizado, retry manual autorizado crea ejecución/generación auditada con presupuesto nuevo de hasta tres intentos automáticos e historial intacto; nunca dos ejecuciones activas del mismo dedup/resource generation. Cancelación cooperativa marca request; procesos detenidos y escrituras en curso drenadas antes de declarar efectos cancelados. No retirar un job de purga obligatorio dejando recurso protegido indefinidamente: acción admin debe obedecer dominio/plazos; si no puede cancelarse, falla comando. API de cola no permite liberar cuarentena ni reactivar DELETED.

Idempotencia: dedup key evita publicar el mismo job lógico dos veces, pero no asegura exactly-once de efectos. Handler usa generation + receipts/outcomeRefs. Derivados/checkpoints y delete son repetibles. Correo externo puede enviarse y perder ACK: usar provider idempotency cuando haya y message key/ledger; sin ella hay riesgo acotado de duplicado, nunca afirmar entrega exactamente una vez.

## Workers y supervisión

Pools lógicos: multimedia (photo/video, presupuesto separado), email, exports, lifecycle/cleanup. Pueden ser uno o varios procesos/container con routing queue y mismo código; no son microservicios. En Beta **RECOMMENDED:** capacidad API reservada, al menos un proceso worker separado con concurrency multimedia inicialmente baja, y canal/pool ligero de lifecycle/email que no espere detrás de videos/ZIP. Ajustar cantidades tras benchmark; no se fija SKU ni cifra de worker universales.

Límites de CPU/memoria/threads/PIDs/scratch/timeout por job y proceso, conexiones SQL y solicitudes storage acotadas. Evitar reservar lote mayor que slots locales: lease no vence en cola interna mientras otro video procesa. Backpressure/reintentos controlados evitan avalancha. Health process + heartbeat + oldest-job age detectan worker reiniciado pero sin progreso. Scratch nunca canonical permanente; cleanup al salir/reiniciar y watermark evita llenar host. DB caída: suspender nuevas reservas y efectos destructivos, detener output/promotion tras pérdida lease.

Escalar primero pool necesario a otro proceso/host con misma JobQueue; después separar API según latencia/disponibilidad. No Redis; considerar migración si métricas prueban contención SQL/jobs, exceso conexiones/latencia, throughput o coordinación no cubierta por diseño; crear ADR futura y preservar outbox/dedup/fencing.

## Scheduler multi-instancia

Proceso periódico descubre vencimientos por índices en páginas y crea jobs durables: activate, grace, pendingDeletion, purge, avisos, orphan cleanup, export expiry y recover expired leases. Cada schedule lleva resource generation/revisión + dueAt; clave lógica UNIQUE(kind,resource,scheduleRevision,dueAt). Claim bajo row lock/lease SQL; publish + cursor/registro planificado en tx. Múltiples schedulers ven un claim ganador; duplicación residual ejecuta transición idempotente/CAS. No cron singleton como única garantía.

Tras downtime, busca TODO lo vencido hasta now con límites/paginación, no solo último minuto. Transición en worker vuelve a evaluar estado/dueAt/policy actual, no aplica job obsoleto. Avisos antiguos se omiten/agrupan según reglas confirmadas y dedup (80/100%, lifecycle) sin spam. Recalcular TZ/fechas incrementa revisión e invalida calendario pendiente. Acceso API calcula restricciones por fecha vigente aun si scheduler lleva retraso: no admite carga solo porque fila todavía ACTIVE. Suspensión/ancla exacta quedan PL-001/002. Scheduler no ejecuta transcode/ZIP/purga masiva en loop.

## Entrega privada y revocación práctica

Authorize lectura considera actor+owner/event/session, lifecycle/flags, estado media/safety, parent deletion/restricción, variante y purpose. Invitado ve únicamente derivados PUBLISHED con galería habilitada, no original ni exports. Owner puede original seguro según permiso; QUARANTINED no tiene bypass owner. Admin requiere grant justificado y mínimo. Keys impredecibles no son control de autorización.

AQR-001: el `ActorContext`/grant incorpora recovery epoch y auth/access revision; firma/confirm/promotion verifican barreras y watermarks de RecoveryAuthority además de DB. Tras PITR solo scopes con checkpoint ACK reconciliado se habilitan. Emisión/recovery de credenciales no reutiliza secreto/version antiguos del snapshot; QR/PIN y sesiones/recovery tokens revocados siguen cerrados. Grants storage ya emitidos conservan limitaciones bearer y requieren drenaje antes de declarar scope seguro. Contrato completo en operations-and-recovery.

### Evidencia de descarga — AQR-004

MOD-005 registra `export_requested` y `download_grant_issued` sin contarlos como recuperación. Adapter/telemetría de entrega puede producir `read_observed`/`transfer_complete_observed` con object ref/version, request/grant correlation mínima, bytes/rangos y resultado. Señal cliente `client_download_reported_complete` solo informa lo observable del navegador; un enlace nativo no prueba terminación, y no se añade tracking publicitario. Ninguna señal prueba guardado local del archivo.

Agregado owner-event `organizer_recovered_memories` conserva tipo/fortaleza de evidencia y timestamp, sin URL firmada/IP/nombre de archivo. Evidencia técnica recomendada: ≥1 original individual seguro completamente transferido o todas las partes de una export completa transferidas, verificado por adapter (incluidos rangos sin doble conteo). Si solo hay señal cliente, se mantiene como `reported/unverified`, no se suma silenciosamente como observed. Native download sin telemetry es `unknown`, nunca éxito por haber emitido firma. La versión de métrica y cobertura de evidencia se muestran junto a resultados; definición precisa/limitaciones en operations-and-recovery, sin cambiar el objetivo producto≥70%.

**RECOMMENDED parámetros operativos iniciales:** lectura firmada ~5min renovable; write/part grants ~10min con renovación y restricciones. TTL configurable por propósito/tamaño/red y nunca más allá de autorización/ventana export/deadline. Estos valores son objetivos a validar, no decisiones aceptadas de producto. Para video/range y archivos grandes debe poder renovar rango/sesión sin convertir URL en pública. Las URLs se generan on demand, no van en correo si requiere sesión; email puede enlazar al panel autenticado.

Presigned URL es bearer: ya emitida puede funcionar hasta expiry; una descarga iniciada puede continuar aunque venza. [Documentación S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html). Cambiar PIN/QR invalida el enlace de evento y nuevas firmas según policy, pero no garantiza revocar instantáneamente grants anteriores ni bytes ya descargados. PL-003 decide sesiones; PL-010 retiro invalida exports. Si requisito final exige revocación inmediata de lecturas, necesita gateway de entrega privado con comprobación por request/rango y terminación de streams, aceptando coste/throughput; no inventar garantía de URL firmada. Eliminación real del objeto/version elimina futuras lecturas a ese ref donde proveedor lo garantice; cachés/copias del destinatario siguen limitación.

CDN futura opcional con origen privado/signed viewer access, caching auth-safe y purga/TTL que respete cambios; nunca abrir bucket. No introducir CDN MVP obligatoria. Cache-control privada/restrictiva, nosniff, disposition attachment para originales/ZIP, Content-Type real para derivados, referrer restrictivo. Logs no registran query firmada. La compatibilidad y límites de entrega son contract tests de adapter.

## Exportaciones ZIP

Solicitud owner autorizada → tx export+job+audit/idempotency → worker selecciona originales PUBLISHED/HIDDEN conforme `ExportSelectionPolicy` → manifiesto refs exactas/checksums/generation → partes → streaming ZIP64 → storage exports privado → CAS disponibilidad → notification intent → firma al solicitar → expiry/cleanup.

PL-010 sigue decidiendo snapshot al solicitar/preparar e invalidación por retiro/cambio de acceso. Diseño provee manifiesto persistido y membership index media→exports para aplicar esa política, revalidación antes de lectura/promoción/firma y generation que invalida output viejo. No afirmar que snapshot congela autorización: una barrera de seguridad/privacidad prevalece y debe poder detener/promover-invalidate según contrato pendiente. Suspensión/cuenta pendiente se verifica antes de acceso.

~5GB máximo aproximado por paquete configurable, archivos completos de ≤500MB no divididos entre ZIPs, tamaños con overhead ZIP. ZIP64 necesario para paquetes que superen 4GiB. Nombres de entradas sanitizados, mediaId evita duplicado/rutas traversal; manifest sin PII innecesaria. Comprimir razonablemente (JPEG/video ya comprimidos: almacenar) para reducir CPU. `openRead`/rango stream de un objeto a encoder y multipart export con buffer/memoria acotados, nunca 10GB en memoria. Si tool necesita scratch, volumen efímero con presupuesto y reintento; no usa scratch como original permanente.

Cada parte tiene checkpoint status/checksum/key/generation, outputs por intento. Parte válida reuse idempotente; parte fallida se reempaqueta desde inicio (no promete reanudar encoder ZIP arbitrariamente), partes completas no se duplican. Fallo parcial no hace disponible export como completo; estado Fallido/Preparando según retry y UI informa cantidad. CAS final solo cuando todas partes/manifiesto autorizados están completos; lo anterior se limpia si pierde generación. Expiración empieza en available_at y dura48h; firma TTL≤expires_at y permiso vigente; expiry bloquea nuevas firmas y encola cleanup idempotente de todas partes/attempts/multipart. Exports no prolongan retención de originales ni permiten omitir borrado de privacidad.

## Control mínimo de abuso

Scopes exactos en grants, size/checksum/metadata reales, rate límite de firma/partes/confirm/PIN/report, reservas y límite operativo de intents abiertos sin convertirlo en plan por invitado, abort timeout y sweeps de costos. Nombre cliente no define key. CORS storage solo orígenes/métodos necesarios; storage privado/cifrado/TLS, permisos runtime por purpose y sin credenciales del proveedor en browser. Sandbox de parseo/códecs, cuarentena y no lectura normal de sospechosos. Audit firma/admin/moderación/purga sin URL secreta. Detalles de secreto/monitoring en [operations-and-recovery.md](operations-and-recovery.md).
