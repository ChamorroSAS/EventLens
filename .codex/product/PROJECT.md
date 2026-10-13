> **Nota de transición de marca (CR-006, 2026-10-13):** Phoeve es el nombre público elegido para implementación privada; EventLens se conserva como identificador técnico y como denominación histórica de los requisitos a continuación. La revisión registral y el release comercial siguen pendientes.

# EventLens — descubrimiento de producto

## Identification

Fase: descubrimiento completo — READY para `product_planner`.

- **CONFIRMED:** Producto: EventLens.
- **CONFIRMED:** Descubrimiento completo y listo para definición de módulos y épicas para el MVP/BETA.
- **CONFIRMED:** Región y marco jurídico inicial por revisar: Colombia.
- **PENDING:** Propietario de producto y fecha objetivo de lanzamiento.

## Problem

- **CONFIRMED:** EventLens será un producto propio, inspirado funcionalmente en servicios como GUESTPIX, sin intención de reproducirlos.
- **CONFIRMED:** El problema es que los recuerdos quedan dispersos entre WhatsApp, redes y dispositivos, y el organizador no logra recopilarlos.
- **CONFIRMED:** El objetivo principal es capturar la mayor cantidad posible de recuerdos de la forma más sencilla posible.
- **CONFIRMED:** El éxito requiere baja fricción sin app/cuenta, contenido centralizado, galería sencilla, descarga posterior de originales y sin soporte técnico durante el evento.

## Objective

- **CONFIRMED:** Capturar la mayor cantidad posible de recuerdos del evento de la forma más sencilla posible.

## Users / actors

- **CONFIRMED:** Organizador: persona que crea, configura, paga, comparte, gestiona el contenido y cierra/desactiva su evento.
- **CONFIRMED:** Invitado: persona que accede sin registro, acepta condiciones en la primera carga, sube fotos/videos y puede ver la galería si el organizador lo permite.
- **CONFIRMED:** Segmento inicial: personas que organizan sus propios eventos sociales; profesionales, fotógrafos y corporativos quedan fuera del alcance inicial.
- **CONFIRMED:** El organizador modera contenido cotidiano; administración EventLens interviene ante casos graves.
- **CONFIRMED:** Administración/soporte dispone de capacidades operativas, de moderación y de lifecycle delimitadas y auditadas; el acceso a multimedia requiere una justificación operativa.

## Expected outcome

- **CONFIRMED:** Recuerdos centralizados en una galería privada, con descargas posteriores de originales y mínima necesidad de soporte durante el evento.

## Confirmed scope

- **CONFIRMED:** Crear/configurar eventos, compartir enlace/QR, acceso sin registro para invitados, aceptación de condiciones, carga/procesamiento de fotos y videos, galería responsive, panel del organizador, moderación, descargas, vigencia, límites y cierre/desactivación.
- **CONFIRMED:** Formatos: JPEG/JPG, PNG, HEIC/HEIF, WebP; MP4, MOV y WebM. Foto hasta 25 MB y video hasta 500 MB/5 min; configurables por plan.
- **CONFIRMED:** Se conserva el original y se usan derivados para thumbnail, galería, preview/web; solo el organizador descarga originales.
- **CONFIRMED:** Progreso por archivo, reintento automático temporal y manual; el fallo de un archivo no cancela el lote. Se prioriza arquitectura resumable/multipart, especialmente para video.
- **CONFIRMED:** Límite MVP por evento: 1.500 archivos/10 GB, sin límite por invitado. Al alcanzarlo se preserva lo completado, se bloquean nuevas cargas y se notifica.
- **CONFIRMED:** Vigencia de 7/30/90 días; 30 días posteriores a la fecha del evento por defecto. Al vencer se bloquean carga/galería de invitados y el organizador tiene siete días de gracia para descargar.
- **CONFIRMED:** Estados de evento: DRAFT, SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD, PENDING_DELETION, SUSPENDED y DELETED; no existe EXPIRED. SUSPENDED solo lo aplica administración y conserva estado anterior.
- **CONFIRMED:** Zona horaria IANA por evento, con America/Bogota por defecto; las reglas de fecha usan la TZ del evento y timestamps consistentes/UTC.
- **CONFIRMED:** Media sigue estados explícitos, incluidos PROCESSING_FAILED y QUARANTINED; el original se conserva según las reglas de lifecycle.
- **CONFIRMED:** BETA invite-only con email verificado. La aceptación del invitado se versiona; el token anónimo de aportes solo muestra contenido propio y no se recupera automáticamente.
- **CONFIRMED — DEC-065..068/CR-003:** invitación vigente duplicada indica pendiente; correo con cuenta activa y registro repetido pendiente de verificación devuelven la invitación existente conservando su estado y sin duplicar cuenta. Invitación BETA dura siete días desde generación; generar una nueva tras expirar inicia otro plazo de siete días. Verificación, adultez y respuestas públicas sin enumeración siguen siendo obligatorias; duración del token de verificación permanece PENDING técnico independiente.
- **CONFIRMED:** Evento: cancelación de borrado por 72h; cuenta: 7d. Storage principal máximo 7d post-ventana y backups máximo 30d.
- **CONFIRMED:** Descarga total asíncrona de originales PUBLISHED/HIDDEN, enlaces protegidos 48h y ZIPs numerados de aproximadamente 5GB máximo.
- **CONFIRMED:** `uploads_enabled` y `guest_gallery_enabled` son independientes; los invitados solo ven contenido PUBLISHED.
- **CONFIRMED:** Ocultar conserva/restaura; eliminar normal pasa por TRASHED durante siete días. Contenido grave puede evitar la papelera y no ser recuperable.

