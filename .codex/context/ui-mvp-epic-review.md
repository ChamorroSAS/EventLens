# EventLens — reevaluación UI/UX de épicas MVP

Fecha: 2026-10-08. Handoffs read-only de ui_designer incorporados por el orquestador autorizado. Alcance: EL-EP-001..016, incluida evaluación Beta P1; EL-EP-017 es el gate jurídico de apertura pública, fuera de esta matriz MVP. Sin tickets, código, nuevos requisitos aprobados ni selección de tecnologías.

## Matriz de readiness

| Epic | PRODUCT_READINESS | UI_REQUIRED | UX_READINESS | READY_FOR_TICKET_WRITING | Principales faltantes |
| --- | --- | --- | --- | --- | --- |
| EL-EP-001 | READY | YES | READY | PARTIAL | Política técnica de contraseña/tokens; gates localizados de validación y copy contractual. |
| EL-EP-002 | READY | YES | READY | YES | Handoff incorporado: configuración, preview, DST y portada segura. |
| EL-EP-003 | READY | YES | READY | YES | Handoff incorporado: lifecycle e integración de acciones por propietario. |
| EL-EP-004 | READY | YES | READY | YES | Intake DEC-103..105 y gates finales aprobados; sin bloqueos funcionales/UX. |
| EL-EP-005 | READY | YES | READY | YES | Handoff incorporado: confirmación, resultados parciales y permisos de retry. |
| EL-EP-006 | READY | YES | READY | YES | Separar elegibilidad de retry y descarga; corrección del catálogo. |
| EL-EP-007 | READY | YES | READY | YES | Handoff incorporado: galería/viewer responsive y pérdida de disponibilidad. |
| EL-EP-008 | READY | YES | READY | YES | Handoff incorporado: papelera/restauración y acciones según estado vigente. |
| EL-EP-009 | READY | YES | READY | YES | Campos, validación condicional y declaración aprobados; sin recuperación de sesión ni seguimiento público. |
| EL-EP-010 | READY | YES | READY | YES | Handoff incorporado: snapshot, partes, expiración e invalidación. |
| EL-EP-011 | READY | YES | READY | YES | UX ya definida; sincronizar referencias obsoletas del catálogo. |
| EL-EP-012 | READY | YES | READY | YES | Consola/consulta propias listas; cada acción incrustada conserva gate de su dueño. |
| EL-EP-013 | READY | YES | READY | YES | Handoff incorporado: avisos contextuales y correo, sin bandeja adicional. |
| EL-EP-014 | READY | YES | READY | YES | UI limitada a consulta de auditoría; sin dashboard operativo obligatorio. |
| EL-EP-015 | READY | YES | READY | PARTIAL | Challenge/condiciones concretas de reautenticación requieren contrato técnico. |
| EL-EP-016 | READY | NO | NOT_REQUIRED | YES | Informe/evidencia operativa; no requiere pantalla nueva. |

Las reglas aceptadas del [gate funcional previo](../product/sessions/2026-10-08-precisiones-finales-mvp.md) se conservan. PL-024..026 respondidas en DEC-103..105; requisitos y UX del intake aprobados en [sesión final](../product/sessions/2026-10-08-removal-intake.md). EL-EP-004/009 vuelven a READY de requisitos y UX. Los gates anteriores se conservan como historia; PARTIAL es un eje de readiness, no un estado canónico nuevo.

YES de ticket writing significa suficiencia de requisitos/UX para el alcance indicado, sujeto a contratos/gates técnicos aplicables, no ejecución ni lanzamiento. Se reutiliza READY_FOR_FRONTEND_PLANNING: YES para UX READY sin bloqueo técnico material; PARTIAL solo para gates técnicos localizados 001/015. No se crea una segunda máquina de metadata: UX_READINESS y PRODUCT_READINESS de esta matriz leen gates existentes. No generar frontend de una épica con gate PARTIAL; backend independiente puede avanzar si sus propios contratos/requisitos están cerrados.

## Fuentes y precedencia

- [Catálogo](ui-components.md) es la única fuente de nombres/responsabilidades/clasificaciones de componentes; [dirección visual](ui-design-system.md) posee tokens/principios; [flujo invitado](ui-guest-flow.md) posee la secuencia base.
- [Technical Baseline](technical-baseline.md) posee EL-TD-001..007. Angular/TypeScript y cliente OpenAPI se respetan; no se prescribe implementación.
- Épicas actuales, [DECISIONS](../product/DECISIONS.md), [CONVENTIONS](../product/CONVENTIONS.md), [BACKLOG](../product/BACKLOG.md) y handoff existente [capacidad/lifecycle](ui-capacity-lifecycle.md).
- system-overview, architecture-decisions y api-conventions se consultan para permisos, revocación, estados asíncronos y límites. Sus referencias antiguas a PL cerradas no reabren DEC-077..102. Los documentos protegidos permanecen intactos; reconciliación puntual recomendada en el handoff previo, sin cambio arquitectónico.
- Pantallas y estados específicos antes estaban mayormente descritos como principios generales. Este documento completa su especificación; no afirma que estuvieran diseñados o implementados antes de la revisión.

## Contrato compartido de interacción

Aplicable a todas las épicas YES, junto con sus variantes específicas:

