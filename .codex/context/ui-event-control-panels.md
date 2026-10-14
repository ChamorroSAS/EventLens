# UI — paneles de control y gestión visual de eventos

Fecha: 2026-10-13. EL-EP-019. Propuesta incorporada por el orquestador desde handoff read-only de `panels_ui`; [gates](../product/sessions/2026-10-13-event-control-panels-gates.md). No acredita implementación.

UI_REQUIRED: YES. **Dictamen vigente `panels_ui`: APPROVED / READY_FOR_FRONTEND_PLANNING: YES para organizador MVP y admin read-only MVP**, después de incorporar [contrato técnico](event-control-panels-contract.md). Extensiones READY_FOR_IMPLEMENTATION en diseño; ejecución según dependencias, admin activación BLOCKED por autoridad externa. Estado inicial PARTIAL preservado en sesión; no confundir diseño con IMPLEMENTED/VALIDATED.

## Alcance

Organizador: lista propia, creación DRAFT contextual, detalle, nombre, fecha/hora/TZ. Admin: sesión propia, búsqueda y detalle read-only cuando su contrato y autoridad estén habilitados. No métricas, portada, bienvenida, descripción nueva, PIN, compartir, guest settings, lifecycle editable, biblioteca, exportaciones, capacidad, grants, intervención, jobs ni pantallas de auditoría en esta entrega.

Reutilizar catálogo, Manrope y `--el-*`, breakpoints y roles de [ui-design-system](ui-design-system.md). El tema oscuro y fuentes propias del shell admin actual no introducen una dirección visual aceptada; normalizar el montaje futuro al baseline claro. Sin nuevos tokens, dependencias ni modificaciones de assets. Conservar PNG canónicos, assets EventLens históricos e identificadores técnicos.

## Rutas de la propuesta

Estas extensiones están ratificadas para planificación por el contrato técnico incorporado; no cambian rutas aceptadas de entrada ni acreditan montaje actual.

| Destino | Composición |
|---|---|
| `/mis-eventos` | OrganizerDashboard + EventList/EventCard |
| `/mis-eventos/:eventId` | Detalle propio |
| `/mis-eventos/:eventId/configuracion/general` | EventBasicInfoForm: nombre |
| `/mis-eventos/:eventId/configuracion/programacion` | EventScheduleForm: TZ y fecha/hora, guardados independientes |
| `/admin/ingresar` | LoginForm variante administrativa |
| `/admin/eventos` | AdminAppShell + AdminEventSearch |
| `/admin/eventos/:eventId` | AdminEventDetail read-only |

Preservar `/`, `/ingresar`, `/solicitar-acceso`, `/mi-cuenta`, `/g/:lookupKey`, SPA/base href y retornos seguros. No enlace admin desde Home ni retorno organizador→admin. Logout es comando, nunca GET navegable. Autoridad única Angular Router conforme contrato aceptado; no dos routers activos.

## Organizador: flujo y pantallas

Precondiciones: sesión ordinaria y permisos efectivos. Cuenta pendiente de eliminación solo usa gestión restringida existente, sin eventos. Comprobar sesión antes de presentar datos privados.

1. Mis eventos: h1, CTA «Crear nuevo evento», lista real con nombre, estado textual y fecha/hora/TZ disponibles. Vacío verdadero: «Crear mi primer evento». Cada tarjeta enlaza «Abrir [nombre]». Carga/error no se presentan como vacío. Sin portada/consumo/totales globales inventados.
2. CreateEventForm en BottomSheet móvil, Modal tablet/desktop. Campo «Nombre del evento»; helper «Podrás configurar la fecha y el horario después»; «Crear borrador»/«Cancelar». Trim1..120; servidor decide. Busy impide doble envío. Cancelar antes de enviar no crea y devuelve foco al CTA. Durante envío no afirmar que cerrar cancela el comando; bloquear descarte hasta resultado, con recuperación visible si es incierto.
3. ACK durable: abrir ID devuelto, anunciar «Borrador creado». Default Bogotá, sin fecha/participación. Si falla la lectura posterior, conservar ID y ofrecer cargar detalle; nunca volver a crear automáticamente.
4. Detalle: h1 nombre, badge estado, resumen de fecha/hora local/IANA/offset o «Fecha por definir». Acciones General/Programación según capacidad granular. Revisión técnica no es contenido principal. Sin publicar/activar/QR/media.
5. General: únicamente nombre, «Guardar nombre» y «Descartar cambios». DRAFT-only conforme owner; descartar restaura dato confirmado sin mutación. Navegar con cambios usa ConfirmDialog «Descartar cambios sin guardar» / «Seguir editando».
6. Programación: dos FormSection independientes. TZ: TimezoneSelect IANA con búsqueda, zona confirmada y «Guardar zona horaria». Conservar fecha/hora local; aviso antes de recálculo si SCHEDULED. Fecha/hora: DatePicker y TimePicker asociados, TZ confirmada visible, «Guardar fecha y hora»; DRAFT o SCHEDULED nunca activado conforme CR-010/EL-TK-244. En SCHEDULED advertir que el cambio recalcula vencimiento y gracia, conserva estado y QR y no activa el evento. Habilitar por canSetLocalSchedule del servidor; distinguir CAS, estado e idempotencia. Conservar intención ante resultado incierto y ofrecer retry explícito. No usar TZ pendiente ni simular guardado atómico de ambos grupos. No añadir borrar programación.

