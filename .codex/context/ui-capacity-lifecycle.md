# EventLens — handoff UI de capacidad y vigencia

Fecha: 2026-10-08. Especificación documental de ui_designer, persistida por el orquestador autorizado; no es código ni evidencia de implementación. Catálogo: [ui-components.md](ui-components.md). Dirección visual/tokens: [ui-design-system.md](ui-design-system.md). Stack: [technical-baseline.md](technical-baseline.md). Decisiones funcionales: [DECISIONS.md](../product/DECISIONS.md), DEC-077..082, DEC-093..095 y DEC-100..102. Los originales de decisiones no se duplican aquí.

## EL-EP-011 — capacidad, consumo y ampliaciones

REQUIREMENTS_READY: YES
UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES

Capacidad, solicitudes, respuesta e interacción administrativa tienen especificación UX completa. Architect/planner concretan restricciones técnicas y representación contractual sin inventar límites comerciales. El gate no certifica implementación ni operaciones de otras épicas; [dictamen final](../product/sessions/2026-10-08-precisiones-finales-mvp.md).

### Consulta de capacidad

- Actor: organizador del evento; administración autorizada reutiliza los resúmenes desde AdminEventDetail.
- Entrada: contexto del evento existente; no se requiere navegación nueva.
- Jerarquía: evento → límites efectivos → almacenamiento/archivos → aviso aplicable → ayuda → solicitud de ampliación cuando el formulario y permisos estén resueltos.
- Datos: valores autorizados del servidor. Mostrar originales usados y, cuando el contrato lo permita, reservas separadas; una reserva no es un archivo completado. El cliente no calcula autorización de nuevas cargas.
- Estados: carga (Skeleton/LoadingState, sin cero falso), consumo cero, normal, aviso cercano, capacidad no disponible, límite reducido bajo consumo, error recuperable y permiso denegado.
- Copy: «Almacenamiento de aportes» y «Archivos»; unidades decimales. Ayuda explica qué originales ocupan cuota y que portadas/derivados/ZIP tienen consumo operacional separado, conforme DEC-079.
- Error: «No pudimos consultar el consumo» + «Reintentar»; no presentar datos antiguos/fallidos como autorización.
- Capacidad no disponible: «No hay capacidad disponible para autorizar nuevas cargas».
- Reducción bajo consumo: mostrar valores reales, aunque la barra llegue al máximo, y explicar que la reducción no elimina archivos. Reservas mantienen capacidad, sin garantizar completar transferencias ni resolver PL-005.
- Alertas 80/100%: estado del servidor; no emitir una nueva notificación o anuncio idéntico en cada refresco.
- Reutilizar StorageUsage, FileUsageSummary, UsageLimitAlert, OrganizerAppShell, PageHeader, Card, InlineMessage, LoadingState, ErrorState y Button.

### Solicitud y seguimiento de ampliación

- Actor: organizador; solicitar no modifica límites. Entrada desde capacidad del evento.
- Flujo confirmado: abrir → completar campos aprobados → enviar → consultar pending/approved/rejected/info requested por separado. Enviar muestra éxito solo tras confirmación; rechazar no altera capacidad.
- Estructura: evento/límites actuales → formulario → estado/decisión. Primaria «Enviar solicitud», secundaria «Cancelar» antes del envío; cerrar sin enviar no crea solicitud.
- Loading: «Enviando…», sin doble envío. Fallo recuperable conserva entradas; errores se asocian al campo. Aprobación muestra límites efectivos confirmados, no cantidades calculadas por el cliente.
- Campos: RadioGroup almacenamiento/extensión/ambos; NumberInput «GB adicionales»/«Días adicionales» requeridos según tipo; TextArea «Motivo» obligatorio; sin adjuntos. GB decimales; días conforme DEC-082. No presentar incrementos solicitados como totales efectivos ni calcular aprobación en cliente.
- Una solicitud abierta/evento: si existe, mostrar seguimiento y acciones autorizadas en lugar de crear otra. En info requested mostrar pregunta y TextArea «Respuesta», con «Enviar respuesta»; conservar historial actor/fecha/contenido en misma solicitud. Tras persistir, volver a pending: «Respuesta enviada. Tu solicitud está pendiente de revisión»; no habilitar otra abierta.
- Restricciones técnicas siguen contrato aprobado sin mínimos/máximos/longitudes arbitrarios. Errores preservan entradas y se asocian al campo; historial no roba foco al actualizarse.
- Reutilizar ExtensionRequestForm, ExtensionRequestStatus, RadioGroup, NumberInput, TextArea, FormField, FormActions, Button, InlineMessage, Card, Badge y Modal/BottomSheet. Formulario en BottomSheet móvil y Modal escritorio, scroll accesible y acciones visibles con teclado; seguimiento en contexto del evento.

