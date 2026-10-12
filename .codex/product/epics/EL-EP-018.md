# EL-EP-018 — Home público y navegación de entrada a EventLens

## Status
DRAFT — propuesta de producto para revisión; no aprobada por requirements_reviewer, ui_designer ni architect. No genera tickets ni modifica decisiones aceptadas.

REQUIREMENTS_READY: PARTIAL — doce elecciones editoriales, comportamiento de `/` y reglas A/B/C de cuenta, retorno tras login y QR están confirmadas. Pendientes copy literal, integración/contratos técnicos de rutas restantes, revisión UX y requisitos.
READY_FOR_TICKET_WRITING: NO — completar dictamen de requisitos, contratos de rutas y handoff UI; no generar tickets por aprobación editorial.
UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: NO — pendiente evaluación de navegación pública y autenticada.
READY_FOR_IMPLEMENTATION: NO — no hay autorización por crear este documento.

## Module
Transversal frontend — aplicación web existente; consume MOD-001 (identidad), MOD-002 (organizador/eventos) y MOD-003 (acceso guest). **No crea módulo de dominio nuevo** ni sustituye owners de rutas, permisos o cuentas.

## Objective / outcome
Una persona que abre la URL principal de EventLens comprende el valor del producto, reconoce que la BETA es privada y encuentra una navegación inequívoca para iniciar sesión, solicitar acceso o ir a su cuenta y eventos si ya está autenticada. Un invitado sigue usando el enlace o QR privado del evento que recibió, sin registrar una cuenta.

## Problem solved
La raíz Angular actual (`apps/web/src/app/app.component.ts`) presenta una vista técnica de conectividad API, no una entrada operativa de producto. Existen shells/componentes por rol y servicios de identidad, pero no debe confundirse su existencia con navegación real desde la raíz. Un Home desarticulado puede inducir registro abierto, desvelar eventos privados, añadir rutas falsas o duplicar el dashboard del organizador.

## Actors
- Visitante sin cuenta/invitación que explora el producto.
- Organizador invitado con cuenta y sesión activa; organizador cuya sesión expiró.
- Invitado con enlace/QR revocable del evento, sin cuenta propia.
- Administrador autenticado: usa su flujo existente, sin acceso administrativo público por defecto.

## Scope

