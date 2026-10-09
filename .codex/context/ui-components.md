# EventLens UI Components

> Documento de especificación UI/UX neutral respecto al framework.
>
> Este archivo es la fuente de verdad del catálogo de componentes visuales y de interacción reutilizables de EventLens. Angular + TypeScript está aprobado en [technical-baseline.md](technical-baseline.md), EL-TD-001. La estrategia concreta de styling permanece `DEFERRED`; este catálogo especifica UX sin seleccionar CSS, SCSS, Tailwind ni librerías concretas.
>
> Estado: `DRAFT_BASELINE`
>
> Fecha: 2026-10-07

---

# 1. Objetivo

Definir un catálogo consistente de componentes para EventLens que permita:

- mantener coherencia visual entre flujos;
- evitar que cada pantalla invente patrones distintos;
- reutilizar componentes entre experiencia de invitado, organizador y administración;
- diseñar mobile-first;
- facilitar accesibilidad WCAG 2.2 AA;
- separar componentes genéricos de componentes propios del producto;
- conservar las decisiones UX/UI al implementarlas con el stack aprobado.

---

# 2. Principios de diseño

## 2.1 Dirección visual

La dirección visual, tokens y principios UI se consultan en [ui-design-system.md](ui-design-system.md), su fuente de verdad.

- La interfaz debe sentirse moderna y tecnológica sin verse fría o corporativa.

## 2.2 Principios de interacción

- Una acción principal por pantalla cuando sea posible.
- Evitar pasos innecesarios.
- Feedback inmediato tras acciones relevantes.
- No depender exclusivamente del color.
- Acciones destructivas requieren confirmación.
- Estados de carga deben ser visibles.
- Errores deben explicar qué ocurrió y qué puede hacer el usuario.
- Controles táctiles amplios.
- Texto corto y comprensible.
- Evitar lenguaje técnico para invitados.
- Mantener consistencia entre estados equivalentes.

---

# 3. Foundations

Los foundations no son componentes visuales por sí mismos, pero gobiernan el comportamiento de todos los componentes.

## 3.1 Color roles

Roles conceptuales:

- `primary`
- `primary-hover`
- `accent`
- `accent-soft`
- `background`
- `surface`
- `surface-muted`
- `text-primary`
- `text-secondary`
- `text-disabled`
- `border`
- `border-strong`
- `success`
- `success-soft`
- `warning`
- `warning-soft`
- `danger`
- `danger-soft`
- `info`
- `info-soft`
- `focus`