### Revisión administrativa y overrides

- Actor: administración autorizada; motivo obligatorio. Entrada en detalle del evento/solicitud, sin definir un listado nuevo.
- Jerarquía: evento/organizador → plan base y límites efectivos diferenciados → consumo/reservas → solicitud/estado → edición permitida → auditoría.
- Flujo: consultar valores actuales → revisar cuando corresponda → registrar decisión/override y motivo → guardar → mostrar resultado confirmado y auditoría. Plan base permanece separado del override.
- Acciones confirmadas: aprobar, rechazar, pedir información y modificar límites cuando esté permitido. No asumir que cada solicitud obliga a modificar capacidad.
- Primaria «Guardar cambios», secundaria «Cancelar». Datos viejo/nuevo/actor/fecha/motivo según contrato; error/denegación no muestran aprobación. Reducción explica preservación y bloqueo de autorizaciones nuevas.
- Reutilizar AdminEventDetail, AdminUsageOverrideForm, AdministrativeActionReason, AuditLogViewer/AuditLogDetail, resúmenes de uso, NumberInput, FormField, Button y Alert.
- Campos: almacenamiento total GB decimales, cantidad total de archivos y vigencia TOTAL en días desde ancla aprobada; unidades/ancla explícitas y motivo obligatorio. Consultar pregunta/respuesta/historial dentro de misma solicitud.
- «Volver al plan base»: ConfirmDialog reutilizado GENERIC_UI compara actuales/base y consecuencias autorizadas antes de confirmar. Primaria «Confirmar retorno al plan base», secundaria «Cancelar».
- Después de ACTIVE denegar reducción/retorno con vencimiento pasado: «Este cambio dejaría el vencimiento en el pasado y no puede aplicarse». Mostrar fechas y consecuencias del servidor; no sustituir su validación ni inventar política de purga. Rechazo concurrente conserva entradas recuperables, actualiza contexto y explica motivo sin mostrar valores como aplicados.

### Componentes, responsive y accesibilidad

| Componentes | Clasificación | Madurez del alcance |
| --- | --- | --- |
| StorageUsage / FileUsageSummary / UsageLimitAlert | CROSS_CUTTING_PRODUCT_COMPONENT | DESIGNED; propósito/copy/estados/responsive/a11y definidos, sin certificar contrato HTTP o código. |
| ExtensionRequestForm / ExtensionRequestStatus | PRODUCT_COMPONENT | READY_FOR_IMPLEMENTATION para alcance UX: campos, estados, exclusividad, respuesta, historial, responsive y accesibilidad definidos. No certifica código ni pruebas. |
| AdminUsageOverrideForm | PRODUCT_COMPONENT | READY_FOR_IMPLEMENTATION para alcance UX: campos totales, motivo, consecuencias, retorno y rechazo temporal definidos. No certifica código ni pruebas. |
| Motivo administrativo y auditoría | CROSS_CUTTING_PRODUCT_COMPONENT | Reutilización del contrato existente; no cambia madurez global. |
| Controles, overlays y feedback | GENERIC_UI | Reutilización; sin nuevos componentes ni tokens. |

Mobile-first: métricas y formularios apilados, sin tablas ni scroll horizontal obligatorio; escritorio admite métricas contiguas y valores base/actual/propuesto agrupados. Mismo orden de lectura. WCAG 2.2 AA: valores/unidades textuales, nombres accesibles de barras, labels/errores asociados, teclado/foco, avisos sin depender del color y anuncios significativos sin spam. Actualizar consumo no roba foco; overlays contienen y devuelven foco. Reutilizar roles visuales existentes y verificar contraste de combinaciones finales. No elegir styling/librerías/iconos ni añadir consentimiento o retención.

### Preguntas UI pendientes

Ninguna pregunta funcional/UX bloqueante de EL-EP-011: DEC-093..095 y DEC-100..102 completan campos, cantidades, exclusividad, respuesta y reducción temporal. Architect/planner concretan restricciones técnicas sin nuevos límites comerciales ni autorización local de cuota/lifecycle.

## EL-EP-003 — vigencia y reactivación

REQUIREMENTS_READY: YES
UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES — alcance propio de lifecycle; acciones reutilizadas conservan gates propietarios.

