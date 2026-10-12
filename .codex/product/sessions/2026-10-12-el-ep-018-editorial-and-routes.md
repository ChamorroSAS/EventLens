# EL-EP-018 — Consolidación editorial del Home y auditoría acotada de rutas

Fecha: 2026-10-12. Rama de propuesta: `docs/el-ep-018-home-navigation`; base prevista `stage`; [épica DRAFT](../epics/EL-EP-018.md). No se modifica código, DEC/TC/ARCH, ni se crean tickets. Este registro distingue **decisiones de producto confirmadas en la conversación** de **redacción editorial propuesta** y **verificación técnica pendiente**; no supone aprobaciones personales o de reviewers.

## A. Doce decisiones editoriales confirmadas

| # | Aspecto | Elección del producto | Precisión |
|---|---|---|---|
| 1 | Enfoque del mensaje principal | Experiencia emocional del evento | La tecnología acompaña la historia |
| 2 | Beneficios principales | Combinar los tres | Participación colectiva, facilidad y recuerdos reunidos |
| 3 | Público del Home | Principalmente el organizador | Invitados ingresan por enlace/QR, no por directorio |
| 4 | Tono | Equilibrado: emotivo, cercano y claro | Sin publicidad exagerada ni tecnicismos innecesarios |
| 5 | CTA principal | «Solicitar acceso a la Beta» | Reutiliza EL-TK-008; no habilita registro abierto |
| 6 | «Cómo funciona» | Combinar pasos prácticos e historia emocional | Cuatro pasos; fotografías de celebración como dirección UI, no asset aprobado |
| 7 | FAQ | Cuatro preguntas esenciales | Qué es, cómo funciona QR, necesidad de cuenta, solicitar Beta |
| 8 | Privacidad | Combinar privacidad y control | No prometer seguridad absoluta ni visibilidad sin autorización |
| 9 | Presentación de Beta | Discreta | Aclaración corta de acceso por invitación; no bloque informativo protagónico |
| 10 | Cierre | Combinar emoción e invitación a participar | Repetir CTA principal sin prometer aprobación |
| 11 | Menú principal | Equilibrado | Cómo funciona, Beneficios, Privacidad, Preguntas frecuentes |
| 12 | Footer | Minimalista | Wordmark, frase breve, copyright, documentos legales **solo aprobados/disponibles** |

**Confirmación adicional distinta de las 12:** la URL `/` es pública y permanece visitable con y sin sesión; el organizador autenticado recibe enlaces `Mis eventos`/`Mi cuenta` sin redirección automática. Cerrar sesión sólo opera sobre su sesión correspondiente.

Las preferencias anteriores son decisiones editoriales; **los textos literales redactados a continuación son propuesta para validación final de UX/copy**, salvo las cadenas de CTA y los nombres seleccionados expresamente. Este documento no aprueba nuevos términos legales, capacidades, URLs definitivas ni assets fotográficos.

## B. Copy propuesto para el Home

### Header público

Wordmark EventLens (página 2 del PDF de marca). Navegación por anclas en la misma página: «Cómo funciona», «Beneficios», «Privacidad», «Preguntas frecuentes». En acciones diferenciadas: «Iniciar sesión» y CTA azul «Solicitar acceso a la Beta».

Header organizador: conservar Home y navegación editorial si cabe, accesos prominentes «Mis eventos», «Mi cuenta» y «Cerrar sesión» según identidad/permiso vigentes; no auto-redirect. Menú móvil accesible/compacto con las mismas acciones. La disposición exacta queda a `ui_designer`.

### Hero

**H1:** Tu evento termina. Sus recuerdos continúan.

**Subtítulo propuesto:** Cada invitado vive momentos diferentes. Con EventLens, puedes reunir sus fotos y videos en un espacio dedicado a los recuerdos de tu celebración, de manera sencilla y sin que tus invitados tengan que crear una cuenta.

**CTA principal:** Solicitar acceso a la Beta.

**Microcopy discreto:** Acceso disponible mediante invitación.

El CTA público dirige al flujo de solicitud de Beta (EL-TK-008), cuya respuesta neutra no activa una cuenta ni confirma su existencia.

### Beneficios — Cada mirada cuenta

**Intro propuesta:** Los recuerdos más especiales no siempre están en una sola cámara. Invita a tus familiares y amigos a compartir lo que vivieron, reúne esas perspectivas y vuelve a disfrutar de cada momento.

