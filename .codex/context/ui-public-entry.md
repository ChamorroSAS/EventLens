# Handoff UI — Home y navegación de entrada

2026-10-12 · EL-EP-018. Especificación read-only de `ep018_ui` incorporada por el orquestador; copy/medidas de diseño adoptados bajo la solicitud de revisión. Gate inicial PARTIAL superado por ratificación **READY_FOR_FRONTEND_PLANNING YES** tras contrato técnico, sin preguntas bloqueantes; [gates](../product/sessions/2026-10-12-el-ep-018-review-gates.md). [Contrato técnico local](public-entry-contract.md) gobierna rutas/sesión/retorno/QR y datos propios; no se duplican sus reglas aquí.

## Reutilización y nuevas responsabilidades

PublicHomePage: única composición de producto nueva, owner entrada pública transversal EL-EP-018; sin auth ni gestión de eventos. AppHeader conserva GENERIC_UI y añade variante pública con enlaces/acciones ya autorizados por owner; sin lógica de sesión/dominio dentro. Drawer/BottomSheet, Button/links, IconButton, SectionHeader, InlineMessage y estados reutilizados; no cabecera/menú móvil/FAQ paralelos.

LegalFooter transversal: variante pública minimal con sólo destinos/documents aprobados disponibles. LoginForm, AccessRequestForm y componentes de sesiones/seguridad de MOD-001; eliminación/reauth de201/015; Dashboard/Shell de organizador y guest actuales. Su inclusión en catálogo no acredita código o montaje actual; ticketización distingue gaps de integración sin reimplementar negocio. No eleva globalmente gate001 ni cambia guest/015.

Madurez de diseño acotada de PublicHomePage/AppHeader.public/LegalFooter mínima/montaje AccessRequestForm: READY_FOR_IMPLEMENTATION en diseño tras ratificación UI/requisitos; no IMPLEMENTED/VALIDATED y no eleva001 global. Componentes de otros owners conservan su madurez/dependencias de ejecución. Sin nuevo token, familia/peso, perfil mutable, galería/directorio ni tema.

## Pantallas, navegación y estados

- `/`: renderizar contenido público inmediato con o sin sesión, sin redirect; comprobación afecta sólo acciones. Orden: header/hero → beneficios → cuatro pasos → privacidad → FAQ cuatro preguntas → cierre → footer. Un h1, h2 por sección, h3 si procede. Cuatro anclas informativas; pasos son lista ordenada, no Stepper.
- Cabecera anónima: anclas, Iniciar sesión y Solicitar acceso a la Beta. Ordinaria: anclas cuando caben y Mis eventos/Mi cuenta/Cerrar sesión. Restringida: Mi cuenta y Cerrar sesión, sin Mis eventos. Pendiente/indisponible: no navegación privada ni identidad previa, contenido público usable y feedback/retry proporcional. No-session y expired/revoked siguen contrato; error transitorio no prueba inexistencia/revocación.
- Menú móvil: Abrir menú con aria-expanded/relación panel; una lista de anclas y acciones válidas. Drawer/BottomSheet reutilizado; foco al abrir, Escape/cierre retorna disparador. Al elegir ancla cerrar y enfocar h2; al cambiar ruta enfocar h1 destino. Scrollvertical propio/cierre accesible, sin menú flotante nuevo. Si enlaces no caben en desktop usar misma variante compacta, no truncar ni reducir fuentes.
- `/ingresar`: componer LoginForm propietario, campos/validaciones existentes; ocupado evita doble envío, error neutro asociado y rate limit. Retorno seguro conforme contrato; sin target válido vuelve `/`. Back/cancelación Home/historial público seguro, sin ejecutar intenciones pendientes. No link de recuperación falso: sólo destino real propietario integrado.
- `/solicitar-acceso`: AccessRequestForm, sólo Correo electrónico, CTA Solicitar acceso a la Beta. Helper: Enviar esta solicitud no crea una cuenta ni garantiza una invitación. Estados editable/inválido/enviando/neutral/429/indisponible. Resultado uniforme Solicitud recibida, sin activar cuenta ni prometer correo/plazo;429 espera retryAfter servidor. Error conserva correo únicamente en memoria y retry explícito. Regresar a Home secundario; sin nombre/teléfono/password/check jurídico/campos marketing.
- `/mi-cuenta` ordinaria: h1 Mi cuenta → correo/verificación/estado read-only desde contrato → SecurityNotice/sesiones propias SessionList/Item/SignOutOtherSessionsAction → zona de eliminación201 con ConfirmDialog/LoginForm.REAUTH_ACCOUNT ya diseñados. No inventar nombre/avatar/edición/cambio de contraseña. Carga/vacío/sesión actual/cierre confirmado/error conservan owners.
- `/mi-cuenta` restringida: sólo estado/fechas/cancelabilidad y consulta/cancelación autorizadas del owner015; no montar seguridad/sesiones/eventos ordinarios. Diferenciar pendiente/irreversible/ACK desconocido; pérdida de permiso retira datos privados, no confirma eliminación.
- Logout: sin modal destructivo nuevo. Cerrando sesión… evita doble envío; éxito confirmado o sesión ya expirada/revocada → `/`, cerrar menú, limpiar presentación privada y foco h1, anuncio Sesión cerrada. Fallo: No se pudo confirmar el cierre de sesión, retry/reconciliación; no anunciar éxito, restaurar autoridad por apariencia ni cerrar guest/admin. Home usable.
- Guest `/g/:lookupKey`: conservar entrada directa y componentes owners, sin Home/login organizador obligatorio. Admin no tiene acceso público nuevo. Wildcard seguro: error neutro y Volver al inicio sin enumeración; errores de chunk/router con retry accesible dentro infraestructura aceptada, no diagnóstico interno.