Consulta, transiciones e integración de superficies temporales especificadas en [reevaluación MVP](ui-mvp-epic-review.md#el-ep-003). El diseño no certifica formularios sensibles ni intake de retiro de otras épicas; sus gates se mantienen por propietario.

### Consultar lifecycle y ejecutar transiciones

- Actor: organizador autorizado desde detalle del evento. Jerarquía: nombre → estado → inicio → vencimiento → fin de gracia aplicable → acción autorizada → explicación.
- Presentar fecha, hora y TZ, no solo cuenta regresiva. DRAFT sin fecha muestra «Sin programar»; loading no inventa fechas y error muestra «No pudimos consultar el estado» + «Reintentar», sin habilitar transiciones con datos fallidos.
- Reutilizar EventLifecyclePanel, EventStatusBadge, EventScheduleForm, EventLifecycleAction, EventCloseDialog, EventGracePeriodBanner y feedback genérico.

| Estado | Operación visible dentro del alcance | Feedback / frontera |
| --- | --- | --- |
| DRAFT | Programar al cumplir precondiciones aprobadas | SCHEDULED solo tras éxito confirmado. |
| SCHEDULED | Activar antes del inicio cuando autorizado | Explicar que no cambia el vencimiento anclado. |
| ACTIVE | Cerrar antes de vencer | EventCloseDialog; cerrar no pausa vigencia. |
| CLOSED | Reabrir antes de vencer cuando autorizado | Diferenciar reabrir del levantamiento administrativo de suspensión. |
| GRACE_PERIOD | Ver fin de gracia y acceso autorizado a descargas | Extensión pertenece al flujo EL-EP-011; no diseñar un formulario nuevo. |
| SUSPENDED | Consultar estado/fechas autorizadas | Organizador no levanta suspensión. |
| PENDING_DELETION | Mostrar estado existente | Ventanas/acciones de borrado pertenecen a EL-EP-015. |
| DELETED | Mostrar estado terminal | Sin apertura ni reactivación. |

Durante comandos impedir doble envío; éxito actualiza estado/fechas con respuesta vigente y anuncia cambio. Rechazo muestra motivo autorizado y contexto actual, sin simular transición. No decidir qué pasa con transferencias iniciadas (PL-005).

### Suspensión administrativa y avisos al invitado

- Administración entra por AdminEventDetail; SuspendEventDialog con AdministrativeActionReason obligatorio. Copy: «La suspensión no detiene la vigencia ni el periodo de gracia».
- ReactivateEventDialog explica recálculo conforme DEC-081 y conservación del cierre voluntario cuando los plazos lo permitan; no ofrece elegir un estado arbitrario. Resultado previsto solo si lo proporciona el contrato autorizado; confirmar estado efectivo después de guardar.
- Loading/error/cancel: feedback recuperable, sin doble envío, retorno de foco. DELETED nunca habilita reactivación. No revelar motivo/investigación al invitado ni diseñar duración de investigación/purga.
- Invitado reutiliza EventAccessStatus: SCHEDULED muestra «El evento aún no inicia» e inicio en TZ; CLOSED «Las cargas están cerradas»; GRACE_PERIOD «La vigencia del evento terminó», sin carga/galería invitada; SUSPENDED presenta disponibilidad autorizada. DRAFT/PENDING_DELETION/DELETED no exponen automáticamente estados internos al público.
- Mis aportes/retiro/invalidez de sesiones dependen de EL-EP-004 y PL-003/004; no se inventan permisos.

### Reutilización, madurez y accesibilidad

- CROSS_CUTTING_PRODUCT_COMPONENT: EventStatusBadge, EventLifecyclePanel y EventAccessStatus — DESIGNED para estados temporales del alcance; no certifica comportamiento ajeno.
- PRODUCT_COMPONENT: EventLifecycleAction, EventCloseDialog, EventScheduleForm y EventGracePeriodBanner — DESIGNED para operaciones aprobadas, sin certificar extensión/borrado. SuspendEventDialog y ReactivateEventDialog — DESIGNED para suspensión/mapping.
- AdministrativeActionReason es reutilizado como CROSS_CUTTING_PRODUCT_COMPONENT; controles/mensajes/loading/diálogos son GENERIC_UI. Sin nuevos componentes o tokens; no elevar madurez global de un componente cuya responsabilidad incluye operaciones bloqueadas.
- Mobile-first: fechas/acciones apiladas y CTA amplio; desktop agrupa sin cambiar orden de lectura. WCAG 2.2 AA: estado textual, TZ explícita, teclado/foco/retorno, errores asociados, anuncios significativos sin cada tick y sin retirar foco por cambios automáticos.

### Dependencias del gate completo

Integración UX de lifecycle completa en [reevaluación MVP](ui-mvp-epic-review.md#el-ep-003); no duplica ampliación, uploads, retiro ni borrado. PL-024 afecta intake sin sesión de EL-EP-004/009, no la consulta/transiciones propias. Contratos sensibles EL-EP-001/015 y acciones administrativas incrustadas conservan gates localizados; no se autoriza frontend de una épica cuyo gate propio siga PARTIAL.