- Happy path: acción principal, precondiciones, confirmación real y salida/cancelación explícitas. Envío no equivale a resultado físico completado.
- Loading: estado ocupado, prevenir doble envío, no cero/vacío falso. Empty: distinguir sin datos, sin coincidencias y acceso restringido.
- Error/retry: mensaje comprensible y entradas preservadas; reintentar solo con permiso vigente. Tratar rate limit, sesión/credencial expirada y conflicto sin filtrar datos ajenos, secretos ni investigación.
- Partial success: señalar qué se confirmó, qué sigue pendiente y qué falló. No inventar operaciones batch para justificarlo; marcar no aplicable en acciones atómicas.
- Permission denied/read-only: acciones autorizadas del servidor; explicar restricciones sin revelar recursos ajenos. No deducir autorización del color/estado local ni de una reserva de capacidad.
- Destructive confirmation: recurso, alcance y consecuencia visibles antes de confirmar. Cancelar antes del comando conserva recurso; no ofrecer undo de retiro irreversible ni cancelación después de claim/ventana vencida.
- Timeout/expired: separar sesión, token, firma temporal, ventana del paquete y ventana cancelable. Volver a autorizar antes de reintentar; no reutilizar credenciales revocadas.
- Mobile: orden vertical, selector nativo de archivos, controles amplios y formularios sin scroll horizontal; BottomSheet cuando sea apropiado. Tablet: mismo orden, agrupación/columnas cuando el espacio lo permita. Desktop: Modal, filtros persistentes y tablas accesibles opcionales; no diseñar páginas adicionales por cada confirmación. Breakpoints/valores cosméticos siguen PROPOSED; styling/librerías/iconos DEFERRED.
- WCAG 2.2 AA: teclado completo y foco visible/no oculto; labels/errores asociados; headings/listas/tablas semánticos; nombres de iconos contextuales; touch targets conforme criterio aplicable; no color único. Overlays contienen y devuelven foco. Actualizaciones no roban foco; anuncios de cambios significativos, sin cada porcentaje/tick. Reduced motion, controles de video operables y sin autoplay obligatorio. Contraste de combinaciones finales debe verificarse; un token no garantiza contraste para cualquier uso.
- Dirección visual vigente: móvil prioritario, cálido/social y elegante/premium, claro Beta, primary azul profundo, coral acento, Manrope UI. No se modifican tokens ni tipografía.

### Clasificación y madurez

GENERIC_UI: controles, campos, listas/tablas, navegación, overlays, confirmación y feedback de §4 del catálogo. Reutilización sin promover madurez global.

PRODUCT_COMPONENT: formularios/acciones de invitado, configuración, moderación, exportación, invitaciones y administración con ownership de su épica. CROSS_CUTTING_PRODUCT_COMPONENT: LegalFooter, LegalDocumentLink, PrivacyNotice, RetentionNotice, RemovalPolicyNotice, EventAccessStatus, EventStatusBadge, EventLifecyclePanel, StorageUsage, FileUsageSummary, UsageLimitAlert, AdministrativeActionReason, AuditLogViewer, AuditLogDetail, InAppNotice y EmailNotificationTemplateSpec. LoginForm/SecurityNotice pueden reutilizarse entre identidades sin crear AdminLoginForm. AdminUsageOverrideForm continúa PRODUCT_COMPONENT, no se reclasifica como genérico por estar en consola.

Extensiones de este handoff: DESIGNED, salvo alcances UX dictaminados READY_FOR_IMPLEMENTATION; no certifica implementación ni promueve todo el catálogo. RemovalRequestFlow para retiro propio y solicitud sin sesión pasa READY_FOR_IMPLEMENTATION UX tras DEC-103..105; no incluye una variante de adjuntos no diseñada. Formularios de contraseña y challenge sensibles esperan contrato técnico. Se conserva READY_FOR_IMPLEMENTATION UX de ExtensionRequestForm, ExtensionRequestStatus y AdminUsageOverrideForm. No hay nuevos componentes/tokens; ajustes cosméticos concretos pueden seguir PROPOSED.

## EL-EP-001

ACTOR: adulto invitado y administración autorizada. USER GOAL: cuenta verificada y control de sesiones. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: enlace invitación/login; invitación utilizable del mismo correo y declaración adulta; administración autenticada para gestionar invitaciones.

FLOWS: invitación → registro → verificación; login → recuperación → nueva contraseña; cuenta → sesiones → cerrar actual/seleccionada/demás; admin → invitar/consultar/revocar no usada. No invitados ven mensaje neutro y solicitud opcional conforme contrato existente. Registro repetido conserva credenciales, sin reenvío automático. Solicitudes administrativas son lectura; no inventar aprobación/activación desde AccessRequestDetail.

SCREENS: superficie autenticación con propósito/formulario/feedback/alternativa; registro correo/contraseña/declaración adulta, «Crear cuenta»; verificación pendiente y reenvío permitido; login «Iniciar sesión»/«Olvidé mi contraseña»; recuperación correo y resultado neutro; reset contraseña conforme política, sin autologin inventado; sección sesiones con actual diferenciada; listas/detalle administrativo contextual.

REUSED_COMPONENTS: BetaInviteForm, BetaInviteList, BetaInviteStatusBadge, RevokeInviteDialog, AccessRequestForm, AccessRequestList, AccessRequestDetail, OrganizerRegistrationForm, EmailVerificationState, LoginForm, ForgotPasswordForm, ResetPasswordForm, SessionList, SessionItem, SignOutOtherSessionsAction, SecurityNotice, LegalFooter/LegalDocumentLink y GENERIC_UI. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: formularios/estados de invitación y verificación, sesión actual y expiración, DESIGNED.

STATES COVERED: contrato común; lista vacía, cuenta pendiente, invitación siete días vs tokens con vigencia técnica propia; credenciales inválidas neutras, reenvío limitado, no recepción de correo prometida. Confirmación de revocación/cierre explicita alcance. Partial: registro pendiente no significa cuenta activa.