## Copy de diseño revisado

Fuente editorial: [sesión B](../product/sessions/2026-10-12-el-ep-018-editorial-and-routes.md#b-copy-propuesto-para-el-home). CONFIRMED dirección/CTA/cuatro preguntas; texto siguiente revisado UX e incorporado como copy de diseño, **no aprobación jurídica ni claim comercial nuevo**.

Hero H1: **Tu evento termina. Sus recuerdos continúan.**

Subtítulo: Cada invitado vive momentos diferentes. Con EventLens, puedes reunir sus fotos y videos en un espacio dedicado a los recuerdos de tu celebración, de manera sencilla y sin que tus invitados tengan que crear una cuenta.

CTA exacto en header/hero/cierre: **Solicitar acceso a la Beta**, sin punto en botón. Microcopy uniforme: **Acceso disponible mediante invitación.** El CTA editorial no desaparece silenciosamente por sesión activa; accesos operativos en cabecera.

Beneficios — **Cada mirada cuenta**. Intro: Los recuerdos más especiales no siempre están en una sola cámara. Invita a tus familiares y amigos a compartir lo que vivieron, reúne esas perspectivas y vuelve a disfrutar de cada momento.

1. **Entre todos:** Cada invitado aporta su perspectiva.
2. **Sin complicaciones:** Participación desde el navegador mediante un enlace o QR.
3. **En un lugar:** Fotos y videos reunidos por evento.

Cómo funciona, cuatro pasos informativos:

1. **Prepara tu evento.** Crea un espacio para tu celebración y configura cómo participarán tus invitados.
2. **Comparte la invitación.** Envía un enlace o código QR a quienes estarán contigo.
3. **Cada mirada cuenta.** Los invitados comparten sus fotografías y videos desde el celular, sin registrarse.
4. **Revive los recuerdos.** Consulta los contenidos disponibles y recupera tus recuerdos según las opciones habilitadas para el evento.

Privacidad — **Tus recuerdos, tu espacio, tus decisiones**. Gestiona el acceso y la participación de tus invitados y configura la disponibilidad de la galería. El contenido pertenece al espacio privado del evento y su acceso depende de la configuración, los permisos y el estado del evento.

FAQ exactamente cuatro, preguntas/respuestas visibles semánticas, sin Accordion nuevo:

- **¿Qué es EventLens?** Es una plataforma para reunir las fotografías y videos que comparten los invitados de un evento.
- **¿Cómo funciona el código QR?** El organizador comparte un QR o enlace que permite acceder al espacio del evento. Algunos eventos pueden solicitar un PIN.
- **¿Mis invitados necesitan crear una cuenta?** No. Pueden participar sin registrarse, siguiendo las condiciones de acceso y participación del evento.
- **¿Cómo puedo solicitar acceso a la Beta?** Utiliza el botón «Solicitar acceso a la Beta». Tu solicitud será revisada; enviarla no garantiza una invitación inmediata.

Cierre — **Cada celebración tiene una historia.** Haz que todos formen parte de ella y revive los recuerdos desde diferentes miradas. Repetir CTA/microcopy anteriores. Revive evita sugerir retención indefinida.

Footer: wordmark, Los recuerdos de cada celebración, reunidos en un solo lugar, copyright/año aplicable. Links legales únicamente documento aprobado/destino real. Si no existen, omitir sin disabled/enlacefalso/contacto inventado. Sin redes/directorio/condiciones nuevas. Galería/descargas siempre según permisos/estado/disponibilidad, sin descarga guest original ni privacidad absoluta.

## Identidad, responsive y assets

Logo p2 en enlace Home con EventLens anunciado una vez; proporción/área libre/minimos validados203, fallbacktexto y espacio estable sin icono roto. Manrope700 display/600headingbutton/500label/400bodycaption, system-ui,sans-serif fallback; roles vigentes azulCTA/coraldecorativo, sin birthday global o recolor proyectado.

Mobile-first: vertical, CTA ancho útil/full cuando corresponda, beneficios/pasos apilados. Tablet puede agrupar conservando DOM;desktop max1200CSSpx, hero2columnas sólo siimagenadmisible. Header estático móvil/zoom;sticky si compensaciónanclas/foco probado. No sidebar. Fotografías de celebración son dirección, no assetaprobado: entrega completa inicial con texto/espacio/roles, sin framevacío, stocksinlicencia, fotosprivadas ni ImageGen. Futuroasset requiereprocedencia/autorización/alt, no bloquea planificaciónHome.

## Accesibilidad, pruebas y release

Skiplink, landmarks, headings, foco alh1/h2 porruta/ancla, keyboard/menu/Escape, contraste4.5:1normal/3:1grande/control pertinente, estado contexto. Target44×44objetivo, reducedmotion sin scrollanimado obligatorio. Liveannouncements sólo resultados, no página/ticks;forms labels/errores asociados. Ensayar320/375/768/1024/1440CSSpx,zoom200%,400%equivalente320 y nombres largos/fallofuente/logo. Sin horizontal, CTAtruncado o cierre oculto.

Vitest composición/estados reales;Playwright runtime/rutas/refreshHomeactivo sinredirect/retornoexterno rechazado/logoutbackforward/guestdirecto/restringida/Beta neutral429/menú/foco. APIcontratos autorización/CSRF no se sustituyen por mocks. Revisión manual lector, automatización no certificaAA absoluta. Cumplir budgets buildexistentes; sin foto/no carga opcional pesada para montarHome, no SLAinventado.

No nuevo consentimiento/retención/claim jurídico. Planificación y pruebas no bloqueadas porEP017, **publicación externa** conserva EP017/Q029. No presentar formulario/endpoint real sin su integración ni declarar pruebas/dispositivos noejecutados.