Copy programación: «Define la fecha y hora local del evento. Guardar estos datos no publica el evento». Sustituir la promesa actual de apertura/recepción automática; apertura pertenece a lifecycle.

DST gap: «Esta hora no existe en la zona seleccionada. Elige otra hora». Overlap: RadioGroup de opciones con fecha/hora, IANA y offsets permitidos por owner; sin elección automática. Cambiar datos invalida elección anterior incompatible. Frontend no es autoridad de cálculo DST. Cada éxito anuncia solo su grupo: nombre, TZ o fecha/hora guardados.

## Administrador: flujo y pantallas

Precondición: sesión administrativa real MOD-001 validada contra revisiones, epoch/barreras y RecoveryAuthority. Identidad de organizador o header de actor no acredita administración. Indisponibilidad de autoridad impide acceso, nunca habilita fallback.

LoginForm.admin: «Acceso administrativo», identificador sin exigir formato email, credencial operativa oculta; pegar/gestor permitidos; «Iniciar sesión»/«Volver al inicio». Credencial solo en transporte seguro, sin URL/almacenamiento web/logs/telemetría. Error neutro «No se pudo iniciar sesión con los datos proporcionados»; dependencia fallida «El acceso administrativo no está disponible. Reintenta más tarde». Limpiar secreto tras intento/salida; identificador puede quedar en memoria del formulario. Sesión vigente evita pedir nuevamente credencial. Retorno solo a destino admin interno permitido y reautorizado.

Búsqueda: «Búsqueda administrativa», consulta y criterios ya autorizados, «Buscar», paginación del owner. Estados sin búsqueda/buscando/sin coincidencias/resultados/error. No longitud mínima ni campos nuevos inferidos. Sin previews. Resultados eventos abren detalle; organizadores no originan pantalla nueva. Cancelar o ignorar respuesta de consulta anterior. No inferir totales sobre una página.

Detalle: nombre/ID/estado, organizador mínimo autorizado, fechas/TZ y secciones autorizadas del snapshot existente. PARTIAL muestra «Datos no disponibles» por sección, nunca cero falso. Sin botones de acción/media/grants/jobs/auditoría/overrides. Volver a búsqueda conserva consulta y devuelve foco al resultado si existe, si no al encabezado. Deep-link no requiere selección previa.

Logout: solo admin actual, conserva sesiones organizer/guest. Éxito o sesión ya vencida → login admin, limpia datos/caches y anuncia «Sesión administrativa cerrada». ACK incierto limpia presentación privada y explica «No se pudo confirmar el cierre de sesión», con reconciliación contractual; no afirmar revocación ni restaurar acceso. Sin bootstrap/recuperación pública.

## Estados transversales

- Cambio A→B: limpiar datos/capacidades A antes de lectura B; correlacionar evento/intención y descartar respuesta A tardía. Nunca montar datos A bajo B.
- Lectura temporal fallida ofrece retry manual y no concede permiso. 401/restricción/revocación retira presentación privada correspondiente. Ownership/ausencia usa resultado neutro.
- Configuración confirmada consume receipt y refresca proyección actual. Replay de receipt no debe presentar snapshot histórico como actual.
- Conflicto de revisión: conservar entradas, «El evento cambió desde que lo abriste», consultar versión actual y reaplicar conscientemente. Sin sobrescritura/retry automático. Conflicto de idempotencia se distingue; no reemplazar key silenciosamente.
- Timeout: conservar intención/key/payload/revisión en memoria, «No pudimos confirmar si se guardó». Reconciliar/reintentar contractual; no afirmar éxito/fallo. No mutaciones dependientes mientras sea incierto. Refresh no reenvía POST.
- Cambiar permisos durante edición bloquea comando y explica estado; no reactivar por caché. Fallo de un grupo conserva último estado durable y entradas pertinentes de otros grupos.