RESPONSIVE/ACCESSIBILITY: contrato común; permitir gestores de contraseñas y pegar; sin retos cognitivos nuevos; labels/autocomplete apropiados y mensajes públicos neutros también para screen reader.

UX_OPEN_QUESTIONS: ninguna funcional. DEPENDENCIES: architect/planner concreta política de contraseña/tokens que TK-019 mantiene PENDING; no seleccionar por UI. UX_READINESS: READY; READY_FOR_TICKET_WRITING: PARTIAL localizado a formularios sensibles.

DOCUMENTATION_UPDATES_RECOMMENDED: referencia desde épica y catálogo §10; no modificar tickets existentes ni añadir fecha nacimiento/documento/teléfono.

## EL-EP-002

ACTOR: organizador propietario; admin corrige excepcionalmente. USER GOAL: preparar borrador privado. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: dashboard/evento propio, cuenta activa; preview privado owner.

FLOWS: crear con nombre → configurar básicos/portada/programación/carga-galería independientes/moderación/PIN inicial → guardar → preview privado. Fecha no obligatoria para crear; portada asignada solo cuando segura/lista. Admin corrige TZ con motivo según permiso.

SCREENS: CreateEventForm contextual «Crear borrador»/«Cancelar»; configuración con nombre/estado, EventSettingsNav y formulario sección; preview reutiliza shell invitado con «Vista previa privada. El evento aún no está publicado», sin sesión/carga/consentimiento real. Fecha/hora/TZ, bienvenida, switches, modo y PIN siguen campos/reglas aprobados; no nuevo editor de recorte.

REUSED_COMPONENTS: OrganizerAppShell, OrganizerDashboard, EventCard, EventList, CreateEventForm, EventBasicInfoForm, EventCoverUploader, EventScheduleForm, EventAccessSettings, EventGuestSettings, ModerationSettings, EventSettingsNav, shell/cover/header/acciones invitado y AdministrativeActionReason; DatePicker/TimePicker/TimezoneSelect/PinInput. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: preview privado, portada segura/fallo-preserva-vigente, programación offsets/read-only, DESIGNED.

STATES COVERED: contrato común; draft sin fecha/portada, hora inexistente con error; hora repetida exige offset explícito aprobado, TZ SCHEDULED conserva hora local y advierte recálculo; PIN inicial seis dígitos/ceros/pegar sin mostrar guardado; campos owner read-only tras ACTIVE. Guardar sección no implica que otra se guardó; fallo portada conserva vigente.

RESPONSIVE/ACCESSIBILITY: contrato común; secciones verticales móvil, navegación accesible tablet/desktop; offset con fecha/TZ textual; preview nombrado y foco estable al actualizar portada.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: referencias §5.1/7.5..12 al alcance, sin duplicar formularios ni reglas.

## EL-EP-003

ACTOR: organizador, admin e invitado según autorización. USER GOAL: entender/controlar apertura, cierre y disponibilidad. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: detalle o entrada guest; acciones vigentes del servidor.

FLOWS/SCREENS: LifecyclePanel en detalle: nombre/estado → inicio/TZ/vencimiento/gracia → acción → consecuencia. DRAFT programar; SCHEDULED activar antes sin mover ancla; ACTIVE cerrar confirmado; CLOSED reabrir si permitido; GRACE descargas/solicitud; SUSPENDED consulta, admin con motivo/reactivación recalculada; PENDING_DELETION variante de causa; DELETED terminal. Invitado muestra disponibilidad autorizada, preservando excepción Mis aportes de DEC-084; cancelación de upload se comunica en cola EL-EP-005.

REUSED_COMPONENTS: EventLifecyclePanel, EventStatusBadge, EventAccessStatus, EventLifecycleAction, EventCloseDialog, EventGracePeriodBanner, EventScheduleForm, SuspendEventDialog/ReactivateEventDialog; ampliación EL-EP-011, export EL-EP-010 y borrado EL-EP-015 por referencia. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: integración de estados/acciones vigentes, DESIGNED; no panel lifecycle paralelo.

STATES COVERED: contrato común; DRAFT incompleto, conflicto temporal, success confirmado, transiciones automáticas sin robar foco; no estado EXPIRED ni porcentaje ficticio. Consulta de lifecycle no se bloquea por un formulario de retiro independiente.

RESPONSIVE/ACCESSIBILITY: contrato común; fechas/TZ además de contador, no announce cada segundo; foco estable al vencer acción.

UX_OPEN_QUESTIONS: ninguna propia. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: actualizar razón antigua de PARTIAL en handoff; acciones sensibles conservan gate técnico de su propietario.

## EL-EP-004

ACTOR: invitado; owner configura acceso. USER GOAL: entrar, consentir, identificar aportes y consultar contenido propio sin cuenta. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: QR/enlace vigente, evento y sesión autorizados. Consentimiento/identidad antes de primera carga; no añadirlos como requisito para mirar galería si policy no lo exige.

FLOWS: entrada → PIN si habilitado → acciones; cargar → ConsentSheet → nombre/apodo → selección EL-EP-005; Mis aportes → contenido propio/retiro EL-EP-009, incluso CLOSED/GRACE/galería apagada; sesión perdida → solicitud identificada sin recuperar token; owner comparte/cambia PIN/regenera con confirmación de revocación.

SCREENS: entrada con cover/header/mensaje, acceso/acciones y LegalFooter; consentimiento explicación/enlaces versionados/aceptación explícita «Aceptar y continuar», cancelar sin carga; identidad «¿Quién aporta?»/«Nombre o apodo»/«Continuar»; Mis aportes lista; compartir dentro del evento. No teléfono/correo para identidad guest ni mostrar PIN almacenado.

