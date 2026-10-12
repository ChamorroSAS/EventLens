# EventLens: auditoría UI y plan de identidad visual

Fecha: 2026-10-12 (America/Bogota). Repositorio: ChamorroSAS/EventLens. Integración prevista: `stage`.

**Dictamen: diagnóstico y planificación con siete decisiones aprobadas.** La aprobación se registró el 2026-10-12: se precisó la decisión 3 para conservar la tipografía existente y se aprobaron las otras seis recomendaciones. La adopción transversal requiere todavía consolidación documental, validaciones de assets, gates por alcance y las integraciones funcionales de sus tickets propietarios. No se implementaron cambios visuales ni se modificaron contratos, estados del backlog o issues de GitHub. No se asignan trabajos ni aprobaciones a personas concretas.

Convención: **CONFIRMED** = evidencia inspeccionada o instrucción del propietario; **RECOMMENDED** = propuesta; **PENDING** = aprobación o verificación faltante. Un estado documental DONE no equivale a certificación de la aplicación desplegada.

**Seguimiento posterior — 2026-10-12:** [CR-004](../../.codex/product/changes/CR-004.md) consolidó los manuales y formalizó [EL-TK-203](../../.codex/product/tickets/EL-TK-203.md) y [EL-TK-204](../../.codex/product/tickets/EL-TK-204.md), ambos READY de requisitos tras gates aprobados.203 listo para comenzar;204 espera203 validado. [Dictámenes](../../.codex/product/sessions/2026-10-12-brand-planning-gates.md). Las secciones siguientes conservan la auditoría/propuesta previa del snapshot2219dcc, incluidos estados históricos; los artefactos nuevos rigen la planificación actual, sin implementación visual ni atribución personal.

## 1. Corte de auditoría y evidencia