1. **Entre todos:** Cada invitado aporta su perspectiva.
2. **Sin complicaciones:** Participación desde el navegador mediante un enlace o QR.
3. **En un lugar:** Fotos y videos reunidos por evento.

### Cómo funciona — cuatro pasos

1. **Prepara tu evento.** Crea un espacio para tu celebración y configura cómo participarán tus invitados.
2. **Comparte la invitación.** Envía un enlace o código QR a quienes estarán contigo.
3. **Cada mirada cuenta.** Los invitados comparten sus fotografías y videos desde el celular, sin registrarse.
4. **Revive los recuerdos.** Consulta los contenidos disponibles y recupera tus recuerdos según las opciones habilitadas para el evento.

**Precisión:** galería opcional y medios disponibles dependen de estado, permisos, moderación/procesamiento; no ofrecer descarga guest de originales.

### Privacidad — Tus recuerdos, tu espacio, tus decisiones

**Texto propuesto:** Gestiona el acceso de tus invitados, decide si pueden compartir fotografías y videos y controla cuándo está disponible la galería. Los recuerdos se mantienen dentro del espacio privado de tu evento.

**Precisión:** no afirmar que el QR identifica a la persona, que todo receptor está individualmente autenticado ni protección absoluta frente a capturas/reenvíos. Backend conserva control efectivo; claims sujetos a revisión legal.

### FAQ — cuatro esenciales

**¿Qué es EventLens?**

Es una plataforma para reunir las fotografías y videos que comparten los invitados de un evento.

**¿Cómo funciona el código QR?**

El organizador comparte un QR o enlace que permite acceder al espacio del evento. Algunos eventos pueden solicitar un PIN.

**¿Mis invitados necesitan crear una cuenta?**

No. Pueden participar sin registrarse, siguiendo las condiciones de acceso y participación del evento.

**¿Cómo puedo solicitar acceso a la Beta?**

Utiliza el botón «Solicitar acceso a la Beta». Tu solicitud será revisada; enviarla no garantiza una invitación inmediata.

### Cierre

**Titular:** Cada celebración tiene una historia.

**Texto propuesto:** Haz que todos formen parte de ella y conserva los recuerdos desde diferentes miradas.

**CTA:** Solicitar acceso a la Beta.

**Microcopy:** Acceso mediante invitación.

### Footer minimalista

Wordmark, **«Los recuerdos de cada celebración, reunidos en un solo lugar»** (texto propuesto), copyright dinámico/fecha aplicable y enlaces a políticas/condiciones **únicamente cuando tengan documento oficial válido y destino real**. No redes sociales, directorio grande, dirección falsa ni contacto no acordado.

## C. Auditoría técnica acotada de rutas en el snapshot de `stage`

Fuentes inspeccionadas directamente el 2026-10-12:
- `apps/web/src/main.ts` ejecuta `bootstrapApplication(AppComponent)` sin `provideRouter`/registro de rutas.
- `apps/web/src/app/app.component.ts` contiene la pantalla técnica «Entorno de desarrollo de la plataforma / Conexión con la API»; no contiene `router-outlet` ni una configuración de navegación de features.
- `apps/web/src/app/organizer/organizer-dashboard.component.ts` implementa selección interna de eventos/secciones; no proporciona una ruta productiva de navegador ni la composición desde raíz. `onCreateDraft` está delegado y no debe marcarse funcional por su UI.
- `apps/web/angular.json` registra assets públicos y `src/styles/ui-foundation.css`, pero no configura rutas SPA por sí solo.
- `EL-TK-008` acredita la capacidad de solicitud Beta del dominio y respuesta neutra; no acredita su formulario Angular navegable.
- `EL-TK-013` acredita el servicio de login con control de sesión; no acredita una ruta Angular de login.
- `EL-TK-074/075/084` acreditan contratos guest QR/PIN y credencial pública, **no suministran una ruta URL definitiva de Angular**.
- `EL-TK-201` define UI de cuenta/eliminación y estado restringido, no URL de `Mi cuenta`.
- El catálogo `ui-components.md` referencia `LoginForm`, `LegalFooter`, `OrganizerAppShell`, pero especificación documental no prueba composición productiva.

**Conclusión CONFIRMED del snapshot:** no se verificó un contrato de rutas frontend ya implementado en bootstrap ni URLs definitivas de login, cuenta, Beta, Mis eventos o ingreso QR. La propuesta no debe describir los paths candidatos como rutas existentes. No se ejecutó la app ni E2E.

### Matriz de destinos, propiedad y decisión recomendada