REUSED_COMPONENTS: EventGuestPageShell, EventCover, EventHeader, EventWelcomeMessage, GuestPrimaryActions, PinAccessForm, ConsentSheet, GuestIdentityForm, GuestIdentitySummary, MyContributionsList, MyContributionItem, EventAccessSettings, EventSharePanel, QRPreview, CopyEventLinkAction, RegenerateAccessDialog y legales. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: disponibilidad diferenciada, confirmación revoca sesiones, DESIGNED; RemovalRequestFlow comparte intake DEC-103 y precisiones PL-025/026.

STATES COVERED: contrato común; PIN incorrecto/rate limit, enlace/sesión revocados, aún no inicia, Mis aportes vacío, conflicto y éxito copiar/configurar confirmado. No prometer revocación universal de URLs/bytes ni nuevo reconsentimiento obligatorio por cada versión sin regla aprobada.

RESPONSIVE/ACCESSIBILITY: contrato común; PIN con label/pegar/ceros, sin NumberInput; aceptación no preseleccionada y leer no equivale a aceptar.

UX_OPEN_QUESTIONS: ninguna funcional tras DEC-103..105 y gates finales; entrada/consentimiento/identidad/consulta/retiro especificados. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§5.6..10/18..19 y 7.20..23 por referencia.

## EL-EP-005

ACTOR: invitado autorizado. USER GOAL: subir lote con recuperación por archivo conservando confirmados. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: flujo de carga; sesión, consentimiento, identidad y capacidad autorizados.

FLOWS/SCREENS: selección múltiple → resumen/validación individual → «Cargar archivos» → cola/progreso → resultado total/parcial. Son estados del mismo flujo. Archivo fallido no cancela resto; retry solo elegibles; cierre/revocación cancela no confirmados y conserva confirmados. Evento/identidad → cantidad/límites → filas con nombre seguro/tipo/estado/progreso → acción.

REUSED_COMPONENTS: FilePicker, UploadSelectionSummary, UploadFileItem, UploadQueue, UploadProgressSummary, UploadRetryAction, UploadCompletedState, GuestIdentitySummary, FileThumbnail, FileTypeIcon, FileDropzone desktop opcional, UsageLimitAlert de EL-EP-011. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: «Confirmando carga», cancelación por policy y resultado parcial, DESIGNED.

STATES COVERED: contrato común; sin selección, formato/tamaño/duración inválidos individualmente, esperando/autorizando/subiendo/confirmando/recibido/procesando; offline/retry/cuota/sesión/permiso; «X archivos recibidos; Y requieren atención». 100% no prueba aceptación/publicación. No añadir botón cancelar upload ni prometer resume universal tras cerrar navegador.

RESPONSIVE/ACCESSIBILITY: selector nativo y filas verticales móvil; tablet/desktop espacio para tamaño/progreso y dropzone opcional. ProgressBar solo si medible, indeterminado textual en confirmación/proceso; acciones y anuncios por archivo/lote sin spam.

UX_OPEN_QUESTIONS: ninguna de producto; reanudación técnica por architect/planner. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§5.11..17 referencia al alcance.

## EL-EP-006

ACTOR: organizador y admin autorizado. USER GOAL: entender proceso/fallo y recuperar técnicamente sin evadir seguridad. UI_REQUIRED: YES, por estado visible y retry manual.

ENTRY/PRECONDITIONS: biblioteca/detalle autorizado, seguridad y permisos actuales.

FLOWS/SCREENS: biblioteca compartida → detalle → ProcessingFailedPanel o QuarantinedMediaState → solicitar nuevo ciclo permitido → estado eventual. Admin cuarentena en consola, sin liberar/reintentar por owner. No pantalla por job.

REUSED_COMPONENTS: OrganizerMediaCard, OrganizerMediaLibrary, ProcessingFailedPanel, RetryProcessingAction, QuarantinedMediaState, MediaStatusFilter, StatusIndicator y DownloadOriginalAction cuando elegible. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: retry/descarga con elegibilidades separadas, DESIGNED: DEC-075 exige APPROVED para descarga; DEC-076 puede repetir inspección inconclusa en nuevo ciclo elegible. QUARANTINED no tiene retry/liberación owner.

STATES COVERED: contrato común; UPLOADED/PROCESSING/PROCESSING_FAILED, inspección pendiente/inconclusa/aprobada, cuarentena read-only, derivados parciales, revisión/publicación; comando aceptado no prueba proceso exitoso. «No pudimos preparar la vista. El original se conserva». DEAD de job no nuevo estado media.

RESPONSIVE/ACCESSIBILITY: panel apilado móvil, lateral desktop opcional; estado legible sin preview, retry nombrado por archivo, anuncios sin mover foco.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY tras corrección catálogo. DOCUMENTATION_UPDATES_RECOMMENDED: corregir §8.10/11; tickets existentes permanecen intactos.

## EL-EP-007

ACTOR: invitado y owner. USER GOAL: visualizar contenido autorizado en móvil. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: acción galería o biblioteca propia, permisos vigentes.

FLOWS/SCREENS: galería header/grid → siguiente bloque con Button y paginación contratada → viewer imagen/video/anterior/siguiente/reportar/cerrar. Owner biblioteca con filtros y detalle/acciones de sus propietarios. No galería de moderación adicional.

REUSED_COMPONENTS: Gallery, GalleryMediaCard, GalleryViewer, GalleryEmptyState, GalleryDisabledState, shell/Header/EventAccessStatus, OrganizerMediaLibrary, OrganizerMediaCard, OrganizerMediaTable opcional/MediaStatusFilter, Image/VideoPlayer/MediaViewer, ReportContentAction. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: viewer no disponible/error/retry/foco y carga incremental, DESIGNED.