Los valores existentes se consultan en [ui-design-system.md — Colores](ui-design-system.md#colores). Los roles adicionales de esta lista son conceptuales; sus valores deben proponerse allí antes de implementación.

## 3.2 Typography

Jerarquía recomendada:

- `display`
- `h1`
- `h2`
- `h3`
- `body`
- `body-small`
- `label`
- `caption`
- `button`

Familia y pesos tipográficos: [ui-design-system.md — Tipografía](ui-design-system.md#tipografía). Las extensiones necesarias se proponen allí antes de tratarlas como aprobadas.

## 3.3 Spacing

Escala consistente de espaciado:

- XS
- SM
- MD
- LG
- XL
- 2XL

No definir valores independientes por pantalla.

## 3.4 Radius

Roles:

- `radius-sm`
- `radius-md`
- `radius-lg`
- `radius-pill`

## 3.5 Elevation

Uso moderado.

Roles:

- `none`
- `subtle`
- `overlay`

Evitar sombras fuertes.

## 3.6 Breakpoints

Como mínimo:

- mobile
- tablet
- desktop

La experiencia invitado se diseña primero para mobile.

## 3.7 Focus

Todo elemento interactivo debe tener:

- focus visible;
- contraste adecuado;
- comportamiento de teclado consistente.

---

# 4. Generic UI Components

Estos componentes no conocen conceptos de EventLens.

## 4.1 Button
**Propósito:** ejecutar una acción.

**Variantes:** Primary, Secondary, Tertiary/Ghost, Destructive, Link.

**Tamaños:** Small, Medium, Large.

**Estados:** Default, Hover, Focus, Active, Disabled, Loading.

**Reglas:**
- El CTA principal usa `Primary`.
- No usar coral como CTA principal por defecto.
- Un botón loading no debe permitir doble envío.
- Botones icon-only requieren label accesible.
- Touch target suficientemente grande.

## 4.2 IconButton
**Propósito:** acciones compactas mediante icono.

**Usos:** menú, cerrar, eliminar, descargar, compartir, editar.

**Reglas:** nombre accesible y contexto suficiente.

## 4.3 TextInput
**Propósito:** captura de texto simple.

**Estados:** Default, Focus, Filled, Error, Disabled, Read-only.

**Soporta:** label, placeholder, helper text, error text y contador cuando aplique.

## 4.4 TextArea
**Propósito:** texto multilínea.

**Usos:** mensaje de bienvenida, motivo de reporte, comentarios administrativos.

## 4.5 NumberInput
**Propósito:** valores numéricos.

**Usos:** límites, cantidades, configuraciones administrativas.

No usar para PIN.

## 4.6 PinInput
**Propósito:** captura de PIN de acceso.

**Reglas iniciales:**
- exactamente 6 dígitos;
- permite ceros iniciales;
- solo numérico;
- soporte pegar código completo;
- no mostrar posteriormente el PIN guardado.

## 4.7 Checkbox
**Propósito:** selección binaria o consentimiento.

**Estados:** unchecked, checked, indeterminate, disabled, error.

## 4.8 RadioGroup
**Propósito:** elegir una opción entre varias.

**Usos:** modo de moderación, configuraciones excluyentes, motivos.

## 4.9 Switch
**Propósito:** activar/desactivar configuración.

**Usos:** `uploads_enabled`, `guest_gallery_enabled`, `pin_enabled`.

## 4.10 Select
**Propósito:** seleccionar una opción.

**Variantes:** simple y searchable.

## 4.11 DatePicker
**Propósito:** seleccionar fecha.

## 4.12 TimePicker
**Propósito:** seleccionar hora local.

Debe soportar validación de horas inexistentes y resolución de horas ambiguas cuando aplique.

## 4.13 TimezoneSelect
**Propósito:** seleccionar zona IANA.

**Reglas:** default `America/Bogota`; búsqueda; conservar identificador IANA.

## 4.14 FormField
Wrapper estándar de label, control, helper, error y required/optional.

## 4.15 FormSection
Agrupa campos relacionados.

## 4.16 FormActions
Agrupa acciones de formulario; puede ser sticky en mobile.

## 4.17 Card
**Variantes:** default, interactive, selected, muted.

## 4.18 Divider
Separación visual entre grupos.

## 4.19 Badge
**Propósito:** mostrar estados cortos.

## 4.20 StatusIndicator
**Propósito:** estado operativo con icono + texto.

## 4.21 Avatar / InitialBadge
Representación simple de usuario/admin.

## 4.22 Tooltip
Ayuda breve. La información crítica no debe vivir solo en tooltip.

## 4.23 Popover
Contenido contextual breve.

## 4.24 DropdownMenu
Menús de acciones contextuales.

## 4.25 Modal
Interrupciones importantes con manejo correcto de foco.

## 4.26 BottomSheet
Alternativa mobile-first a Modal.

## 4.27 ConfirmDialog
Confirmación de operación sensible con consecuencia explícita.

## 4.28 Alert
Variantes: info, success, warning, error.

## 4.29 Toast
Feedback breve no bloqueante.

## 4.30 InlineMessage
Mensaje contextual asociado a una sección.

## 4.31 EmptyState
Explica ausencia de contenido y acción siguiente cuando aplique.

## 4.32 ErrorState
Explica fallo y recuperación.

## 4.33 LoadingState
Spinner, skeleton o progress según duración/tipo.

## 4.34 Skeleton
Carga estructural.

## 4.35 ProgressBar
Progreso determinístico.

## 4.36 ProgressCircle
Alternativa compacta.

## 4.37 Stepper
Flujos secuenciales cuando realmente aporten claridad.

## 4.38 Tabs
Cambio entre vistas/estados.

## 4.39 Pagination
Listados administrativos extensos.

## 4.40 SearchInput
Búsqueda.

## 4.41 FilterBar
Filtros de estado, fecha, tipo, etc.

## 4.42 SortControl
Ordenación.

## 4.43 Breadcrumbs
Principalmente desktop administrativo.

## 4.44 PageHeader
Título, descripción, acciones y breadcrumbs opcionales.

## 4.45 SectionHeader
Título y acciones de una sección.

## 4.46 AppHeader
Variantes guest, organizer y admin.

## 4.47 MobileNavigation
Navegación mobile autenticada cuando se requiera.

## 4.48 DesktopSidebar
Navegación desktop.

## 4.49 Drawer
Panel lateral/contextual.

## 4.50 FileDropzone
Selección drag-and-drop en desktop; no reemplaza selector mobile.

## 4.51 FileThumbnail
Representación de imagen/video seleccionado.

## 4.52 FileTypeIcon
Fallback cuando no hay preview.

## 4.53 MediaViewer
Visualización ampliada de imagen/video.

## 4.54 Image
Wrapper conceptual con alt, loading, fallback y aspect ratio.

## 4.55 VideoPlayer
Reproducción de derivado web con poster, loading y error.

---

# 5. Guest Experience Components

## 5.1 EventGuestPageShell
Layout base para experiencia invitado con branding, contenido y footer legal.

## 5.2 EventCover
Portada del evento. Estados: imagen, placeholder, loading y error.

## 5.3 EventHeader
Nombre, fecha y metadata principal.

## 5.4 EventWelcomeMessage
Mensaje configurado por organizador.

## 5.5 GuestPrimaryActions
Acciones: Subir fotos y videos, Ver galería, Mis aportes.

## 5.6 EventAccessStatus
Estados de acceso: aún no inicia, cargas cerradas, galería no disponible, expirado, suspendido.

## 5.7 PinAccessForm
Solicita PIN antes de acceso.

## 5.8 ConsentSheet
Aceptación previa a primera carga.

**Incluye:**
- explicación breve;
- enlaces a términos;
- privacidad;
- condiciones de publicación;
- aceptación explícita;
- CTA continuar.

## 5.9 GuestIdentityForm
Pregunta quién aporta.

**Campo:** nombre o apodo.

**Principios:**
- una vez por sesión;
- no pedir teléfono/correo;
- reutilizar en siguientes cargas.

## 5.10 GuestIdentitySummary
Muestra identidad de sesión y edición cuando aplique.

## 5.11 FilePicker
Selección múltiple de fotos/videos.

## 5.12 UploadSelectionSummary
Resumen de archivos antes de cargar.

## 5.13 UploadFileItem
Estados: waiting, uploading, uploaded, processing, pending-review, published, failed, quarantined, removed.

Confirmación durable, cancelación por pérdida de permiso y resultado parcial: [alcance carga DESIGNED](ui-mvp-epic-review.md#el-ep-005). Transferencia 100% no implica aceptación ni publicación.

## 5.14 UploadQueue
Lista de archivos y sus estados.

## 5.15 UploadProgressSummary
Resumen de completados/procesando/fallidos.

## 5.16 UploadRetryAction
Retry solo cuando las reglas lo permiten.

## 5.17 UploadCompletedState
Agradecimiento, subir más, ver galería y/o mis aportes.

## 5.18 MyContributionsList
Lista de contenido asociado a sesión invitada.

## 5.19 MyContributionItem
Acciones: ver, solicitar eliminación, retry permitido.

## 5.20 Gallery
Galería de invitados con contenido permitido.

## 5.21 GalleryMediaCard
Thumbnail, tipo, autor/apodo cuando corresponda, menú.

## 5.22 GalleryViewer
Vista ampliada con navegación y acciones.

Carga/error, disponibilidad revocada, navegación teclado y devolución de foco: [alcance galería DESIGNED](ui-mvp-epic-review.md#el-ep-007). Grid/carga incremental mobile/tablet/desktop especificados allí, sin nueva librería.

## 5.23 GalleryEmptyState
Estado sin contenido publicado.

## 5.24 GalleryDisabledState
Estado de galería no disponible.

## 5.25 ReportContentAction
Acción contextual para reportar.

## 5.26 ReportContentDialog
Motivos iniciales:
- aparezco y quiero solicitar retiro;
- sin consentimiento;
- inapropiado;
- íntimo;
- spam;
- posible copyright;
- posible ilegal;
- otro.

## 5.27 RemovalRequestFlow
Solicitud de retiro para contenido propio o contenido donde aparece la persona.

Variantes propia irreversible y sin sesión revisada: [handoff UX READY_FOR_IMPLEMENTATION](ui-mvp-epic-review.md#el-ep-009), campos/validación/declaración DEC-103..105 y gates aprobados. Correo de contacto no recupera/asume sesión; sin seguimiento público. EL-EP-009 introduce, EL-EP-004/007 reutilizan; no duplicar flujos ni inferir uploader de pruebas. Madurez del alcance UX documentado, sin certificar código/pruebas, aprobación jurídica ni adjuntos no diseñados.

---

# 6. Legal / Privacy Components

## 6.1 LegalFooter
Links persistentes: Privacidad, Términos y Condiciones de publicación.

## 6.2 LegalDocumentLink
Enlace a documento legal versionado.

## 6.3 ConsentSummary
Resumen de versiones aceptadas cuando aplique.

## 6.4 PrivacyNotice
Aviso contextual breve.

## 6.5 RetentionNotice
Vencimiento, grace period o eliminación próxima.

## 6.6 RemovalPolicyNotice
Explicación contextual de retiro.

---

# 7. Organizer Components

## 7.1 OrganizerAppShell
Layout autenticado del organizador.

## 7.2 OrganizerDashboard
Eventos, estados, consumo, accesos rápidos y alertas.

## 7.3 EventCard
Portada, nombre, fecha, estado, consumo y acciones.

## 7.4 EventList
Lista responsive de eventos.

## 7.5 CreateEventForm
Creación inicial de borrador.

## 7.6 EventBasicInfoForm
Nombre, bienvenida y portada.

## 7.7 EventCoverUploader
Soporta JPEG/JPG, PNG, HEIC/HEIF y WebP, máximo 25.000.000 bytes.

## 7.8 EventScheduleForm
Fecha, hora y timezone con validaciones DST.

## 7.9 EventAccessSettings
PIN y acceso.

## 7.10 EventGuestSettings
`uploads_enabled` y `guest_gallery_enabled`.

## 7.11 ModerationSettings
`AUTO_PUBLISH` y `REQUIRE_APPROVAL`.

## 7.12 EventSettingsNav
Navegación entre configuración del evento.

## 7.13 EventStatusBadge
DRAFT, SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD, PENDING_DELETION, SUSPENDED, DELETED.

## 7.14 EventLifecyclePanel
Estado, fechas, acciones válidas y próximas transiciones.

Especificación temporal y fronteras de las acciones relacionadas: [handoff de vigencia](ui-capacity-lifecycle.md#el-ep-003--vigencia-y-reactivación). Diseño del alcance DESIGNED; extensión/borrado y operaciones invitadas conservan gates de sus épicas propietarias.

## 7.15 EventLifecycleAction
Publicar/programar, activar, cerrar, reactivar, solicitar eliminación.

## 7.16 EventCloseDialog
Confirmación de cierre.

## 7.17 EventDeleteRequestDialog
Confirmación de eliminación y ventana de cancelación.

## 7.18 EventDeletionCountdown
Tiempo restante para cancelar eliminación.

## 7.19 EventGracePeriodBanner
Explica vencimiento y acciones restantes.

## 7.20 EventSharePanel
Enlace, copiar, QR, PIN si aplica y estado de acceso.

## 7.21 QRPreview
Visualización de QR vigente.

## 7.22 CopyEventLinkAction
Copiar enlace con feedback.

## 7.23 RegenerateAccessDialog
Regeneración/revocación de enlace/QR.

## 7.24 StorageUsage
Uso versus límite.

Especificación de consumo comercial/reservas y exceso tras reducción: [handoff de capacidad](ui-capacity-lifecycle.md#consulta-de-capacidad).

## 7.25 FileUsageSummary
Cantidad de archivos versus límite.

Comparte estados/reservas y accesibilidad del [handoff de capacidad](ui-capacity-lifecycle.md#consulta-de-capacidad).

## 7.26 UsageLimitAlert
Avisos de límite cercano o alcanzado.

Copy y estados sin duplicar notificaciones: [handoff de capacidad](ui-capacity-lifecycle.md#consulta-de-capacidad).

## 7.27 ExtensionRequestForm
Solicitud de ampliación.

Alcance UX READY_FOR_IMPLEMENTATION según [handoff vigente](ui-capacity-lifecycle.md#solicitud-y-seguimiento-de-ampliación); restricciones técnicas por contrato, sin certificar código ni pruebas.

## 7.28 ExtensionRequestStatus
Pending, approved, rejected o info requested.

Respuesta en misma solicitud e historial, retorno a pending según DEC-101: [handoff vigente](ui-capacity-lifecycle.md#solicitud-y-seguimiento-de-ampliación). Alcance UX READY_FOR_IMPLEMENTATION; no certificar código.

---

# 8. Organizer Media Management

## 8.1 OrganizerMediaLibrary
Biblioteca del evento con filtros.

## 8.2 OrganizerMediaCard
Preview, estado, uploader y acciones.

## 8.3 OrganizerMediaTable
Vista desktop opcional.

## 8.4 MediaStatusFilter
Processing, pending review, published, hidden, rejected, processing failed, quarantined, trashed.

## 8.5 MediaModerationActions
Publicar, ocultar, rechazar y restaurar cuando aplique.

## 8.6 HideMediaDialog
Confirmación de ocultamiento si corresponde.

## 8.7 RejectMediaDialog
Rechazo de contenido pendiente.

## 8.8 TrashMediaDialog
Explica papelera y eliminación posterior.

## 8.9 RestoreMediaAction
Restauración durante papelera.

## 8.10 ProcessingFailedPanel
Fallo técnico con elegibilidades separadas: descarga de original exige seguridad APPROVED (DEC-075); retry de nuevo ciclo elegible puede repetir inspección inconclusa (DEC-076). Nunca libera/reintenta QUARANTINED por organizador. [Alcance DESIGNED](ui-mvp-epic-review.md#el-ep-006).

## 8.11 RetryProcessingAction
Retry recuperable; nunca QUARANTINED.

## 8.12 QuarantinedMediaState
Estado bloqueado sin liberación por organizador.

---

# 9. Export / Download Components

## 9.1 DownloadOriginalAction
Descarga individual autorizada.

## 9.2 DownloadAllAction
Inicia exportación asíncrona.

## 9.3 ExportRequestDialog
Resume selección, partes y disponibilidad.

## 9.4 ExportStatus
Requested, preparing, available, failed, expired.

## 9.5 ExportProgress
Solo con progreso confiable.

## 9.6 ExportPackageList
Partes, tamaño, estado y descarga.

## 9.7 ExportExpiryNotice
Expiración de 48 horas.

## 9.8 ExportFailedState
Error y retry cuando aplique.

---

# 10. Authentication Components

## 10.1 BetaInviteForm
Crear invitación.

## 10.2 BetaInviteList
Consultar invitaciones.

## 10.3 BetaInviteStatusBadge
Pending, used, revoked y expired si finalmente aplica.

## 10.4 RevokeInviteDialog
Revocación de invitación válida.

## 10.5 AccessRequestForm
Solicitud pública BETA preservando no enumeración.

## 10.6 AccessRequestList
Listado administrativo.

## 10.7 AccessRequestDetail
Detalle y acciones.

## 10.8 OrganizerRegistrationForm
Registro desde invitación.

## 10.9 EmailVerificationState
Pending, verifying, verified, invalid/expired y resend available.

## 10.10 LoginForm
Inicio de sesión.

## 10.11 ForgotPasswordForm
Recuperación con respuesta neutra.

## 10.12 ResetPasswordForm
Cambio de contraseña mediante recuperación.

## 10.13 SessionList
Sesiones propias activas.

## 10.14 SessionItem
Detalle y cierre de sesión seleccionada.

## 10.15 SignOutOtherSessionsAction
Cerrar demás sesiones.

## 10.16 SecurityNotice
Avisos de cambios sensibles.

---

# 11. Notification Components

## 11.1 NotificationCenter
Centro de notificaciones futuro si aplica.

## 11.2 NotificationItem
Notificación individual.

## 11.3 EmailNotificationTemplateSpec
Patrones de correo para verificación, recuperación, evento próximo, límites, vencimiento, grace period, eliminación, export y suspensión.

## 11.4 InAppNotice
Aviso persistente dentro del panel.

---

# 12. Admin Components

## 12.1 AdminAppShell
Layout administrativo.

## 12.2 AdminDashboard
Resumen operativo.

## 12.3 AdminEventSearch
Buscar eventos.

## 12.4 AdminEventResult
Resultado resumido.

## 12.5 AdminEventDetail
Organizador, estado, plan, consumo, fechas, reportes, procesamiento y auditoría.

## 12.6 AdminOrganizerSummary
Resumen de organizador.

## 12.7 AdminUsageOverrideForm

Alcance UX READY_FOR_IMPLEMENTATION: [handoff de overrides](ui-capacity-lifecycle.md#revisión-administrativa-y-overrides), campos/totales/retorno y rechazo temporal aprobados; no certificar código ni pruebas.
Overrides de storage, vigencia y límites con motivo.

## 12.8 SuspendEventDialog
Suspensión con motivo.

## 12.9 ReactivateEventDialog
Reactivación.

## 12.10 InvalidateEventAccessDialog
Invalidación/rotación de acceso.

## 12.11 AdminModerationPanel
Moderación grave: hide, delete, suspend, review.

## 12.12 ReportQueue
Cola de reportes.

## 12.13 ReportDetail
Motivo, severidad, evento, media, historial y acciones.

## 12.14 ReportSeverityBadge
Normal o high.

## 12.15 AdministrativeActionReason
Motivo obligatorio para acción administrativa sensible.

## 12.16 AuditLogViewer
Semántica/estados y ownership de consulta: [EL-EP-014 DESIGNED](ui-mvp-epic-review.md#el-ep-014), reutiliza consola EL-EP-012. No crear AdminAuditViewer paralelo.
Listado con filtros.

## 12.17 AuditLogDetail
Detalle de evento de auditoría.

## 12.18 JobQueueSummary
Pending, processing, retrying, failed, dead y oldest pending.

## 12.19 JobDetail
Detalle operativo de job.

## 12.20 RetryDeadJobAction
Retry administrativo auditado.

---

# 13. Operational Components

## 13.1 SystemHealthSummary
Estado API, DB, storage, workers, scheduler y email.

## 13.2 WorkerStatus
Estado de workers.

## 13.3 QueueHealth
Salud de cola.

## 13.4 StorageHealth
Salud/consumo de storage.

## 13.5 BackupStatus
Estado de backups.

## 13.6 RestoreDrillStatus
Estado de simulaciones de restore.

## 13.7 AlertList
Alertas operativas.

## 13.8 OperationalIncidentBanner
Incidente visible al operador.

---

# 14. Analytics / Beta Validation Components

## 14.1 BetaMetricsDashboard
Métricas de éxito de Beta.

## 14.2 MetricCard
Métrica individual.

## 14.3 MetricTrend
Tendencia cuando exista histórico suficiente.

## 14.4 ValidationGateCard
Estados de CAP-001, DR-001, MEDIA-001 y EXPORT-001.

---

# 15. Reusable State Patterns

Los componentes stateful deben considerar cuando aplique:

- `idle`
- `loading`
- `success`
- `error`
- `empty`
- `disabled`
- `read-only`
- `permission-denied`
- `offline/retry`
- `partial`

No todos los componentes requieren todos los estados.

---

# 16. Responsive Rules

## Mobile
- prioridad para invitado;
- botones principales full width cuando corresponda;
- BottomSheet preferible a modal complejo;
- navegación simple;
- evitar tablas.

## Tablet
- aprovechar ancho sin cambiar innecesariamente el patrón.

## Desktop
- sidebar;
- tablas administrativas;
- filtros persistentes;
- dos columnas cuando mejoren productividad.

---

# 17. Accessibility Requirements

- WCAG 2.2 AA como objetivo.
- Navegación por teclado.
- Focus visible.
- Labels asociados.
- Errores vinculados al control.
- Contraste suficiente.
- Touch targets adecuados.
- No depender solo del color.
- Headings semánticos.
- Live regions para progreso/errores cuando aplique.
- Reduced motion.
- Alt text o tratamiento decorativo correcto.
- Gestión de foco en diálogos.
- Icon-only controls con nombre accesible.

---

# 18. Component Naming Principles

Los nombres son conceptuales.

La implementación puede adaptar naming a Angular conforme al baseline aprobado, pero debe conservar:

- responsabilidad;
- comportamiento;
- estados;
- contrato UX.

No crear componentes duplicados para el mismo patrón solo por pertenecer a módulos distintos.

---

# 19. Component Ownership

## Generic UI
Ownership: UI foundation/design system.

## Product Components
Ownership: feature/module correspondiente.

## Cross-cutting Product Components
Ownership compartido mediante contrato UI.

Para los alcances MVP revisados: legales/privacidad (LegalFooter, LegalDocumentLink, PrivacyNotice, RetentionNotice, RemovalPolicyNotice); disponibilidad/lifecycle (EventAccessStatus, EventStatusBadge, EventLifecyclePanel); capacidad (StorageUsage, FileUsageSummary, UsageLimitAlert); motivo/auditoría (AdministrativeActionReason, AuditLogViewer, AuditLogDetail); comunicación (InAppNotice, EmailNotificationTemplateSpec). LoginForm/SecurityNotice pueden reutilizarse entre identidades sin duplicados. AdminUsageOverrideForm mantiene PRODUCT_COMPONENT. Esta clasificación no eleva madurez ni certifica implementación; [ownership por épica](ui-mvp-epic-review.md#ownership-y-duplicados-evitados).

---

# 20. Component Maturity

Estados:

- `PROPOSED`
- `DESIGNED`
- `READY_FOR_IMPLEMENTATION`
- `IMPLEMENTED`
- `VALIDATED`
- `DEPRECATED`

La inclusión en este catálogo no implica READY.

---

# 21. Prioridad inicial

## Foundation
1. Button
2. TextInput
3. Checkbox
4. Alert / InlineMessage
5. ProgressBar
6. Modal / BottomSheet
7. LegalFooter

## Primer flujo invitado
8. EventGuestPageShell
9. EventCover
10. EventHeader
11. GuestPrimaryActions
12. ConsentSheet
13. GuestIdentityForm
14. FilePicker
15. UploadFileItem
16. UploadQueue
17. UploadCompletedState
18. Gallery
19. GalleryMediaCard
20. ReportContentDialog
21. RemovalRequestFlow

## Organizador
22. OrganizerAppShell
23. EventCard
24. CreateEventForm
25. EventBasicInfoForm
26. EventScheduleForm
27. EventAccessSettings
28. EventGuestSettings
29. ModerationSettings
30. EventSharePanel
31. StorageUsage
32. OrganizerMediaLibrary
33. MediaModerationActions
34. DownloadAllAction
35. ExportStatus

## Administración
36. AdminAppShell
37. AdminEventSearch
38. AdminEventDetail
39. ReportQueue
40. ReportDetail
41. AuditLogViewer
42. JobQueueSummary

---

# 22. Open UI Decisions

Pendientes antes de implementación cuando sean relevantes:

Las extensiones o ajustes a tokens y tipografía se resuelven en [ui-design-system.md](ui-design-system.md); sus valores existentes no vuelven a quedar pendientes por este catálogo.

- escala tipográfica;
- spacing exacto;
- breakpoints;
- librería de iconos (`DEFERRED`);
- responsive gallery: especificado para el alcance MVP en [EL-EP-007](ui-mvp-epic-review.md#el-ep-007); valores cosméticos pueden seguir PROPOSED.
- modal vs bottom sheet;
- infinite scroll vs paginación;
- estrategia concreta de estilos CSS/SCSS/Tailwind (`DEFERRED`);
- librería externa de componentes (`DEFERRED`).

Estas decisiones no cambian el catálogo funcional.

---

# 23. Definition of Ready for UI Component

Un componente puede pasar a `READY_FOR_IMPLEMENTATION` cuando:

- tiene propósito claro;
- estados relevantes definidos;
- variantes necesarias definidas;
- comportamiento responsive definido;
- accesibilidad definida;
- copy suficientemente definido;
- dependencias funcionales cerradas;
- no depende de decisión de producto bloqueante;
- es coherente con el sistema visual.

---

# 24. Guideline final

EventLens debe preferir:

- pocos componentes bien reutilizados;
- consistencia;
- claridad;
- accesibilidad;
- flujos cortos;
- mobile-first;

sobre:

- abstracciones prematuras;
- componentes excesivamente genéricos;
- interfaces densas;
- patrones diferentes para el mismo problema;
- visuales decorativos que dificulten el uso.

Este catálogo es una guía UI/UX y no obliga a implementar todos los componentes desde el inicio.