- **CONFIRMED:** `main` y `stage`, locales y consultadas por API de GitHub, apuntaban a `2219dcc6dffeeabc4d1b42e5aeae3130d9830360`; no hay diferencias entre esos snapshots. Las conclusiones aplican a ese commit, no a cambios posteriores.
- **CONFIRMED:** [PR #232](https://github.com/ChamorroSAS/EventLens/pull/232) abierto, no fusionado, base `stage`, head `docs/brand-identity-guide`, SHA `8f846873388564bb4a125c97e662f3aaf63247fc`. Agrega únicamente `docs/brand/brand-manual.md`; propone manual v1.0. No acredita incorporación del frontend.
- **CONFIRMED:** las ramas auditadas ya contienen `docs/branding/MANUAL-DE-MARCA.md` v0.1 y seis assets: PDF y cinco SVG. Es una fuente documental distinta del PR232. La afirmación local de que falta incorporar el PDF está desactualizada respecto del árbol inspeccionado.
- **CONFIRMED:** PDF local de cinco páginas, 827.382 bytes, SHA256 `5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3`. Se renderizaron e inspeccionaron las páginas 2 y 5; el agente UI inspeccionó los mismos renders.
- **CONFIRMED:** 59 archivos `*.component.ts` y 15 `*.spec.ts` bajo `apps/web/src`. Es un inventario de archivos, no 59 componentes certificados ni 15 recorridos E2E.
- Memoria del código: proyecto EventLens, Tier 2, generación `2026-10-09T13:32:56Z`, índice fast. Búsquedas estructurales de AppComponent no devolvieron símbolos. Las consultas de cobertura de los paths utilizados devolvieron `no_recorded_issue` con freshness `not_tracked`; se usaron lecturas directas y búsquedas acotadas. No se dedujo ausencia de código del grafo.
- Se inspeccionaron tests existentes y evidencia histórica de tickets; **no se ejecutaron suites, navegador de la aplicación ni validación en dispositivos reales durante esta auditoría**. La evaluación de UI actual se sustenta en fuente; la evaluación del logo sí incluye inspección visual del PDF.

### Referencias del snapshot

Los enlaces siguientes fijan el commit inspeccionado y permiten reproducir el diagnóstico.

| Evidencia | Fuente | Qué acredita |
|---|---|---|
| E01 | [main.ts](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/main.ts), [AppComponent](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/app.component.ts) | Bootstrap de comprobación de API, sin navegación a features |
| E02 | [angular.json](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/angular.json), [index.html](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/index.html), [tsconfig.app.json](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/tsconfig.app.json) | Styles globales vacíos, favicon no enlazado, entrada de compilación main |
| E03 | [OrganizerDashboard](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/organizer/organizer-dashboard.component.ts), [OrganizerService](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/organizer/organizer.service.ts) | Navegación interna, biblioteca incrustada, secciones informativas y fetch manual |
| E04 | [GuestContainer](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/guest/guest-container.component.ts), [GuestService](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/guest/guest.service.ts) | Sesión PIN local de ejemplo y consentimiento/identidad en memoria |
| E05 | [GalleryComponent](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/gallery/gallery.component.ts), [GalleryService](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/gallery/gallery.service.ts) | Grid, viewer, estados y solicitudes manuales de API |
| E06 | [AdminAppShell](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/admin/admin-app-shell.component.ts), [AdminApiService](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/web/src/app/admin/admin-api.service.ts) | Consola compuesta, tema oscuro y peticiones /api/admin |
| E07 | [AppModule API](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/apps/api/src/app.module.ts), [schema cliente](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/packages/api-client/src/schema.ts) | API registrada y cliente generado limitados a health |
| E08 | [E2E plataforma](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/e2e/tests/platform.spec.ts) | Smoke de health/UI, no recorridos funcionales de producto |
| E09 | [Design system](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/ui-design-system.md), [catálogo](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/ui-components.md), [handoffs MVP](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/ui-mvp-epic-review.md) | Dirección visual, responsabilidades y UX diseñadas; no madurez de código implícita |
| E10 | [Baseline](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/technical-baseline.md), [arquitectura frontend](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/frontend-architecture.md), [API](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/.codex/context/api-conventions.md) | Contratos y decisiones que deben preservarse |
| E11 | [Manual integrado](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/docs/branding/MANUAL-DE-MARCA.md), [arte maestro](https://github.com/ChamorroSAS/EventLens/blob/2219dcc6dffeeabc4d1b42e5aeae3130d9830360/docs/branding/assets/EventLens-logo.pdf) | Fuente gráfica disponible y discrepancias documentales |

## 2. Inventario UI actual

| Área | Implementado con evidencia | Parcial / pendiente | Clasificación auditada |
|---|---|---|---|
| Entrada de aplicación | Título EventLens, readiness, loading/error/retry accesible; cliente generado para health (E01/E07) | No monta shells ni features; no router configurado en bootstrap | Base técnica implementada; aplicación de producto pendiente de conexión |
| Navegación organizador | Shell, dashboard, EventList/Card, EventSettingsNav; biblioteca en sección media (E03) | Crear borrador es no-op; secciones schedule/access/guest/lifecycle/capacity no montan sus formularios/paneles completos | Componentes y navegación interna parciales |
| Autenticación | Backlog declara servicios de identidad implementados | No hay formularios de login/registro/recuperación navegables en el árbol frontend auditado; no certificar UI por pruebas del dominio | UI pendiente |
| Invitado | PIN, consentimiento, identidad, Mis aportes y shell existentes (E04) | onPinSubmitted ignora el PIN y crea session-local-1/token-Date.now; no es autenticación real. Estado de consentimiento/identidad local; falta composición funcional desde raíz | Prototipo de componentes; integración parcial |
| Carga | FilePicker, filas/progreso/alertas, contenedor y servicio local | Presencia de selección/estados no acredita transporte, confirmación durable ni composición con entrada guest | Componentes implementados; recorrido integrado no demostrado |
| Galería | Cards, grid, viewer, reproductores, vacío/deshabilitada, carga incremental y errores (E05) | No accesible desde AppComponent; pruebas con servicios simulados no prueban permisos/red end-to-end | Implementación de feature aislada; integración pendiente |
| Biblioteca organizador | Cards, tabla, filtros, fallo/retry/cuarentena/descarga contextual; dashboard la incrusta | Moderación completa/exportación tienen tickets propios aún pendientes; API pública no integrada en runtime auditado | Feature parcial, reutilizable |
| Consola administrativa | Shell reúne búsqueda/detalle, jobs, auditoría y diálogos de intervención (E06) | Sin entrada autenticada desde raíz; calls manuales no cubiertas por schema health; no probar autorización por headers del cliente | Composición de componentes existente; runtime pendiente |
| Capacidad/lifecycle/auditoría | Paneles, badges, solicitudes y diálogos con specs en sus carpetas | Disponibilidad de módulos no demuestra que el usuario pueda alcanzarlos en aplicación | Reutilizables; validar composición por ticket |
| Marca/asset web | PDF y SVG primary/dark/grayscale/birthday/favicon en documentación (E11) | Sin publicación assets en angular.json ni enlace favicon; no fuente Manrope/woff en frontend | Fuente gráfica disponible; adopción web pendiente |
| Estilos/tokens | CSS inline de componentes y responsive local | styles: []; no foundation semántica común observable; azules distintos y tipografías system. Admin oscuro frente a dirección clara | Estrategia efectiva local; sistema visual parcial |
| Validación | Specs de componentes, evidencia histórica de tickets y smoke Playwright (E08) | No prueba visual, móvil real ni E2E de producto ejecutados aquí | Evidencia limitada; no certificación DONE global |

**Observación de compilación:** tsconfig.app.json parte de main.ts y de declaraciones; un build satisfactorio de la raíz actual no certifica todos los componentes no alcanzables desde ella. Los specs pueden compilarlos de forma aislada. Mantener diferenciados build, pruebas de componente y E2E de la aplicación.

### Diferencias funcionales que no deben ocultarse con marca

1. Conectar la raíz con navegación de organizador/invitado/admin y autenticación: revisar owners existentes; no resolver mediante una nueva maqueta de dashboard.
2. Sustituir sesión PIN local por contrato servidor en EL-TK-083 y sus predecesores. Este informe no afirma un bypass del servidor: acredita una simulación de autorización en el cliente.
3. Completar secciones del dashboard con componentes ya existentes; EL-TK-048 no implementa por sí solo todas las mutaciones. Vincular cada sección a su ticket propietario.
4. Respetar EL-TD-004: organizer/gallery/admin/audit usan fetch manual, mientras schema generado sólo contiene health. Conectar adapters HTTP/OpenAPI por dominio antes de validar sus recorridos; no importar DTO Nest/Prisma ni confiar permisos del cliente.
5. Tratar los gates históricos de identidad con su evidencia posterior: no reactivar un PENDING antiguo de contraseña/tokens sin verificar las correcciones EL-TK-185/186 y contratos vigentes.

## 3. Diferencias frente al manual y propuesta UI/UX

| Tema | Evidencia actual / manual | Propuesta incremental | Estado |
|---|---|---|---|
| Fuente canónica | PR232 docs/brand v1.0 abierto; docs/branding v0.1 integrado | Consolidar una referencia canónica preservando PDF/hash e historia; corregir afirmación de PDF ausente | CONFIRMED decisión; consolidación pendiente |
| Logo | Página 2: wordmark muy ancho, EVENT navy/LENS coral, E de tres barras | Usar SVG fiel, mantener proporción y trazados; no reconstruir con HTML/fuente ni añadir lente | CONFIRMED fuente; adopción RECOMMENDED |
| Favicon | Página 5: E navy de tres barras y L coral | Reutilizar derivado existente tras comparación; probar 16/32/48px y claro/oscuro; no comprimir wordmark | PENDING validación/aprobación |
| Colores de marca | Navy #0B2F53; coral local #FC8350 frente PR #FD8350; magenta local #EF00E8 frente PR #F000E8; gris local #9F9F9F frente PR #A0A0A0 | Conservar muestras vectoriales como evidencia; reconciliar redondeo antes de fijar valores. No alterar arte original para igualarlo a UI | CONFIRMED criterio; validación pendiente |
| Paleta UI | Primary #17345C, accent #F37A5D, fondo #FAFAF8, superficie blanca, textos/bordes/estados en E09 | Mantener roles UI vigentes separados de brand.*, con mapping explícito; no sustituirlos automáticamente por colores del logo | CONFIRMED decisión |
| Tipografía | Manrope y pesos definidos en ui-design-system.md; manual local presenta Inter como candidata y PR system-ui como fuente provisional | Mantener Manrope; system-ui, sans-serif únicamente como fallback técnico. Al consolidar los manuales, eliminar la candidatura contradictoria de Inter. Logo con trazados originales independientes de la fuente UI | CONFIRMED decisión 3; sin cambio de tipografía vigente |
| Modo | Dirección inicial clara; consola/jobs oscuros en código; variante p3 disponible | Alinear con el modo claro vigente; no añadir selector dark ni excepción oscura sin una decisión posterior explícita | CONFIRMED decisión; aplicación pendiente |
| Personalización | Birthday p1 y su SVG son identidad de evento | Limitar portada/bienvenida/acento decorativo al contenedor del evento; identidad/auth/estados/acciones críticas corporativos | CONFIRMED separación; sin nuevo motor de temas |
| Estilos | CTA guest #3182ce, galería #0284c7, picker #2563eb, superficies locales | Mapping semántico compartido, foco/espaciado/controles coherentes y migración feature por feature | RECOMMENDED; styling sigue DEFERRED |

### Propuesta por recorrido

- **Navegación:** conservar shells, contexto del evento, sección activa y salida. Wordmark en headers con espacio; monograma sólo después de validar legibilidad. Marca no reemplaza título de pantalla ni estado del evento.
- **Autenticación:** marca corporativa, propósito, formulario del owner, CTA, alternativas y legales. Reutilizar LoginForm del catálogo para las identidades con contratos separados; no inventar AdminLoginForm. Mantener respuestas neutras, errores asociados y reauth sensible.
- **Invitado:** contexto/portada/bienvenida del evento y marca secundaria estable. PIN sólo si aplica; consentimiento e identidad al iniciar carga conforme al flujo aceptado. Galería no añade consentimiento de carga como requisito nuevo.
- **Carga:** selector nativo, selección, validación, cola por archivo, transferencia, confirmación y resultado real. Mantener error parcial/retry/cancelación por permisos; 100% no implica recibido ni publicado.
- **Galería:** contenido protagonista; grid/viewer existentes, vacío distinto de deshabilitada, error incremental que conserva resultados, revocación y retorno de foco. Sin descarga guest nueva.
- **Organizador:** listado/configuración/biblioteca existentes, jerarquía/espacio/CTA azul; formularios y capacidades siguen sus owners. No convertir el retoque visual en nuevo panel funcional.
- **Admin:** conservar búsqueda/detalle/jobs/auditoría, motivo previo, reauth y estados parciales/read-only. La marca no concede acceso multimedia ni vuelve ejecutable un resultado de auditoría.
- **Móvil:** orden vertical y CTA útil; no tablas obligatorias para guest. Preservar grid existente 2 columnas base/3 a 640px/4 a 1024px inicialmente; verificar zoom y contenido. Desktop aprovecha sidebar/tablas diseñadas. No imponer otra navegación sin demostrar necesidad.

### Accesibilidad y verificaciones visuales

El agente UI calculó contraste sRGB contra blanco: navy #0B2F53 13,59:1; coral local #FC8350 2,47:1; primary UI #17345C 12,48:1; accent UI #F37A5D 2,71:1; success #278C63 4,19:1; warning #D98A26 2,76:1. Estos cálculos no certifican combinaciones reales de componentes ni resuelven el coral definitivo.

Proponer foregrounds de success/warning y contraste por rol. Coral no sirve como texto normal sobre blanco ni botón con etiqueta blanca en esas muestras; el tratamiento particular del logotipo no se extiende a controles. Preservar foco visible/no oculto, teclado, labels/errores, nombres accesibles, anuncios moderados, retorno de foco de diálogo y reduced motion. Probar reflow/zoom y objetivos táctiles; 44px es meta recomendada, no describirlo como mínimo universal WCAG AA.

## 4. Matriz de reutilización

| Responsabilidad | Código/catálogo a reutilizar | Cambio propuesto | Evitar |
|---|---|---|---|
| Identidad y contexto | OrganizerAppShell, AdminAppShell, GuestContainer/EventGuestPageShell; AppHeader conceptual | Asset fiel, jerarquía corporativa/contextual y tokens | Shell/dashboard alternativo por marca |
| Acceso | PIN, ConsentSheet, GuestIdentityForm, MyContributionsList; LoginForm/registro/reset del catálogo | Extensión visual y composición en owner | Login admin duplicado; nuevos pasos/campos |
| Eventos | Dashboard, EventList/Card, EventSettingsNav | Ajuste de jerarquía/espacio y montaje de propietarios | Recrear tarjetas/navegación |
| Carga | FilePicker, UploadFileItem/Container/ProgressSummary, UsageLimitAlert | Estilos semánticos conservando estados | Nueva cola de carga por identidad |
| Galería/media | Gallery/MediaCard/Viewer, MediaViewer, ImagePlayer/VideoPlayer, biblioteca/filtros/fallo/cuarentena | Rol visual común y marca en shell | Segunda galería o cambio de permisos |
| Lifecycle/capacidad | EventStatusBadge, paneles/avisos y diálogos existentes | Tokens y contraste; integración propietario | Colores usados para inferir acciones |
| Consola | Búsqueda/detalle/intervención, JobsViewer, AuditLogViewer/Detail | Reconciliar tema y feedback | Dashboard operativo nuevo; auditoría con comandos |
| Legales/feedback | LegalFooter/links y Alert/InlineMessage/Badge del catálogo | Aplicar patrones diseñados según evidencia de código | Declarar implementado por catálogo; inventar política jurídica |

Madurez de estas extensiones: **PROPOSED**. Formularios/shells conservan ownership de producto; controles genéricos y componentes transversales conservan clasificación del catálogo. No se propone reemplazar componentes funcionales ni introducir biblioteca externa.

## 5. Backlog y PR relacionados: decisiones por necesidad

El backlog contiene owners suficientes para las funciones. Se propone extender o remediar esos tickets, preservando IDs y evidencia histórica; no reabrir ni cambiar DONE durante esta ejecución.

| Necesidad | Tickets/épicas existentes | Evidencia/estado documental | Acción propuesta |
|---|---|---|---|
| Formularios de cuenta/autenticación | EL-EP-001; 008..019, 044; 185/186 para verifier/reauth | Servicios declarados DONE; UI navegable ausente. 044 excluye AdminLoginForm | Verificar gates actuales y añadir alcance UI preciso a propietarios; LoginForm compartido, sesiones separadas |
| Dashboard/configuración/preview | EL-EP-002; 020..025,027..031,047/048 | 048 DONE, issue49 closed/completed; E03 acredita componentes, no recorrido completo | Remediación de composición/navegación y criterios pendientes en 048; mutaciones/preview en sus tickets |
| Lifecycle | EL-EP-003;071..073 | 073 DONE; paneles existentes, workspace incompleto | Integrar bajo 073/048 y aplicar roles aprobados |
| Invitado/PIN/consentimiento | EL-EP-004;074..078,082/083 | 083 DONE, issue98 closed/completed; sesión local contradice integración servidor | Remediación explícita de 083 con predecesores y E2E; sin nuevo flujo guest |
| Compartir/acceso organizador | EL-EP-004;079..081,084/085 | 085 DONE, componentes existentes | Componer en sección access existente; logo en pieza contextual sin alterar QR ni permisos |
| Selección/carga/estados | EL-EP-005;086..095, especialmente094/095 | 094 DONE con specs documentadas; recorrido runtime no demostrado | Completar integración/validación en owners y adaptar estilos después |
| Procesamiento/biblioteca | EL-EP-006;053/054 y EL-EP-007;098/100 | Código reutilizable y estados existentes | Preservar descarga/retry/cuarentena; no ocultar semántica con recolor |
| Galería/visor/móvil | EL-EP-007;096..102, especialmente099/100/102 | 099 DONE, issue119 closed/completed; E05 y specs con mock | Completar conexión guest y E2E móvil en099/102; estilos sin segunda galería |
| Moderación/papelera | EL-EP-008;111/112 | 111 READY en backlog; no asumir implantada por biblioteca | Incorporar identidad en ticket pendiente, conservar política |
| Reportes/retiro y casos admin | EL-EP-009;121..123 | 121/122 READY | Usar tickets existentes; ReportContentAction no equivale a flujo completo |
| Exportación/descarga owner | EL-EP-010;132/133 | 132 READY | Integrar feature y presentación en ticket existente |
| Capacidad/ampliaciones | EL-EP-011;143..145 | 143/144 DONE; paneles y formularios existentes | Verificar montaje/E2E en sus propietarios; tokens sin nueva pantalla |
| Consola/jobs/intervenciones | EL-EP-012;153..155 | 154 DONE, issue179 closed/completed; E06 evidencia composición aislada | Integración/auth por propietarios; reconciliar visual sin modificar grants |
| Notificaciones/correos | EL-EP-013;164/165 | 164 READY | Añadir uso de marca a plantillas/avisos dentro164, no canal/bandeja nuevos |
| Auditoría | EL-EP-014;175/176 | 175 DONE, issue201 closed/completed; visor en shell | Reutilizar consulta; validar tema/integración, no comandos |
| Eliminación/reauth | EL-EP-015;200..202 | 200/201 READY | Aplicar foundation aprobada en tickets existentes; conservar irreversibilidad y copy |
| Assets oficiales/foundation | Sin owner específico encontrado; 048 excluye librerías/CSS/iconos | Logo documental no publicado, tokens comunes ausentes | Dos gaps transversales propuestos en sección6 |

Números de issue y ticket no son intercambiables. Las consultas directas confirmaron cierres de #49/#98/#119/#179/#201; los estados del resto en esta matriz son del backlog inspeccionado, sin atribuir estado remoto no verificado.

PR de planificación localizados: [#75](https://github.com/ChamorroSAS/EventLens/pull/75) (003), [#88](https://github.com/ChamorroSAS/EventLens/pull/88) (004), [#103](https://github.com/ChamorroSAS/EventLens/pull/103) (005), [#104](https://github.com/ChamorroSAS/EventLens/pull/104) (007), [#124](https://github.com/ChamorroSAS/EventLens/pull/124) (008..010), [#158](https://github.com/ChamorroSAS/EventLens/pull/158) (011..013), [#191](https://github.com/ChamorroSAS/EventLens/pull/191) (014/016), [#211](https://github.com/ChamorroSAS/EventLens/pull/211) y [#213](https://github.com/ChamorroSAS/EventLens/pull/213) (gates/plan015). Su localización no certifica implementación ni estado de merge. PR232 es el cambio de marca abierto verificado.

La implementación UI también tiene commits concretos: `927dd7e` (organizador047/048 y biblioteca098/100), `776a05a` + `c1aa194` (galería099), `54c7f42` (guest/acceso078..085), `22458d6` (carga087..095), `a7e392d` (consola154), `4244832`/`8a4691a` (capacidad143/144). Se inspeccionó historial acotado; no se atribuyó a esos commits un PR que las búsquedas no demostraron.

Contraste remoto de deduplicación: búsquedas de issues por favicon/branding/identidad visual/design tokens/foundation/Manrope localizaron únicamente la referencia a tokens de EL-TK-175 (#201), cuyo alcance es el visor de auditoría. Búsquedas específicas de PR por brand/tokens/Angular localizaron PR232 y no demostraron un owner de implementación para esos dos gaps. Es evidencia de búsqueda acotada, no garantía de inexistencia de trabajo sin esos términos. Revalidar antes de crear IDs.

PROJECT.md, MODULES.md y ROADMAP.md mantienen personalización avanzada/branding por evento fuera del MVP/FUTURE. El plan conserva esta frontera: separación visual del contenido ya existente, sin constructor de temas, persistencia nueva ni capacidades adicionales de personalización.

## 6. Tickets nuevos estrictamente necesarios: borradores de gaps

**CONFIRMED:** aprobada la recomendación de formalizar dos gaps transversales conforme a la decisión 6. Estos borradores aún no tienen IDs EL-TK asignados, no son issues creados ni tickets READY. Se vinculan a las épicas existentes consumidoras; no se crea una épica de marca nueva. Antes de formalizarlos, incorporar la reconciliación aprobada, obtener gate UI YES y revisar deduplicación final. La aprobación del alcance no sustituye esos gates ni acredita implementación.

### GAP-BRAND-ASSETS: validar y publicar arte oficial

**Gap demostrado:** assets sólo documentales, favicon sin enlace y assets sin configuración Angular (E02/E11). Los tickets de navegación/guest/galería no tienen responsabilidad de publicar el arte corporativo.

- Alcance: conservar PDF maestro/hash, comparar SVG existentes con p2/p3/p4/p5 y reutilizar los fieles; corregir export únicamente ante diferencia demostrada. Publicar derivados aprobados en una ubicación compatible con Angular y enlazar favicon. Registrar página fuente, versión y aprobación.
- Exclusiones: redibujo, cumpleaños global, cambios de permisos, nueva PWA, dark mode completo. PNG/ICO adicionales sólo si compatibilidad aprobada lo exige; iconos PWA no forman parte del mínimo.
- Dependencias: decisión fuente canónica, reconciliación de muestras/minimos y aprobación de monograma. No depende de construir otra galería.
- Aceptación propuesta: el arte web conserva geometría/proporción/colores de la fuente aprobada; favicon se reconoce en16/32/48px claro/oscuro; build sirve assets sin404 y declara icono; wordmark tiene tratamiento alt/nombre adecuado y no duplica anuncio; birthday no aparece en root ni login.
- Pruebas: comparación visual PDF/SVG, pruebas de legibilidad a tamaño real, requests de assets del build, navegación del favicon y accesibilidad del header. No sustituir por asserts que sólo comprueban nombres de archivos.
- Riesgos: doble fuente canónica, márgenes del PDF que reduzcan símbolo, redondeo distinto de color y pérdida de geometría al exportar.
- Estimación propuesta: S/M; revisión de marca y ejecución mecánica delegables según responsabilidades y disponibilidad, sin asignación personal.

### GAP-BRAND-FOUNDATION: roles visuales compartidos y adopción acotada

**Gap demostrado:** design system documental, styles globales vacíos y CSS inline heterogéneo;048 excluye CSS/iconos/librerías. No se encontró ticket propietario de foundation/tokens/fuente.

- Alcance: mapear marca separada de roles semánticos UI y acentos decorativos por evento; mantener Manrope y sus pesos definidos con system-ui, sans-serif como fallback técnico; concretar foco, escala básica/espaciado/radios y superficies conforme a las decisiones aprobadas. Introducir foundation mínima en apps/web y migrar sólo shells/controles compartidos acordados. Cada feature migra posteriormente en su owner de sección5.
- Exclusiones: biblioteca UI/iconos, cambio de Angular, package nuevo sin reutilización concreta, Tailwind/Nx por defecto, rediseño de pantallas, reglas de negocio o motor persistente de tematización.
- Dependencias: reconciliación visual y decisión acotada sobre implementación de estilos DEFERRED; aprobación del alcance piloto. GAP-BRAND-ASSETS si el piloto muestra logo. Contratos runtime propietarios si el piloto necesita recorrido real.
- Aceptación propuesta: CTA principal usa rol azul; coral sólo acento; error/success/warning/foco tienen contrastes verificados por uso; personalización de evento no modifica logo/auth/danger/permiso; Manrope conserva pesos vigentes y system-ui, sans-serif funciona sólo como fallback; tamaño base validado; shells piloto consumen los mismos roles manteniendo interacciones/estados.
- Pruebas: contraste sobre superficies reales, teclado/foco/dialog return, zoom200% y reflow320CSSpx, móvil/tablet/desktop, reduced motion y comparación visual de estados. Regresión funcional de owners migrados; E2E cuando exista recorrido real.
- Riesgos: cascada global, cambio de significado de estados, admin oscuro sin aprobación, carga de fuente/layout shift, migración masiva que oculte regresiones.
- Estimación propuesta: M; limitar el primer ticket a foundation y piloto compartido. Evitar un ticket monstruo que migre todas las features.

## 7. Orden y rutas incrementales

| Orden | Trabajo | Owner propuesto | Condición de salida |
|---|---|---|---|
| 0 | Consolidar PR232/manual integrado/design system conforme a las siete decisiones aprobadas | Product/backlog + UI; documentación | Fuente única, roles conservados, mínimos validados e historia preservada |
| 1 | Requirements review y verificación baseline afectada; gate UI de la extensión | Requirements reviewer/arquitectura/UI | READY_FOR_FRONTEND_PLANNING YES para alcance concreto; no rebaja gates previos |
| 2 | Formalizar sólo dos gaps y actualizaciones propietarias aprobadas | Ticket writer + requirements reviewer | Tickets atómicos, sin duplicación; dependencias reales conocidas |
| 3A | Validación/publicación de assets | GAP-BRAND-ASSETS | Arte fiel, favicon legible y assets disponibles |
| 3B | Auditar/remediar integración root/API/auth/PIN | 013/044/048/083 y ownersHTTP | Contratos y navegación reales; no nueva arquitectura ni privilegios cliente |
| 4 | Foundation y piloto acotado | GAP-BRAND-FOUNDATION | Estilos compartidos aprobados y regresión del piloto |
| 5 | Invitado: entrada/carga/galería móvil | 083/094/099/102 y predecesores | Recorrido real y estados/permisos preservados |
| 6 | Organizador: configuración/biblioteca/lifecycle/capacidad | 048/073/085/100/143; pendientes 111/132 | Montaje correcto y estética común por sección |
| 7 | Admin/auditoría/avisos y pendientes sensibles | 144/153/154/175/164;121/122/200/201 | Tema aprobado, intervención segura y regresión por owner |

3A y revisión funcional de3B pueden avanzar de forma independiente después de aprobación del alcance respectivo. No dos agentes editando mismos archivos. Foundation no certifica UI funcional ni sustituye contratos/API ausentes. No poner fecha de entrega sin disponibilidad/estimaciones confirmadas.

Ruta de entrega después de aprobación: analyst cuando necesario → planner → implementer apropiado → tester → reviewer según riesgo → documentación afectada. Mantener Angular/TypeScript, REST/JSON/OpenAPI y cliente generado, pnpm, Vitest/Playwright y PG real para pruebas de persistencia. No elegir librería/UI/iconos/styling como efecto colateral de marca.

## 8. Trabajo delegable sin asignación personal

La delegación se realizará según responsabilidades, competencias y disponibilidad confirmadas. No se asignan tareas a personas concretas ni se enviaron mensajes externos.

| Trabajo acotado | Evidencia a entregar | Dependencias / revisión |
|---|---|---|
| Inventario/export fiel de assets | Comparación p2..5, hash/versiones y medidas | Fuente canónica consolidada y mínimos validados; no redibujo |
| Favicon y publicación Angular | Pruebas16/32/48, compatibilidad y requests sin404 | GAP-BRAND-ASSETS aprobado |
| Mapeo mecánico de estilos piloto | Diff pequeño, screenshots de estados y contraste | Foundation/tema/tipo aprobados; reviewer |
| Ajuste de cards/grid/formularios existentes | Móvil/tablet/desktop, zoom/foco y resultados funcionales | Tickets propietarios integrados; no reemplazar componentes |
| QA de identidad y responsive | Matriz navegador/dispositivo/estado, incidencias reproducibles | Recorrido real disponible; no certificar por mock |

La integración de identidad, sesiones, permisos y API requiere revisión técnica de sus módulos propietarios; no asignarla como retoque visual rutinario. Las decisiones que afecten baseline conservan sus gates, sin atribución personal.

## 9. Registro de las siete decisiones aprobadas

Las siete decisiones están **CONFIRMED / APROBADAS** por instrucción explícita del usuario. Las comprobaciones técnicas pendientes no vuelven a abrir su aprobación ni certifican implementación.

| Decisión | Criterio aprobado | Trabajo pendiente |
|---|---|---|
| 1 — Fuente canónica | Consolidar referencia única entre docs/brand y docs/branding preservando PDF/hash y trazabilidad del PR232; corregir texto PDF ausente | Consolidación documental |
| 2 — Colores de arte y roles UI | Validar redondeo de muestras del logo; mantener primary/accent UI vigentes como roles separados de marca | Validación de muestras y mapping documentado |
| 3 — Tipografía | Mantener Manrope y sus pesos de ui-design-system.md; system-ui, sans-serif únicamente como fallback técnico. El logo conserva sus trazados vectoriales originales, independientemente de la fuente UI. Al consolidar los manuales, eliminar las referencias contradictorias que presentan Inter como candidata, sin modificar la decisión tipográfica existente | Consolidación de referencias y futura implementación de carga/fallback |
| 4 — Logo/favicon | Validar mínimos, área libre y p5 mediante pruebas; no tratar los 140px provisionales del PR como medida oficial | Pruebas de legibilidad y fidelidad; medidas definitivas |
| 5 — Consola | Alinear con el modo claro vigente, conservando componentes y funciones | Validación y futura migración visual; sin nueva excepción oscura |
| 6 — Gaps y remediación | Formalizar los dos gaps transversales y actualizaciones de tickets propietarios preservando cierres históricos, tras los gates aplicables | Deduplicación final, gates y tickets atómicos |
| 7 — Alcance y orden | Assets y foundation piloto, después guest móvil y restantes módulos; delegación por responsabilidad y disponibilidad | Plan operativo sin fechas comprometidas ni asignaciones personales |

Pesos conservados: Display 700; Heading 600; Button 600; Label 500; Body 400; Caption 400. La decisión 3 mantiene la tipografía vigente; no introduce una sustitución de fuente.

La separación marca corporativa/personalización por evento, p2 oficial y p5 candidato ya son instrucciones confirmadas del usuario: no necesitan reaprobación. Tampoco se pide reabrir decisiones técnicas aceptadas. Si la implementación necesita concretar styling DEFERRED, llevar sólo esa decisión acotada al gate correspondiente.

## 10. Handoff final

```yaml
status: needs_changes
summary: "Auditoría del snapshot main/stage y siete decisiones aprobadas; consolidación documental, validaciones y gates de la extensión pendientes."
UI_REQUIRED: YES
UI_REQUIRED_REASON: "Afecta headers, formularios, navegación visual, estados y responsive."
READY_FOR_FRONTEND_PLANNING: PARTIAL
READY_FOR_IMPLEMENTATION: NO
evidence:
  - "Snapshot 2219dcc; PR232 abierto; fuentes E01..E11."
  - "Delegación ui_designer con inspección raster p2/p5; product_planner para deduplicación."
decisions:
  - "Sin cambios visuales, de contratos, baseline, backlog o issues."
  - "Reutilización; dos gaps propuestos sin IDs canónicos ni nuevas épicas."
  - "Siete decisiones aprobadas; Manrope y pesos vigentes, fallback técnico system-ui, sans-serif."
  - "Sin atribuciones ni asignaciones personales."
risks:
  - "Estados DONE no prueban integración runtime; root/API siguen health."
  - "Fuentes de marca y design system requieren reconciliación."
validation:
  - "Lectura directa, consultas GitHub, cobertura grafo y render PDF."
  - "No suites ni E2E de producto ejecutados; no certificación visual de aplicación."
open_questions:
  - "Validaciones de assets/mínimos, consolidación documental y planificación de disponibilidad."
```

PARTIAL corresponde a las validaciones y gates todavía pendientes de esta extensión visual; no revoca los handoffs UX aprobados de los módulos. Las siete decisiones tienen aprobación explícita. Su consolidación en los documentos canónicos y los gates aplicables deben completarse antes de declarar tickets frontend READY o implementar cambios visuales.