STATES COVERED: contrato común; vacío publicado distinto de galería apagada; bloque incremental falla sin borrar resultados; derivado falla/retry autorizado; acceso revocado/media retirada al estar abierta. No conteos privados de pendientes/ocultos ni guest downloads; no prometer borrar cachés/bytes ya recibidos.

RESPONSIVE/ACCESSIBILITY: grid móvil a más columnas tablet/desktop con mismo orden; viewer dentro viewport con controles visibles, teclado/Escape/anterior/siguiente sin exigir swipe; foco vuelve tarjeta; nombres contextuales/alt útil cuando exista, sin inventar generación de descripciones.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§5.20..24/8.1..4; patrón responsive/carga definido aquí sin tokens/librerías.

## EL-EP-008

ACTOR: owner, admin autorizado. USER GOAL: moderar y restaurar papelera sin evasión. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: biblioteca/estado/acción vigentes.

FLOWS/SCREENS: biblioteca única: pendiente aprobar/rechazar, publicado ocultar, oculto publicar, elegible a TrashMediaDialog; restaurar ventana vigente como estado previo. ModerationSettings explica pendientes existentes/trabajos que finalizan, DEC-087.

REUSED_COMPONENTS: OrganizerMediaLibrary, OrganizerMediaCard, OrganizerMediaTable/MediaStatusFilter, MediaModerationActions, HideMediaDialog, RejectMediaDialog, TrashMediaDialog, RestoreMediaAction, ModerationSettings, RetentionNotice y confirmación genérica. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: elegibilidad DEC-096 y copy estado previo/ventana, DESIGNED.

STATES COVERED: contrato común; sin media/sin resultados/papelera vacía; solicitud pendiente/éxito; read-only/bloqueo de seguridad/retiro, ventana vencida/ya purgado y conflicto. «Mover a papelera» explica no visible/exportable, restaurable siete días y consumo hasta borrado físico; «Restaurar como pendiente de revisión» cuando corresponda. No batch nuevo ni publicación automática al restaurar.

RESPONSIVE/ACCESSIBILITY: filtros compactos/cards móvil, tablet agrupa, desktop filtros persistentes/tabla opcional; confirmación sheet/modal, fecha y estado textuales, devolución foco al archivo.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§8.5..9/7.11 por referencia, precedencia DEC-096 sobre inventario antes pendiente.

## EL-EP-009

ACTOR: invitado/reportante y admin autorizado. USER GOAL: reportar o retirar sin cuenta, distinguiendo recepción de resolución. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: report desde media visible, retiro propio desde Mis aportes/sesión; sin sesión, ruta identificada desde información legal sin exponer galería privada.

FLOWS/SCREENS: ReportContentDialog motivos catálogo → «Reporte recibido»; propio → ConfirmDialog en RemovalRequestFlow → «Retirar definitivamente mi aporte»/«Cancelar» antes del comando, irreversible después; sin sesión → misma variante intake revisada de DEC-103 → «Solicitud recibida para revisión»; admin ReportQueue/Detail → justificación antes de acceder media → clasificar/decidir/registrar resultado. Denuncia grave no autooculta. Correo de contacto obligatorio exclusivamente en intake sin sesión; no recuperación/asunción de sesión ni seguimiento público.

### Intake sin sesión — DEC-103

Jerarquía: referencias evento/contenido → motivo y descripción cuando proceda → correo de contacto → datos opcionales → declaración → «Enviar solicitud»/«Cancelar». Formulario contextual del mismo RemovalRequestFlow, sin wizard nuevo ni página por campo.

| Campo | Obligatoriedad | Controles existentes |
| --- | --- | --- |
| Referencia del evento | Obligatorio | FormField + TextInput |
| Referencia del contenido/medio | Obligatorio | FormField + TextInput |
| Motivo | Obligatorio | RadioGroup/controles de motivos existentes |
| Correo electrónico de contacto | Obligatorio | TextInput con semántica email |
| Declaración pertinente | Obligatoria, misma para todos los motivos: buena fe y datos correctos, DEC-105 | FormField + Checkbox no preseleccionado; no acredita titularidad ni recupera sesión |
| Descripción | Obligatoria para Otro; opcional para demás motivos, DEC-104 | TextArea, etiqueta/validación actualizada según motivo |
| Nombre del solicitante | Opcional | TextInput |
| Pruebas de respaldo | Opcionales | Controles existentes según contrato; sin inferir uploader/adjuntos |

Reutilizar referencias del contexto autorizado cuando exista; no listar ni previsualizar media privada para ayudar a quien carece de sesión. Correo de contacto no demuestra titularidad ni permite recuperar/reconstruir/asumir sesión previa. No añadir verificación de correo, eliminación automática o consulta pública del caso.

Loading «Enviando solicitud…», impedir doble envío. Recepción «Solicitud recibida para revisión», nunca «Contenido eliminado». Error temporal/offline preserva entradas y permite retry autorizado; rate limit muestra espera vigente. Timeout con resultado desconocido sigue contrato idempotente, sin afirmar fracaso/resolución. Validación pública no revela existencia privada. Evidencia opcional nunca condiciona enviar.

Mobile: campos apilados y CTA visible con teclado; tablet mismo orden, desktop ancho legible. BottomSheet solo si el formulario completo resulta manejable, no overlay largo obligatorio. Labels obligatorio/opcional, errores asociados y resumen enfocable; email con propósito/autocomplete; declaración no preseleccionada; condición de descripción comunicada textualmente sin robar foco; anuncios de envío/recepción sin color único.