## Responsive y accesibilidad

Breakpoints existentes: móvil<640, tablet≥640, desktop≥1024. Móvil cards/lista y configuración vertical; navegación compacta accesible; resultados admin como cards equivalentes. Desktop sidebar y tabla accesible; tablet mismo orden. Sin scroll horizontal de controles a 320 CSSpx.

WCAG2.2AA como objetivo: h1/landmarks por destino, links para navegación/buttons para comandos, labels/errores asociados, foco visible/no oculto, objetivos táctiles44×44, estado con texto, reflow320/zoom400%, nombres largos legibles. Ruta nueva enfoca h1. Guardado mantiene foco y live region polite; errores urgentes no repiten anuncios. Diálogo contiene foco y devuelve al disparador, Escape cuando seguro. Reduced motion; sin animación obligatoria. Tabla con caption/headers y cards con datos equivalentes. Validación manual con lector de pantalla más Playwright; ningún test aislado certifica WCAG.

Traces/capturas sanitizados: sin secretos, cookies, PIN, tokens, URLs firmadas ni datos privados innecesarios. LegalFooter solo con enlaces reales aprobados; sin copy jurídico nuevo.

Reevaluación: checking/503 admin no equivale a anónimo ni lleva indiscriminadamente al login; mostrar indisponibilidad y retry explícito de comprobación.401 indica sesión no utilizable;403 no se presenta como contraseña incorrecta ni recupera acceso visualmente. Renovar contexto CSRF tras refresh no inicia sesión, eleva ni extiende TTL. Login sin «mantener sesión» ni promesa de duración nueva. General/Programación mantienen contexto y éxito no descarta cambios de otro grupo ni redirige. Timeout de creación no bloquea indefinidamente overlay: reconciliar/reintentar o volver a lista, explicando «Salir no cancela una creación que pueda haberse completado».

Pruebas UI exigidas: 320/375/768/1024/1440 CSSpx, zoom200% y reflow equivalente400%, nombre120 caracteres, teclado sin mouse, foco ruta/diálogo/retorno, RadioGroup DST operable, contraste final, anuncio único y revisión manual de estados inciertos.

## Componentes reutilizados y madurez

PRODUCT_COMPONENT: shells/dashboard/lista/cards/formularios/config-nav organizador, búsqueda/resultados/detalle/resumen admin. CROSS_CUTTING_PRODUCT_COMPONENT: LoginForm/SecurityNotice, EventStatusBadge y componentes legales según catálogo. GENERIC_UI: campos/secciones/acciones, inputs/pickers/select, Modal/BottomSheet/ConfirmDialog, feedback/estado/encabezados/navegación. No componentes nuevos; nombres conceptuales no certifican existencia de implementación.

Extensiones: READY_FOR_IMPLEMENTATION en diseño tras reevaluación explícita de sesión; DESIGNED/PARTIAL es histórico. Ejecución conserva dependencias/activationblock. IMPLEMENTED/VALIDATED exigen evidencias futuras. Catálogo mantiene ownership y baseline; este handoff no crea tokens ni autoridad de permisos.

## Correctivo focal de Invitados y Aportes — EL-TK-264 / CR-012

2026-10-14, CONFIRMED por usuario a partir de evento ACTIVE. Sólo uploads_enabled y guest_gallery_enabled son editables por owner ordinario en DRAFT/SCHEDULED/ACTIVE conforme canEditSettings; excepción focal a la antigua suposición owner read-only tras ACTIVE, sin modificar campos de otros scopes. Mantener menú Invitados y Aportes y título Aportes y permisos. EventGuestSettings reusa Switch nativo con dos flags independientes, helpers y Guardar permisos atómico. Mis aportes sigue independiente. Busy/readonly/errors/CAS con recarga y propuesta preservada, retry exacto ante resultado incierto y protección ante cambio de evento. Aviso de transferencia real pendiente, sin fingir subida/publicación/purga. Especificación completa y criterios en EL-TK-264; no nuevos tokens/pantallas.
