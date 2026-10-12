# EL-EP-018 — Home público y navegación de entrada a EventLens

## Status
DRAFT — propuesta de producto para revisión; no aprobada por requirements_reviewer, ui_designer ni architect. No genera tickets ni modifica decisiones aceptadas.

REQUIREMENTS_READY: PARTIAL — el objetivo y las fronteras se sustentan en el producto vigente; las elecciones del Home se recomiendan, no están aprobadas.
READY_FOR_TICKET_WRITING: NO — completar discovery localizado, dictamen de requisitos y handoff UI.
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

### 1. Home de entrada (propuesta)
- Ruta conceptual `/`: página pública de presentación, ligera y responsive. Ruta final/estrategia de Angular Router se valida contra contratos frontend existentes, no se presupone implementada.
- Cabecera corporativa con logo primario oficial, navegación por secciones del Home y CTA principal según contexto de sesión.
- Hero sugerido: **«Los mejores recuerdos de tu evento, en un solo lugar»** y subtítulo factual: «Comparte un enlace o QR para que tus invitados aporten fotos y videos desde el navegador, sin crear una cuenta».
- Sección «Cómo funciona» (4 pasos): crear/configurar evento con cuenta invitada → compartir enlace/QR → invitados aportan y la galería depende de configuración/moderación → organizador consulta y puede recuperar sus originales según permisos/vigencia. Los pasos informan; no conceden capacidades.
- Sección «Lo que puedes hacer»: fotos/video, carga móvil, galería privada opcional, control del organizador, descargas de originales para dueño cuando estén disponibles y sujetas a seguridad. Evitar prometer prestaciones aún no operativas y diferenciar Beta de funcionalidades futuras.
- Sección «Privacidad y control»: enlaces/QR revocables, eventos no descubiertos desde buscador público, contenido/objetos privados y control de accesos. Evitar afirmar certificaciones legales o técnicas no verificadas.
- Bloque de Beta privada: organizadores solo mediante invitación y correo verificado; sin pagos/registro público. CTA «Solicitar acceso a la Beta» consume la capacidad EL-TK-008, sin emitir invitación ni dar acceso inmediato; si no hay UI de solicitud implementada, su owner debe entregarla.
- FAQ esencial: ¿necesito cuenta para subir? (invitado no); ¿cómo accedo a un evento? (enlace/QR recibido y PIN opcional); ¿pueden todos ver mis fotos? (depende del evento/autoridad); ¿cómo participo como organizador? (invitación Beta). Evitar FAQs de precio, plazos legales o features no cerradas.
- Footer con copyright, enlaces legales **solo cuando existan destinos/documentos válidos y aprobados** y vía de soporte/contacto únicamente si hay canal publicado/acordado. Sin enlaces muertos, consentimiento legal nuevo ni política redactada por inferencia.

### 2. Navegación por estado de acceso
| Contexto | Cabecera/acciones de entrada | Destino propietario |
|---|---|---|
| Visitante sin sesión | Inicio, Cómo funciona, Características, Privacidad; **Iniciar sesión** y **Solicitar acceso a la Beta** | Login y solicitud Beta existentes de MOD-001; el Home no construye credenciales |
| Organizador con sesión activa | Inicio, Cómo funciona (opcional), **Mis eventos**, **Mi cuenta**, **Cerrar sesión** | EL-EP-001 (cuenta/sesiones) y EL-EP-002 (eventos); autorización backend por recurso |
| Sesión pendiente/restringida por eliminación | Acceso a consulta/cancelación de solicitud según contrato MOD-001/MOD-008, **sin** Mis eventos ni poderes normales | EL-EP-015 / EL-TK-186,191,192,201; no elevar sesión restringida |
| Sesión expirada/revocada | Acceso público y **Iniciar sesión**; no presentar nombres/recursos privados | MOD-001, mensaje accesible neutro, return target seguro si aplica |
| Invitado de evento | Sigue el deep link/QR privado y, si corresponde, PIN; enlace de regreso al Home solo si no altera sesión | EL-EP-004; no buscador/listado/código de evento inventado |
| Admin | Acceso a su consola solo mediante contrato/sesión administrativa previa | EL-EP-012/EL-TK-044, nunca enlace que sirva de autorización |

### 3. Rutas y arquitectura (nombres tentativos, NO contratos aceptados)
| Intención | Ruta candidata | Condición |
|---|---|---|
| Home | `/` | Pública, contenido estático de producto |
| Iniciar sesión | `/ingresar` | Reutilizar auth owner existente; URL definitiva según router |
| Solicitar acceso Beta | `/solicitar-acceso` | Reutilizar EL-TK-008; mensaje neutro sin enumeración |
| Mis eventos | `/mis-eventos` | Sesión/autoridad organizador; componer shell actual |
| Mi cuenta | `/mi-cuenta` | Cuenta propia; seguridad, sesiones y eliminación en owners existentes |
| Evento recibido por QR | Ruta de credencial pública ya establecida por EL-EP-004 | **No renombrar** ni publicar el token en Home/analytics |