REUSED_COMPONENTS: ReportContentAction, ReportContentDialog, RemovalRequestFlow/RemovalPolicyNotice, LegalFooter/PrivacyNotice/MyContributionItem, AdminModerationPanel, ReportQueue, ReportDetail, ReportSeverityBadge, AdministrativeActionReason y auditoría. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: variantes retiro propio/sin sesión en mismo componente; ReportDetail acceso justificado, DESIGNED. RemovalRequestFlow READY_FOR_IMPLEMENTATION para el alcance UX documentado: campos, permisos/variantes, estados, copy esencial, responsive y accesibilidad completos. No certifica código/pruebas ni variante de adjuntos no diseñada.

STATES COVERED: contrato común; envío recibido vs resuelto, error/rate limit preserva entrada, permiso/sesión vence antes irreversible, ya retirado/conflicto, cola vacía/caso resuelto, contenido no disponible. «Se retirará de visibilidad al confirmar. No podrás restaurarlo»; no promesa de recuperar originales ya exportados.

RESPONSIVE/ACCESSIBILITY: sheet reporte/retiro móvil e intake vertical, Modal desktop; consola lista/detalle, motivos RadioGroup etiquetado, foco en consecuencia destructiva y errores asociados, no preview sensible en listado.

UX_OPEN_QUESTIONS: ninguna funcional del intake tras DEC-103..105; gate final aprobado en sesión intake. UX_READINESS: READY. Texto jurídico final conserva Q-029 y no se presenta como aprobación legal. Validación: Otro exige descripción, resto permite omitirla; referencias/motivo/correo/declaración siguen obligatorios. Declaración nunca preseleccionada, misma afirmación funcional para todos los motivos; no atribuye propiedad ni autoriza recuperación de sesión. No imponer formato de pruebas de respaldo por inferencia. DOCUMENTATION_UPDATES_RECOMMENDED: §§5.26..27/12.11..15 refieren el mismo handoff; PL-024..026 respondidas y reutilizadas por EL-EP-004.

## EL-EP-010

ACTOR: owner. USER GOAL: recuperar originales autorizados. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: biblioteca/detalle; permiso/estado/seguridad actuales, nunca descarga guest o cuarentena.

FLOWS/SCREENS: individual «Descargar original» → grant; total ExportRequestDialog resumen PUBLISHED/HIDDEN elegibles/exclusiones → «Preparar descarga» → status/partes/expiración en biblioteca. Snapshot al solicitar, revalidación preparación/descarga. Disponibilidad de partes según contrato autorizado y ARCH-009; no deducir disponibilidad por existencia de un archivo parcial. Expirado/fallo/invalidez ofrecen alternativa autorizada, no resurrección de paquete.

REUSED_COMPONENTS: DownloadOriginalAction, DownloadAllAction, ExportRequestDialog, ExportStatus, ExportProgress, ExportPackageList, ExportExpiryNotice, ExportFailedState, biblioteca y feedback genérico. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: invalidez como motivo de no disponibilidad, partes numeradas/tamaño/fechas, DESIGNED; no nuevo estado dominio ni ExportCenter.

STATES COVERED: contrato común; ninguno elegible; solicitud/preparing/available/failed/expired distintos; firma breve vs paquete48h; progreso solo real; solicitud exitosa no transferencia completa/guardado local. Retiro/revocación invalida; no afirmar bytes recuperados. Preparación y disponibilidad se muestran según contrato vigente, sin nueva política definida por UI.

RESPONSIVE/ACCESSIBILITY: lista partes móvil/tablet, tabla opcional desktop; números/tamaños/nombres y fecha/TZ textuales, anuncios discretos. «Estamos preparando tus archivos»; no «Guardado en tu dispositivo» por firma.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §9 refiere snapshot/invalidez/expiración y distingue telemetría de transferencia.

## EL-EP-011