## Out of scope

- **CONFIRMED:** Funciones sociales, roles adicionales, descarga por invitados, personalización avanzada, funciones profesionales e importaciones no pertenecen al MVP.

## Constraints

- **CONFIRMED:** Mobile-first; navegador sin app; invitados sin registro; no es una red social; privacidad por diseño y control del organizador.
- **CONFIRMED — DEC-061..064/CR-002:** App inicial única; PostgreSQL 16 en contenedor independiente en el mismo servidor durante Beta (DEC-106), media Beta externa compatible S3 y workers async. Entorno local Docker/Compose y MinIO según EL-TD-008. App nunca storage permanente. Beta20–200 invitados/evento, objetivo100 usuarios conectados/cargando; arquitectura separable sin distribución masiva.

## Known integrations

- **CONFIRMED:** EC2 servidor app; DB/storage proveedores pendientes; contratos neutrales ObjectStorage/JobQueue inicial PostgreSQL; Redis no obligatorio.
- **PENDING:** Proveedores, dimensionamiento, herramientas y validación operativa.

## Global NFR

- **CONFIRMED — DEC-062:** Objetivo99,5% mensual sin SLA; PITR DB producción obligatorio, RPO≤1h/RTO≤4h, backup completo diario7d y restauraciones periódicas consistentes. Media con redundancia/recuperación propia independiente de backups DB.
- **CONFIRMED — CR-002:** DEC-061/063 sustituyeron históricamente co-localización DB y media local permanente de DEC-060; DEC-106 permite DB co-localizada sólo durante Beta; storage externo privado, carga directa y confirmación validada; originales/derivados/exports separados lógicamente.
- **CONFIRMED — DEC-064:** Jobs async durables PostgreSQL, hasta3 intentos automáticos/DEAD, recuperación abandonados y administración auditada. TC-001..004 RESOLVED/ACCEPTED. **PENDING implementación:** capacidad/proveedores/leases/scheduler/esperas; validar antes de beta; PL funcionales permanecen.
- **CONFIRMED:** TLS, cifrado en reposo si lo provee el proveedor, URLs privadas/firmadas, IDs impredecibles, autenticación antes del acceso, aislamiento por evento y logs de seguridad.
- **CONFIRMED:** Objetivo normal de procesamiento: foto disponible en galería en menos de 60 s; video reproducible en menos de cinco minutos. Un fallo conserva el original.
- **PENDING:** La redacción legal definitiva y el alcance de moneda/precios requieren trabajos posteriores; no bloquean la planificación del MVP/BETA.
- **CONFIRMED:** WCAG 2.2 AA; últimas dos versiones mayores de Safari iOS/iPadOS, Chrome Android/desktop, Edge, Firefox y Safari desktop, con flujos críticos en dispositivos reales.
- **CONFIRMED:** Monitoreo/alertas básicos de app, frontend, backend, DB, storage, procesamiento y colas; logs técnicos 30 días y auditoría 12 meses, revisables.

## Success metrics

- **CONFIRMED:** Se busca baja fricción, una cantidad significativa de recuerdos centralizados, disponibilidad de descargas de originales y ausencia de soporte técnico durante el evento.
- **CONFIRMED:** BETA de 8 semanas, extensible a 12; mínimo 20 eventos/1000 archivos, cargas >=95%, procesamiento foto >=98% y video >=95%, >=80% sin soporte funcional y >=70% de descarga de organizadores con contenido.

## Milestones / dates

- **PENDING:** No se han definido hitos ni fechas de lanzamiento.

## ID conventions

- **CONFIRMED:** Preguntas: `Q-###`; decisiones: `DEC-###`.
- **CONFIRMED:** Convenciones del repositorio para futuras épicas, tickets y cambios según `AGENTS.md` y las plantillas de producto.