Estas rutas son **propuestas de navegación** sujetas a auditoría del Router y enlaces actuales. No crean nuevas APIs ni endpoint de directorio de eventos. Resolver deep links/direct refresh sin `404` de servidor, sin convertir urls de media privada en páginas públicas.

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
- **RECOMMENDED:** Home `/` accesible con o sin sesión; no redirigir automáticamente al organizador autenticado, sino mostrar `Mis eventos` y `Mi cuenta` (decisión de UX pendiente de aprobación).
- Las acciones de navegación nunca reemplazan guards/server policies, no infieren `canView` por estado visual, no registran secretos ni tokens en analítica; deep links autorizan según dominio propietario.
- **RECOMMENDED:** copiar solo beneficios realmente disponibles en la fase publicada; no afirmar aprobación legal, ausencia absoluta de fallos ni tiempos/planes comerciales no aceptados.

## Main scenarios
1. Visitante entra a Home, entiende EventLens, consulta cómo funciona y navega a `Iniciar sesión`.
2. Visitante no invitado pulsa `Solicitar acceso a la Beta`, presenta solicitud y recibe respuesta neutra sin activar cuenta.
3. Organizador autenticado abre Home, elige `Mis eventos` o `Mi cuenta`; las rutas requieren permisos vigentes.
4. Organizador sin sesión usa deep link a `Mi cuenta`, va a login y retorna a destino interno permitido tras autenticación si el flujo actual lo soporta.
5. Invitado usa el link/QR recibido para ir directamente al evento privado sin pasar por creación de cuenta.
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

## Open questions — decisiones locales pendientes (no alterar DEC existentes)
1. **PRODUCT — RECOMMENDED:** aprobar Home informativo como entrada `/` para público + usuarios autenticados; estos últimos ven atajos sin redirección automática. Alternativa: redirección a Mis eventos tras login, manteniendo `/` visitable.
2. **PRODUCT — RECOMMENDED:** navegación mínima de Home con Inicio / Cómo funciona / Características / Privacidad, CTA Iniciar sesión + Solicitar acceso Beta; con sesión, Mis eventos / Mi cuenta / Cerrar sesión. El soporte/contacto y FAQs solo con contenido oficial.
3. **PRODUCT — PENDING:** aprobación editorial de hero, textos, claims y FAQ; enlaces legales solo al existir documentos revisados.
4. **TECH/UX — PENDING:** rutas finales existentes, ownership de página de `Mi cuenta`, composición Angular Router y variante pública AppHeader; confirmar sin reimplementación.
5. **RELEASE — PENDING:** política de indexación/dominio de marketing y revisión jurídica previa a despliegue público, distinta de operación privada de invitados.

## UI/UX handoff propuesto
UI_REQUIRED: YES.
READY_FOR_FRONTEND_PLANNING: NO — necesita dictamen `ui_designer` y catálogo de componentes.
READY_FOR_TICKET_WRITING: NO — requisitos/producto por confirmar.
Secciones: Header/hero, Cómo funciona, Capacidades, Privacidad, Beta/CTA, FAQ y LegalFooter. Variantes: visitante, owner logueado, sesión desconocida/expirada/restringida y deep-link guest sin Home intermedio. No diseñar pantalla de cuenta nueva aquí.

## Definition of Ready
- [x] Objetivo y actores propuestos identificados.
- [x] Alcance y out-of-scope delimitados frente a épicas existentes.
- [x] Contratos de acceso privado y Beta vigente documentados.
- [x] Escenarios y criterios de aceptación comprobables propuestos.
- [ ] Menú, copy y comportamiento de Home aprobados por product_owner.
- [ ] Rutas y ownership auditados por architect/frontend.
- [ ] Handoff `ui_designer` aprobado.
- [ ] `requirements_reviewer` sin BLOCKER.
- [ ] Dependencias de implementación y tickets reconciliadas.

## Priority
P0 **propuesta** para entrada/roteo funcional de la Beta (sin navegación no existe app usable desde `/`); contenido institucional/FAQ y SEO fino P1 y pueden entregarse sin desplazar seguridad, galería, exportaciones o purga. La priorización no cambia el roadmap aprobado sin evaluación.

## Change history
- 2026-10-12: propuesta de épica nueva a solicitud del proyecto; revisión documental de root actual, EL-EP-001/002/004, manual de marca CR-004 y EL-TK-203/204. Sin tickets, código, contratos nuevos ni aprobación de gates.