### 1. Home de entrada (dirección editorial confirmada; copy propuesto)
- Ruta conceptual `/`: página pública de presentación, ligera y responsive. Ruta final/estrategia de Angular Router se valida contra contratos frontend existentes, no se presupone implementada.
- Cabecera corporativa con logo primario oficial, navegación por secciones del Home y CTA principal según contexto de sesión.
- **Enfoque editorial confirmado:** emoción del evento como eje, para organizadores, tono emotivo/cercano/claro. **H1 literal propuesto:** «Tu evento termina. Sus recuerdos continúan». Subtítulo y copy final: [consolidación editorial y rutas](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md#b-copy-propuesto-para-el-home), sujetos a revisión UX.
- «Cómo funciona»: cuatro pasos prácticos enlazados a una historia emocional: preparar evento → compartir QR/enlace → invitados suben fotos/video sin cuenta → consultar y revivir recuerdos disponibles. Los pasos informan; no conceden permisos ni prometen galería/exportaciones siempre disponibles.
- «Beneficios»: combinar en ese orden participación colectiva («Cada mirada cuenta»), facilidad mediante QR/navegador y recuerdos reunidos en el espacio privado del evento. Mencionar descargas únicamente según permisos, estado y disponibilidad real. Evitar prometer prestaciones aún no operativas o futuras.
- «Privacidad y control»: combinar privacidad y control del organizador; texto marco propuesto «Tus recuerdos, tu espacio, tus decisiones». QR/enlace revocables, no directorio público de eventos, contenido privado y políticas efectivas aplicadas por servidor. Evitar afirmar certificaciones o protección absoluta.
- Beta **discreta**: sin sección promocional extensa. CTA principal confirmado «Solicitar acceso a la Beta» en hero y cierre, aclaración breve «Acceso disponible mediante invitación». Se consume EL-TK-008; no emite invitación ni da acceso inmediato, no hay pago/registro público libre. Si falta UI, owner de identidad/integración la entrega.
- FAQ de **exactamente cuatro preguntas confirmadas**: (1) ¿Qué es EventLens? (2) ¿Cómo funciona el código QR? (3) ¿Mis invitados necesitan crear una cuenta? (4) ¿Cómo puedo solicitar acceso a la Beta? Respuestas breves en [copy propuesto](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md#faq--cuatro-esenciales); no añadir FAQs de precio, plazos legales o features no cerradas.
- **Cierre emocional confirmado:** «Cada celebración tiene una historia» como título propuesto y llamado a participar; CTA repetido «Solicitar acceso a la Beta» con microcopy discreto. **Footer minimalista**: logotipo, frase breve, copyright, enlaces legales **solo cuando existan destinos/documentos válidos y aprobados**. No añadir navegación grande, redes ni contacto no acordado. Sin enlaces muertos ni políticas inventadas.

### 2. Navegación por estado de acceso
| Contexto | Cabecera/acciones de entrada | Destino propietario |
|---|---|---|
| Visitante sin sesión | **Cómo funciona, Beneficios, Privacidad, Preguntas frecuentes**; **Iniciar sesión** y **Solicitar acceso a la Beta** | Login en `/ingresar` confirmado funcionalmente y solicitud Beta de MOD-001; el Home no construye credenciales |
| Organizador con sesión activa | Menú editorial equilibrado según responsive; **Mis eventos**, **Mi cuenta**, **Cerrar sesión**; permanece en `/` sin redirect | `/mi-cuenta`: datos básicos de cuenta, seguridad, sesiones, opción de solicitar eliminación; UI compuesta reutilizando EL-EP-001/015, no segundo dashboard. Eventos: EL-EP-002, autorización backend |
| Sesión pendiente/restringida por eliminación | Acceso a consulta/cancelación de solicitud según contrato MOD-001/MOD-008, **sin** Mis eventos ni poderes normales | EL-EP-015 / EL-TK-186,191,192,201; no elevar sesión restringida |
| Sesión expirada/revocada | Acceso público y **Iniciar sesión**; no presentar nombres/recursos privados | MOD-001, mensaje accesible neutro, return target seguro si aplica |
| Invitado de evento | Sigue el deep link/QR privado y, si corresponde, PIN; enlace de regreso al Home solo si no altera sesión | EL-EP-004; no buscador/listado/código de evento inventado |
| Admin | Acceso a su consola solo mediante contrato/sesión administrativa previa | EL-EP-012/EL-TK-044, nunca enlace que sirva de autorización |

### 3. Rutas y arquitectura (nombres tentativos, NO contratos aceptados)

**Auditoría de snapshot de `stage`:** `main.ts` sólo inicia `AppComponent`; no se observó configuración de Angular Router ni rutas productivas; la raíz presenta health técnico. Los módulos existentes no demuestran URLs montadas. [Evidencia y matriz de decisiones](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md#c-auditoría-técnica-acotada-de-rutas-en-el-snapshot-de-stage).
| Intención | Ruta candidata | Condición |
|---|---|---|
| Home | `/` | CONFIRMED: pública con/sin sesión, sin redirección automática |
| Iniciar sesión | `/ingresar` | **CONFIRMED como destino funcional** del login de organizador, no ruta Angular implementada; componer auth owner existente |
| Solicitar acceso Beta | `/solicitar-acceso` | Reutilizar EL-TK-008; mensaje neutro sin enumeración |
| Mis eventos | `/mis-eventos` | Sesión/autoridad organizador; componer shell actual |
| Mi cuenta | `/mi-cuenta` | **CONFIRMED como destino funcional** de gestión propia: datos básicos, seguridad, sesiones, opción de solicitar eliminación; reutilizar EL-EP-001/015 |
| Evento recibido por QR | Ruta de credencial pública ya establecida por EL-EP-004 | **No renombrar** ni publicar el token en Home/analytics |

`/`, `/ingresar` y `/mi-cuenta` tienen **comportamiento/destino de producto confirmado**; su implementación técnica no existe todavía en el bootstrap auditado. `/solicitar-acceso` y `/mis-eventos` son **paths candidatos**, pendientes de contrato. No crear APIs ni endpoint de directorio de eventos. Resolver deep links/direct refresh sin `404` de servidor, sin convertir urls de media privada en páginas públicas.

Las anclas candidatas de secciones son `/#como-funciona`, `/#beneficios`, `/#privacidad` y `/#preguntas-frecuentes`, no rutas independientes. Guest conserva el path real que emite el dominio; no inventar `/evento/:id`. **CONFIRMED — navegación protegida:** si alguien entra a `/mi-cuenta` sin una sesión de organizador válida, navegar a `/ingresar`; tras autenticarse correctamente, volver al **destino interno seguro solicitado** si conserva autorización. Validar estrictamente URL local y autorización para impedir open redirect; no usar credenciales de QR ni sesiones guest como `returnUrl`. La cuenta pendiente de eliminación utiliza exclusivamente gestión restringida según EL-EP-015. **CONFIRMED — guest:** acceso directo desde URL revocable emitida por EL-EP-004, sin desvío por Home ni exigencia de login organizador. Permanecen por cerrar logout, composición Angular Router, SPA fallback, paths aún candidatos y el **formato real** de la URL QR.

### 4. Composición frontend y diseño
- Integrar Angular Router/entrada productiva en `AppComponent` usando shells existentes; la comprobación de health queda interna/operativa y no ocupa el Home de usuarios.
- Reutilizar patrones canónicos `AppHeader`, `LegalFooter`, botones/links y componentes de marca. Si requiere variante pública de cabecera o `PublicHomePage`, `ui_designer` debe aprobar nombres/clasificación; **no inventar** un segundo OrganizerDashboard ni duplicar auth.
- Respetar `docs/branding/MANUAL-DE-MARCA.md` y CR-004/EL-TK-203/204: logo oficial página 2, favicon página 5, Manrope 700/600/500/400 y `system-ui, sans-serif` solo fallback; colores/tokens semánticos separados. Personalización birthday no aparece en Home/cuenta global.
- Mobile-first, secciones escaneables, CTA legible, navegación con teclado, foco visible, enlaces con nombre accesible, cambios de sesión anunciados proporcionalmente, contraste WCAG 2.2 AA y reflow/zoom.

## Out of scope
- Registro público libre, aprobación automática de acceso o checkout/pagos/precios.
- Feed o buscador público de eventos/galerías, listado de contenido privado, previews de media personales.
- Dashboard, pantalla de cuenta, login, recuperación o consola admin *nuevos*: sus módulos conservan ownership; el Home enlaza/compone las capacidades existentes y registra cualquier integración faltante.
- Nuevo motor de tematización, dark-mode global, framework UI alternativo, SSR/SEO técnico obligatorio sin evaluación.
- Publicación externa sin revisar EL-EP-017/Q-029 cuando corresponda; no sustituye revisión jurídica de condiciones/privacidad.

## Business rules
- **CONFIRMED desde producto vigente:** BETA por invitación, cuenta de organizador con correo verificado, acceso guest sin cuenta mediante enlace/QR, contenido privado y autorización por servidor. EL-TK-008 acepta solicitud Beta sin activación ni revelación de cuenta existente.
- **CONFIRMED — aprobación explícita 2026-10-12:** Home `/` accesible con o sin sesión. No hay redirección automática del organizador autenticado; se muestran enlaces `Mis eventos` y `Mi cuenta` según permisos y tipo de sesión. La navegación no sustituye autorización server-side.
- **CONFIRMED — reglas A/B/C de navegación 2026-10-12:** `/mi-cuenta` compone datos básicos, seguridad, sesiones y opción de eliminación desde owners EL-EP-001/015 (sin segundo dashboard). Entrada no autenticada a `/mi-cuenta` conduce a `/ingresar`, con retorno al destino original interno y autorizado tras login; estado pendiente de eliminación sólo muestra operaciones restringidas. Guest QR llega directo al evento, sin Home ni login de organizador. Los paths mencionados están aceptados como **destinos funcionales**, no acreditan código Angular listo.
- Las acciones de navegación nunca reemplazan guards/server policies, no infieren `canView` por estado visual, no registran secretos ni tokens en analítica; deep links autorizan según dominio propietario.
- **CONFIRMED 2026-10-12 — dirección editorial:** doce elecciones registradas en [sesión de consolidación](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md#a-doce-decisiones-editoriales-confirmadas), sin atribución personal. H1/subtítulos/FAQ/cierre literales son **copy propuesto** sujeto a aprobación final de UX/copy. No afirmar aprobación legal, ausencia de fallos o tiempos comerciales no aceptados.

## Main scenarios
1. Visitante entra a Home, entiende EventLens, consulta cómo funciona y navega a `Iniciar sesión`.
2. Visitante no invitado pulsa `Solicitar acceso a la Beta`, presenta solicitud y recibe respuesta neutra sin activar cuenta.
3. Organizador autenticado abre Home, elige `Mis eventos` o `Mi cuenta`; las rutas requieren permisos vigentes.
4. Organizador sin sesión abre `/mi-cuenta`, va a `/ingresar` y, tras autenticarse, retorna al destino interno original si la sesión tiene autorización; URLs externas, inválidas o no autorizadas no se usan como retorno.
5. Invitado usa el link/QR recibido para ir directamente al evento privado **sin pasar por Home ni login de organizador** ni crear cuenta.
6. Usuario con cuenta en proceso de eliminación tiene navegación restringida conforme a EL-EP-015, no acceso normal a eventos.

## Edge cases
- Sesión pendiente de comprobar: evitar flash de datos o navegación privada; mostrar skeleton/estado neutro sin bloqueo de contenido público.
- Sesión revocada o vencida; navegación back/forward; múltiples pestañas; returnUrl externa prohibida; URL desconocida sin enumeración.
- Fallo temporal del API: Home informativo accesible; CTA dependiente informa indisponibilidad y ofrece reintento, sin mostrar diagnósticos internos.
- Link QR revocado, PIN requerido, evento CLOSED/GRACE_PERIOD, lectura no autorizada: delegar mensajes/estados a EL-EP-004/003, no resolver políticas en Home.
- Usuario administrativo, cuenta pendiente, sesión de eliminación restringida; no filtración de rutas administrativas/privadas como capacidad.
- Documentos legales no disponibles/aprobados: no publicar enlaces falsos ni afirmar versión final.
- Contenido largo, pantalla móvil, zoom 200%, reflow 320 CSS px, teclado, lectores, falta de assets.

## Data
Preferir contenido estático localizado/configuración de presentación sin nuevas tablas. Solo estado de sesión/rol mínimo aportado por identidad; sin almacenar navegación sensible, token guest, información de eventos ni datos nuevos en Home.

## Permissions
Home informativo público; cuenta/eventos exclusivamente por sesión/autoridad/owner del servidor; sesión de eliminación restringida; guest usa acceso event-scoped sin cuenta; admin no obtiene privilegios por mostrar un enlace.

## Integrations
MOD-001 (login/logout/cuenta/Beta EL-TK-008); MOD-002 (Mis eventos/dashboard); MOD-003/EL-EP-004 (QR/deep links); MOD-008/EL-EP-015 (cuenta pendiente y cancelación); UI foundation CR-004, EL-TK-203/204; contenido legal EL-EP-017 para puesta en público; frontend Angular Router y cliente OpenAPI de EL-TD-004.

## Dependencies
- Para **ticket writing**: aprobación de alcance del Home y menú, auditoría de rutas de frontend, revisión `requirements_reviewer`, `ui_designer` y `architect` si modifica composición/bootstrap.
- Para implementación y E2E: auth y destinos reales integrados en runtime, request Beta, navegación owner, deep link guest; evidencia de permisos/no enumeración. Los módulos de dominio ya existentes se reutilizan, no se reabren sus tickets DONE.
- **No dependencia dura** de concluir toda EL-EP-017 para *planificar* la página; publicación pública de contenido legal/servicio mantiene sus gates.

## Relevant non-functional requirements
WCAG 2.2 AA, mobile-first y últimas versiones de navegadores soportados; español inicial/i18n-ready; TLS, privacidad/no-index de eventos privados, CSP y navegación segura, no open redirects, tamaño de assets razonable, sin dependencia de health API para renderizar textos estáticos. Sin analítica de tokens/cuentas.

## Success criteria (propuestos; medir en integración)
- La raíz ya no expone como Home una pantalla de health de desarrollo y renderiza la entrada EventLens aprobada.
- Desde Home, un visitante encuentra login/solicitud Beta con CTA válidos y sin registro libre; el organizador con sesión puede acceder a `Mis eventos` y `Mi cuenta` por ruta protegida.
- Los deep links guest no se interceptan con auth de organizador ni exponen la galería a índice o listados públicos.
- No se añade una credencial nueva de acceso ni se duplica un servicio de cuenta/dashboard; rutas de cuenta/eventos rechazan sesión sin permiso, incluyendo refresh y acceso directo.
- Responsive/teclado/foco/reflow/zoom y estados loading/error/sesión expirada cubiertos mediante pruebas de componentes y Playwright reales, no solo mocks de navegación.
- Los textos/enlaces de legal/contacto corresponden a documentos/canales reales autorizados; no se presenta Beta como registro abierto ni como comercialización en funcionamiento.

## Risks
Scope creep de página marketing; cambio inadvertido de políticas de autenticación; hacer parecer completado un backend sin APIs conectadas al runtime; loops de redirect; home indexable que filtre rutas privadas; incumplimiento jurídico al publicar enlaces/textos no revisados; duplicación de shell/estilos; aparente capacidad habilitada por cliente.

## Decisiones editoriales confirmadas y preguntas restantes

**CONFIRMED — 2026-10-12:** 12 decisiones de dirección editorial y Home `/` con/sin sesión, sin redirección automática; se documentan sin atribución personal en [consolidación](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md). Cabecera equilibrada: «Cómo funciona», «Beneficios», «Privacidad», «Preguntas frecuentes»; CTA principal «Solicitar acceso a la Beta»; footer minimalista. No incorporar una sección Beta extensa. El literal de textos redactados es **PROPOSED**, aún no aprobado por UX/copy.

**PENDING — sin bloquear la propuesta documental:**
1. **COPY/UX:** validar redacción final (hero, subtítulo, beneficios, FAQ, privacidad, cierre, footer), imágenes reales y disposición responsive; no añadir datos/claims no fundamentados.
2. **ARCH/FRONTEND:** producto confirmó `/ingresar` y `/mi-cuenta` y su comportamiento; verificar integración real de esas rutas en Angular Router, guards, retorno a destino interno seguro y composición con owners de identidad/EL-TK-201. Resolver los **paths candidatos** `/solicitar-acceso` y `/mis-eventos` antes de implementación.
3. **INTEGRACIÓN GUEST:** confirmada entrada **directa**, sin Home/login owner. Identificar el formato de URL real emitido por EL-EP-004 y asegurar credencial revocable, PIN y privacidad.
4. **NAV UX:** salida tras logout y disposición exacta del menú autenticado/móvil; manejar estados sesión pendiente/expirada/restringida.
5. **OPS/RELEASE:** Nginx SPA fallback/base href, política de indexación de Home y revisión legal antes de lanzamiento público conforme EL-EP-017/Q-029.

## UI/UX handoff propuesto
UI_REQUIRED: YES.
READY_FOR_FRONTEND_PLANNING: NO — necesita dictamen `ui_designer` y catálogo de componentes.
READY_FOR_TICKET_WRITING: NO — requisitos/producto por confirmar.
Secciones: Header/hero, Beneficios, Cómo funciona, Privacidad, FAQ, cierre con CTA y footer **minimalista**, sin bloque Beta largo. Variantes: visitante, organizer autenticado, sesión desconocida/expirada/restringida y deep-link guest sin Home intermedio. No diseñar segunda pantalla de cuenta; usar owner de identidad. Véase [copy propuesto y auditoría de rutas](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md).

## Definition of Ready
- [x] Objetivo y actores propuestos identificados.
- [x] Alcance y out-of-scope delimitados frente a épicas existentes.
- [x] Contratos de acceso privado y Beta vigente documentados.
- [x] Escenarios y criterios de aceptación comprobables propuestos.
- [x] Comportamiento de `/` con y sin sesión aprobado por el usuario (sin redirección automática).
- [x] Doce elecciones editoriales y estructura de menú/footer confirmadas.
- [x] Alcance `Mi cuenta`, redirect/login/retorno seguro y acceso guest QR directo confirmados (decisiones A/B/C).
- [ ] URLs candidatas restantes, composición efectiva de account y paths QR pendientes de contrato técnico.
- [ ] Copy literal, ilustraciones y tratamiento UX revisados formalmente.
- [ ] Rutas y ownership auditados por architect/frontend.
- [ ] Handoff `ui_designer` aprobado.
- [ ] `requirements_reviewer` sin BLOCKER.
- [ ] Dependencias de implementación y tickets reconciliadas.

## Priority
P0 **propuesta** para entrada/roteo funcional de la Beta (sin navegación no existe app usable desde `/`); contenido institucional/FAQ y SEO fino P1 y pueden entregarse sin desplazar seguridad, galería, exportaciones o purga. La priorización no cambia el roadmap aprobado sin evaluación.

## Change history
- 2026-10-12: confirmadas reglas A/B/C de navegación: alcance de `/mi-cuenta` (datos básicos/seguridad/sesiones/eliminación sin duplicación), `/mi-cuenta` → `/ingresar` → retorno interno autorizado, cuenta con eliminación pendiente restringida y QR guest directo sin Home/login organizador. Contratos de ruta aún requieren integración técnica; gates sin cambios.
- 2026-10-12: confirmadas las 12 decisiones de dirección editorial, incluida navegación equilibrada, FAQ de cuatro preguntas, CTA Beta discreto y footer minimalista. Actualizados alcance, copy propuesto y auditoría de rutas de `stage`; gates y rutas definitivas siguen pendientes. [Registro](../sessions/2026-10-12-el-ep-018-editorial-and-routes.md).
- 2026-10-12: confirmado comportamiento Home `/` accesible con y sin sesión, con atajos al organizador y sin redirección automática; copy, menú y rutas siguen pendientes de aprobación/auditoría.
- 2026-10-12: propuesta de épica nueva a solicitud del proyecto; revisión documental de root actual, EL-EP-001/002/004, manual de marca CR-004 y EL-TK-203/204. Sin tickets, código, contratos nuevos ni aprobación de gates.