## Pending discovery

- **CONFIRMED — 2026-10-08:** PL-001/002/011/012 y precisiones PL-015/016 respondidas por el usuario; [DEC-077..082](DECISIONS.md) concretan vigencia, suspensión y cuotas. EL-EP-003/011 READY de requisitos, arquitectura verificada y frontend planning PARTIAL; [sesión de revisión](sessions/2026-10-08-vigencia-cuotas.md). PL-005..010 y PL-013/014 tienen respuestas registradas en DEC-085..092; PL-006 y precisiones posteriores respondidas en DEC-096..102 en sus épicas propietarias; no se presume readiness de implementación.
- **PENDING:** Revisión legal profesional previa al lanzamiento público: términos, privacidad, autorización de datos/derechos, retención, reportes y menores.
- **PENDING:** Moneda COP, precios, impuestos, pagos, reembolsos y demás comercialización post-BETA.

## Discovery governance

- **CONFIRMED:** El segmento inicial son organizadores de sus propios eventos sociales; crean y pagan. Invitados sin registro y gratuitos. Profesionales, fotógrafos y corporativos quedan fuera del alcance inicial.
- **CONFIRMED:** MVP: organizador e invitado. El organizador crea/configura, comparte enlace/QR, gestiona/modera y descarga; el invitado carga contenido y ve galería si se habilita.
- **CONFIRMED:** Mobile-first en navegador; espacios privados/no indexables; enlace no adivinable con PIN opcional; invitados no administran contenido ajeno.
- **CONFIRMED:** Publicación automática tras procesamiento por defecto o moderación previa opcional; el organizador puede ocultar/eliminar.
- **CONFIRMED:** MVP incluye eventos, carga/procesamiento de fotos y videos, galería responsive, panel, descargas, vigencia, límites y cierre/desactivación.
- **CONFIRMED:** Quedan fuera del MVP las funcionalidades sociales, roles adicionales, descarga por invitados, personalización avanzada y funciones profesionales.
- **CONFIRMED:** No se crearán épicas, tickets, módulos ni backlog durante esta fase.
- **CONFIRMED:** El organizador puede cambiar/activar PIN, regenerar el acceso público e invalidar inmediatamente el enlace/QR anterior; un nuevo QR se genera para el nuevo acceso.
- **CONFIRMED:** Invitados pueden denunciar contenido; EventLens puede intervenir ante casos graves. No habrá IA avanzada en el MVP; sí validación de tipo real, límites, rate limit y medidas antiabuso.
- **CONFIRMED:** El uploader conserva propiedad y entrega una licencia limitada de servicio, sin publicidad, venta ni entrenamiento sin permiso adicional. Habrá retiro sin cuenta mediante token del mismo dispositivo o solicitud identificando el contenido.
- **CONFIRMED:** Las reglas funcionales y operativas de eliminación y rotación de backups están definidas para el MVP; los periodos jurídicos definitivos requieren revisión legal antes del lanzamiento público.
- **CONFIRMED:** Consola admin MVP permite buscar/consultar eventos, planes, límites, reportes y procesamiento; extender, suspender/reactivar, invalidar acceso, iniciar/cancelar borrado pendiente y ocultar por seguridad. El acceso a media exige justificación.
- **CONFIRMED:** BETA: cuentas autorizadas, sin pago automático; administración asigna planes, vigencia, límites y overrides separados con razón y auditoría.
- **CONFIRMED:** Alcance inicial: Colombia y español, con arquitectura i18n-ready. Organizadores adultos; producto no dirigido a menores; revisión legal previa al lanzamiento público.s

## Naming conventions

### Identificadores

- Project code: `EL`
- Module prefix: `MOD`
- Epic prefix: `EL-EP`
- Ticket prefix: `EL-TK`
- Change request prefix: `EL-CR`
- Product decision prefix: `DEC`
- Architecture decision prefix: `ARCH`

### Formato

Módulos:
`MOD-001`

Épicas:
`EL-EP-001`

Tickets:
`EL-TK-001`

Change Requests:
`EL-CR-001`

Decisiones:
`DEC-001`

Decisiones arquitectónicas:
`ARCH-001`

**Gate UI actual - 2026-10-08:** [matriz vigente](../context/ui-mvp-epic-review.md), [gate intake](sessions/2026-10-08-removal-intake.md). Todas16 MVP READY de requisitos; 15 UI requeridas UX READY,016 NOT_REQUIRED. PL-024..026 respondidas DEC-103..105. Frontend001015 PARTIAL tecnico localizado. EL-EP-017 juridico publico pendiente. Sin tickets/codigo.