ACTOR: owner y admin. USER GOAL: comprender capacidad y solicitar/asignar ampliación trazable. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS/FLOWS/SCREENS: especificación completa en [handoff de capacidad](ui-capacity-lifecycle.md#el-ep-011--capacidad-consumo-y-ampliaciones): consumo/reservas → solicitud GB/días adicionales y motivo → única abierta/seguimiento/info requested/respuesta pending; admin actuales/base/propuestos, totales/ancla/motivo, retorno confirmado y reducción pasada denegada.

REUSED_COMPONENTS: StorageUsage, FileUsageSummary, UsageLimitAlert, ExtensionRequestForm, ExtensionRequestStatus, AdminUsageOverrideForm, AdministrativeActionReason/auditoría y GENERIC_UI NumberInput/RadioGroup/TextArea/ConfirmDialog. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: preservar madurez UX aprobada de formularios; resúmenes DESIGNED.

STATES COVERED: contrato común y handoff; cero/80–100%/reducción bajo consumo/reservas, solicitudes estados distintos, envío/error/respuesta/historial/denegación temporal-concurrente. No override exitoso parcial que parezca persistido.

RESPONSIVE/ACCESSIBILITY: métricas/formularios apilados, tablet mismo orden, desktop valores base/actual/propuesto agrupados; unidades/barras accesibles, avisos sin spam, historial sin foco robado.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: corregir referencias obsoletas §§7.27/7.28/12.7, sin copiar el handoff completo.

## EL-EP-012

ACTOR: admin autorizado. USER GOAL: localizar situación e intervenir con justificación/alcance. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: sesión administrativa y permisos vigentes; no impersonación ni self-service de roles.

FLOWS/SCREENS: búsqueda/resultados sin media → detalle evento/propietario/fechas/plan/consumo/reportes/jobs/auditoría → motivo y autorización antes de inspeccionar media → acción válida/consecuencias/confirmar → resultado actual. JobDetail sanitizado → retry/cancel/marcar no repetir según contrato; ConfirmDialog único, no página/diálogo nuevo por tipo. Invitaciones/reportes/overrides se reutilizan desde sus dueños.

REUSED_COMPONENTS: AdminAppShell, AdminEventSearch, AdminEventResult, AdminEventDetail, AdminOrganizerSummary, SuspendEventDialog/ReactivateEventDialog/InvalidateEventAccessDialog, AdminModerationPanel, JobQueueSummary, JobDetail, RetryDeadJobAction; componentes compartidos lifecycle/capacidad/motivo/auditoría y GENERIC_UI. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: detalle sin preview previo, acceso justificado, diagnóstico y conflictos, DESIGNED; no promover acciones propietarias bloqueadas.

STATES COVERED: contrato común; búsqueda/cola vacías, detalle parcialmente disponible sin cero falso, permiso/reauth/autorización media vencidos, conflicto recurso actual; «Acción registrada» no purga físicamente terminada. Cancelar conserva estado. READ_ONLY y disabled explican restricción.

RESPONSIVE/ACCESSIBILITY: cards/acciones contextuales móvil, tablet dos columnas manteniendo lectura, desktop sidebar/resultados tabulares/panel; motivo/error asociado, tabla con headers, focus return, acciones nombradas por recurso.

UX_OPEN_QUESTIONS: ninguna propia; acciones incrustadas conservan gates propietarios. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§12.5/12.15/12.19 refieren contrato, no duplicar políticas de otros dominios.

## EL-EP-013

ACTOR: owner; admin receptor autorizado. USER GOAL: conocer hitos/riesgos y acción útil. UI_REQUIRED: YES por avisos panel/correo visibles.

ENTRY/PRECONDITIONS: panel o correo; hechos confirmados y enlaces reautorizados.

FLOWS/SCREENS: aviso contextual título/hecho/fecha/consecuencia/acción → destino propietario; correo asunto/resumen/ventana/acción/footer; enlace vencido mensaje inline/alternativa autorizada. Sin bandeja obligatoria, leído/no leído, preferencias, dismiss permanente, nuevos canales o adjuntos. Avisos obsoletos/duplicados no se presentan como riesgo vigente.

REUSED_COMPONENTS: InAppNotice, EmailNotificationTemplateSpec, OrganizerDashboard, SecurityNotice, UsageLimitAlert, RetentionNotice, EventGracePeriodBanner, ExportExpiryNotice y legales/feedback. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: estructura común accesible y variantes por hecho, DESIGNED; NotificationCenter no necesario.

STATES COVERED: contrato común; carga no ausencia de avisos, error/parcial conserva panel y retry lectura; ninguna alerta vigente no gran EmptyState; expiración destino; comunicación protegida no revela motivo. Job de correo creado no entrega acreditada. «Tu descarga está disponible hasta [fecha]» con consecuencia real.

RESPONSIVE/ACCESSIBILITY: avisos próximos al contexto y correo columna única adaptable; headings/texto real, links de destino, fecha/TZ; urgencia semántica selectiva, no todos role alert ni texto esencial como imagen.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§11.3/11.4 refieren patrón, sin convertir NotificationCenter en obligación MVP.

## EL-EP-014

ACTOR: operador/admin autorizado. USER GOAL: reconstruir intervención sin abrir multimedia. UI_REQUIRED: YES solo consulta explícita de auditoría.

ENTRY/PRECONDITIONS: recurso/detalle de consola; acceso autorizado.

FLOWS/SCREENS: auditoría contextual → filtros sobre campos disponibles aprobados → listado → detalle fecha/acción/resultado/actor humano o sistema/recurso/motivo/metadatos sanitizados → volver. Sección de consola, no dashboard operacional nuevo; sin editar/borrar logs, exportarlos ni iniciar restore desde UI.

REUSED_COMPONENTS: AuditLogViewer, AuditLogDetail, AdminAppShell/EventDetail, FilterBar/Select/DatePicker/SearchInput/Pagination, Card/StatusIndicator/Drawer/Modal/BottomSheet y feedback. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: solo lectura, actor sistema, partial y semántica de registro, DESIGNED. EL-EP-014 introduce registro; EL-EP-012 lo reutiliza, sin AdminAuditViewer.

STATES COVERED: contrato común; sin coincidencias/carga/error/retry/parte ausente/permiso/session expired; «registro consultado» no acción ejecutada. Destructivo no aplica al visor; resultado fallido/parcial es dato. No ampliar pantallas por componentes health/backup presentes en catálogo.

RESPONSIVE/ACCESSIBILITY: tarjetas móvil, tablet/desktop tabla accesible o lista; filtros agrupados, headers/caption, resultados anunciados, foco devuelto al registro, texto seleccionable y timestamps comprensibles.

UX_OPEN_QUESTIONS: ninguna. UX_READINESS: READY. DOCUMENTATION_UPDATES_RECOMMENDED: §§12.16/17 ownership/estados compartidos, no dashboard de operación obligatorio.

## EL-EP-015

ACTOR: owner y admin autorizado; retiro propio introduce EL-EP-009. USER GOAL: borrar conscientemente/cancelar antes de ventana y entender irreversibilidad. UI_REQUIRED: YES.

ENTRY/PRECONDITIONS: evento/cuenta propia, permiso/challenge según contrato; no recuperación normal de purgado.

FLOWS/SCREENS: EventDeleteRequestDialog contexto/recurso/bloqueo/72h/consecuencias → «Solicitar eliminación»/«Cancelar»; pendiente manual countdown fecha y cancelar permitido; cuenta sección sensible con ConfirmDialog alcance todos eventos/7d/reauth; cancelación confirmada calcula estado actual, no ACTIVE ciego. Gracia vencida y retiro propio irreversible no ofrecen cancelación. Purga en mismo detalle/avisos, sin pantalla por job ni controles de hold jurídico pendiente.

REUSED_COMPONENTS: EventDeleteRequestDialog, EventDeletionCountdown, EventLifecyclePanel, EventStatusBadge, RetentionNotice/RemovalPolicyNotice, AdministrativeActionReason/auditoría, ConfirmDialog y feedback. NEW_COMPONENTS: ninguno. COMPONENT_EXTENSIONS: causas manual/gracia/retiro, principal vs residual, cancelación vs irreversible, DESIGNED; cuenta usa ConfirmDialog sin AccountDeletionDialog nuevo.

STATES COVERED: contrato común; ausencia solicitud, pendiente/cancelable, reauth required/expired, carrera al vencer, no cancelable/irreversible, parcial/fallo físico sin DELETED falso, principal verificado/terminal. Calendario UTC y anclas DEC-097..099 presentados con TZ; no porcentaje inventado ni backups borrados instantáneamente.

RESPONSIVE/ACCESSIBILITY: consecuencias antes de CTA, cancel visible, foco en título/contenido; fecha exacta además de contador sin live tick. Mobile/tablet/desktop mantienen orden y controles sensibles legibles.

UX_OPEN_QUESTIONS: ninguna funcional; challenge/cuándo requiere contrato técnico de architect, no elección UI. UX_READINESS: READY; READY_FOR_TICKET_WRITING: PARTIAL en formularios sensibles, backend cerrado independiente permitido. DOCUMENTATION_UPDATES_RECOMMENDED: §§7.17/18/6.5/6.6 refieren causas/copy; no copiar política ni habilitar hold.

## EL-EP-016

ACTOR: producto/operación. USER GOAL: evaluar evidencia de la Beta. UI_REQUIRED: NO. UX_READINESS: NOT_REQUIRED.

El alcance confirmado exige medición/informe con muestra, objetivos, cobertura y clasificación, no dashboard EventLens. BetaMetricsDashboard/MetricCard/MetricTrend/ValidationGateCard del catálogo no obligan nuevas pantallas, encuestas ni tracking. Proveedores analytics/observabilidad siguen DEFERRED. Inicio Beta y responsable son pendientes operativos; no preguntas UX.

DOCUMENTATION_UPDATES_RECOMMENDED: explicitar NO en épica; no convertir §14 del catálogo en requisitos MVP nuevos.

## Ownership y duplicados evitados

| Introduce | Patrón/componentes | Reutilizan |
| --- | --- | --- |
| UI foundation existente | Campos, feedback, ConfirmDialog/Modal/BottomSheet/navegación | Todas las épicas YES; sin diálogos duplicados por cuenta/job. |
| EL-EP-001 | Auth, invitaciones, sesiones | EL-EP-012/013; sin AdminLoginForm. |
| EL-EP-002 | Configuración/programación/preview privado | EL-EP-003/012; sin PreviewPage duplicada. |
| EL-EP-003 | Lifecycle/estado y acciones vigentes | EL-EP-004/011/012/015, avisos013. |
| EL-EP-004 | Entrada, consentimiento, identidad, Mis aportes | EL-EP-005/007/009. |
| EL-EP-005 | Cola/progreso/resultado de carga | Estados técnicos EL-EP-006 se muestran aquí, sin otra cola. |
| EL-EP-006 | Estado técnico y retry de proceso | Biblioteca007/008, detalle012; retry distinto de transferencia005. |
| EL-EP-007 | Galería/biblioteca/viewer | EL-EP-006/008/009/010, sin galería de moderación aparte. |
| EL-EP-008 | Moderación/papelera/restauración | Consola012, elegibilidad010. |
| EL-EP-009 | Reporte/RemovalRequestFlow variantes | Entrada004, galería007, ejecución015 y consola012. |
| EL-EP-010 | Export/partes/expiración | Avisos013 y restricción/retención015; sin ExportCenter. |
| EL-EP-011 | Capacidad/solicitudes/overrides | EL-EP-003/005/012/013; sin cuota-upload duplicada. |
| EL-EP-013 | Aviso contextual/correo accesible | Hechos de sus propietarios; sin NotificationCenter obligatorio. |
| EL-EP-014 | Semántica/vista de auditoría | Consola012 y acciones auditadas; sin AdminAuditViewer. |
| EL-EP-015 | Cancelación/purga y avisos de causa | Lifecycle003 y retiro009; no segundo RemovalRequestFlow. |

## Resultado y documentación

Revisadas 16; UI YES 15 (001..015); UI NO 016. UX READY 15; UX PARTIAL/NOT_READY ninguna; NOT_REQUIRED 016. Nuevos componentes/tokens: ninguno. PL-024..026 respondidas sin nuevas preguntas funcionales; política contraseña/tokens001 y reauth015 conservan gates técnicos localizados. EL-EP-004/009 requisitos/UX READY y frontend planning YES tras DEC-103..105; texto jurídico final conserva Q-029.

Actualizar metadata existente de épicas por referencias compactas a este handoff; conservar producto/IDs/prioridad/historia. Corregir catálogo retry/descarga y referencias obsoletas de ampliación; delimitar maturity por alcance. Actualizar handoff antiguo lifecycle para referir integración aquí sin copiarla. ui-design-system y ui-guest-flow no requieren redefinición; galería/carga/confirmaciones reutilizan sus principios. Documentos técnicos protegidos: propuestas de sincronización de referencias ya registradas, sin modificaciones.