| Intención | Ruta candidata (por aprobar) | Permiso/contrato | Pendiente antes de implementar |
|---|---|---|---|
| Inicio | `/` | Pública con/sin sesión, confirmado; sin redirect automático | Declarar ruta en Angular Router y sostener Home ante falla API |
| Ancla Cómo funciona | `/#como-funciona` | Pública | Implementar scroll/foco/teclado accesible, no pantalla nueva |
| Ancla Beneficios | `/#beneficios` | Pública | Id estable y sección propuesta |
| Ancla Privacidad | `/#privacidad` | Pública | Copy/aviso legal revisado según gate |
| Ancla Preguntas frecuentes | `/#preguntas-frecuentes` | Pública | Marcado semántico accesible |
| Iniciar sesión | `/ingresar` | MOD-001; sesión organizador verificada | Elegir path oficial, componer LoginForm y adaptador; redirect solo interno |
| Solicitar acceso Beta | `/solicitar-acceso` | EL-TK-008, anónimo, sin enumeración | Elegir path oficial, formulario/adapter; éxito neutro y rate limit |
| Mis eventos | `/mis-eventos` | MOD-002 y guard de identidad/autoridad | Montar OrganizerDashboard existente, no segundo dashboard |
| Mi cuenta | `/mi-cuenta` | MOD-001; sesiones/seguridad; estado restringido según MOD-008 | Acordar propietario de composición de cuenta, secciones y contratos; no recrear UI de eliminación |
| Evento por QR | **Path actual del contrato de enlace revocable, pendiente de identificar** | EL-EP-004; QR/PIN/guest; acceso event-scoped | Identificar formato real emitido y preservar credenciales/revocación; no inventar slug ni `/evento/:id` |
| Admin | **Sin enlace público propuesto** | EL-EP-012/EL-TK-044 | Conservar mecanismo admin independiente y protegido |
| Not found | `**` (conceptual) | Sin enumeración ni divulgación de evento/cuenta | Vista 404 segura; no interceptar rutas API/media |

### Reglas de navegación por validar con architect/ui_designer
1. Registrar rutas/guards lazy donde corresponda respetando Angular vigente y EL-TD-004; no añadir módulo nuevo de dominio ni librería UI sin justificación.
2. Anon/expired en destino protegido → login y `returnUrl` interno validado; tras login ir al destino original si autorizado. **No** redirigir automáticamente desde `/`.
3. Cuenta pendiente de eliminación → sólo superficie restringida de consulta/cancelación definida por EL-EP-015; no renderizar menú de control normal.
4. Cuenta autorizada que visita `/` permanece en `/`; mostrar links propios, no eventos/correos privados en Home.
5. Guest deep link sigue guest, nunca obliga a pasar por Home/login owner; preservar ruta credencial emitida y políticas de PIN, revocación y lifecycle.
6. `logout` limpia sesión/contexto sensible y evita volver a renderizar información previa con back/forward; comportamiento post-logout (Home o login) **queda por decidir**.
7. Nginx/hosting entrega `index.html` para deep links de Angular autorizados; las URLs `/api` y media mantienen enrutamiento aparte. Confirmar `base href`, 404, refresco, query, rutas con fragmentos y CSP.
8. Navegación anónima pública no depende de health API para mostrar copy; interacción con servicios informa errores neutros y reintentos.
9. Nunca guardar token QR/PIN en logs/analytics/returnUrl abierta, ni indexar espacios privados.

## D. Gates y siguiente paso

- **CERRADO producto:** comportamiento Home; 12 decisiones editoriales, incluida cabecera equilibrada y footer minimalista.
- **PENDIENTE editorial/UX:** aprobación final literal de copy, assets de fotografías, presentación responsive y contraste.
- **PENDIENTE arquitectura:** contratos de paths definitivos, montaje de root, lifecycle sesión/guard, ubicación de Mi cuenta y formato QR real.
- **PENDIENTE release:** política de indexación/marketing y revisión legal EL-EP-017/Q-029 antes de apertura pública.
- **PENDIENTE formal:** `requirements_reviewer`, `ui_designer`, `architect`, ticketización y validación funcional. Por tanto `EL-EP-018` permanece **DRAFT** con `REQUIREMENTS_READY: PARTIAL`, `READY_FOR_TICKET_WRITING: NO`, `READY_FOR_FRONTEND_PLANNING: NO`, `READY_FOR_IMPLEMENTATION: NO`.

No se crean IDs EL-TK ni se alteran status DONE de propietarios existentes. Ninguna suite/E2E se ejecutó al elaborar este registro documental.
