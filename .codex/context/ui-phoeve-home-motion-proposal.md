# Phoeve — Propuesta visual y movimiento para Home

2026-10-13. Nueva preferencia del usuario vinculada al plan CR-006. **PROPOSED / UI_REQUIRED: YES / NOT_IMPLEMENTED.** No sustituye el handoff aceptado de EL-EP-018 ni sus contratos. Extensión visual localizada en Home, sin rediseño global del producto.

## Solicitud y evidencia

**CONFIRMED por el usuario:** una Home más llamativa, inspirada en https://ard.ardisenio.chatgpt.site/, con transiciones entre secciones, conservando colores y contenidos propios.

**Fuentes gráficas candidatas vigentes:** exclusivamente los cuatro PNG de `docs/branding/assets/phoeve/`, con nombres originales y metadata en [manifest del repositorio](../../docs/branding/phoeve-source-manifest.json). Sustituyen las referencias gráficas externas previas. El sitio AR Diseño sigue siendo referencia de comportamiento/composición, no fuente de imágenes para Phoeve. No modificar, vectorizar, recolorear o sustituir esos PNG sin aprobación posterior; no implementar todavía el rebranding.

**CONFIRMED por lectura de fuentes públicas, no por reproducción visual:** la referencia usa hero y paneles sticky, superposición de escenas, transformaciones ligadas al scroll, ilustraciones con desplazamiento/rotación y soporte de movimiento reducido. Su script también incluye partículas canvas e interacción de cartas. Se descargaron HTML/CSS/JS sólo como datos, sin ejecutarlos ni incorporar código/arte a EventLens. El navegador de inspección no estuvo disponible; no se certifica el aspecto, fluidez ni comportamiento real de la referencia.

**RECOMMENDED para Phoeve:** adoptar ritmo narrativo, profundidad y transiciones; implementar una solución propia con la infraestructura existente. La referencia no determina tipografías, copy, colores, assets, links, nuevos controles ni promesas del producto.

Base inspeccionada: `stage` en `cbf36c3`; Home actual separada en `public-home.component.ts`, `.html` y `.scss`. El índice de código no cubre estos archivos; se usó lectura directa. El plan anterior inspeccionó una composición inline: actualizar sus candidatos de ejecución a estos archivos reales antes de ticketizar.

## Identidad y continuidad

Mantener Manrope400/500/600/700 y tokens aceptados de `_tokens.scss`: primary azul `#17345c`, accent coral `#f37a5d`, background `#fafaf8`, surface `#ffffff` y roles de texto/foco existentes. Estos son valores UI existentes, **no la paleta final ratificada del arte Phoeve**. No copiar rojo/negro o fuentes condensadas de la referencia ni elegir nuevos HEX por aproximación.

Fondos claros predominantes, coral decorativo y azul para acciones. Puede proponerse un panel puntual azul con texto contrastado como composición local, sin añadir modo oscuro o recolorear el resto de la aplicación. Si su contraste o uso no cumple el handoff, conservar panel claro. No editar globalmente `_tokens.scss` para conseguir el efecto.

Conservar orden, IDs de anclas, un h1 y jerarquía h2/h3: hero → beneficios → cuatro pasos → privacidad → cuatro FAQ → cierre → footer. Conservar CTA «Solicitar acceso a la Beta», contenido propio, navegación y estados de sesión. El cambio de denominación EventLens→Phoeve sigue los gates del rebranding, independientemente del movimiento. No introducir métricas, claims, campos, carruseles o llamadas comerciales nuevas. La nueva presentación no valida afirmaciones editoriales ya pendientes de revisión.

## Dirección por sección

| Sección | Tratamiento propuesto | Movimiento y límites |
|---|---|---|
|Hero|Título existente protagonista, espacio editorial y composición propia de recuerdos; CTA disponible inmediatamente|Entrada breve de capas decorativas y parallax leve de la ilustración. Texto/CTA sin desvanecerse ni quedar cubiertos durante el scroll. Sin imponer varias pantallas de scroll antes de leer beneficios. |
|Beneficios|Tres tarjetas con jerarquía clara, fondos derivados de roles existentes y separador de sección|Entrada escalonada discreta, una vez por visita. Hover/foco proporcional; contenido accesible aunque el observer no exista. |
|Cómo funciona|En desktop, ilustración lateral sticky que acompaña los cuatro pasos, leídos en su orden natural|El paso visible puede modificar sólo la decoración/ilustración. No crear un Stepper funcional, cambiar texto, ocultar pasos o exigir cuatro clicks. Mobile usa cuatro bloques verticales sin fijar pantalla. |
|Privacidad|Cambio de ritmo con panel destacado y contenido propio claramente legible|Entrada suave del panel/decoración; todo el texto permanece en flujo. Sin animar símbolos que aparenten certificar seguridad o permisos. |
|FAQ|Sección visualmente tranquila, cuatro respuestas conservadas visibles|Separador/transición leve. Sin acordeón, flip de cartas o comportamiento nuevo de preguntas. |
|Cierre|Composición cálida propia, CTA y microcopy visibles; profundidad decorativa|Entrada breve y reacción de hover/foco. Sin fondo o animación que reduzca contraste, distracción continua ni interferencia con footer. |

Los separadores pueden ser cambios de superficie, bordes/curvas geométricas propias y capas de tarjetas. No usar el logo como patrón deformado ni generar nuevos SVG del lettering. Los mockups son demostrativos y decorativos, nunca formularios/QR reales o accesos alternativos. Fotografías/ilustraciones nuevas requieren procedencia y autorización; no copiar assets del sitio ni imágenes privadas. Se puede preparar la composición con geometría propia mientras se aprueba el material.

## Especificación de movimiento propuesta

Valores iniciales **RECOMMENDED**, sujetos a prueba/UI: entrada250–450ms, desplazamiento máximo16–24CSSpx, escalonado60–90ms entre tarjetas; parallax decorativo acotado sin alterar dimensiones del layout. Una sola entrada; nada de ciclos que se disparen continuamente al cruzar el borde de viewport. No imponer animación a todo elemento ni mantener texto importante con opacity0.

Implementación candidata: CSS `transform`/`opacity` y `IntersectionObserver` existente del navegador; `requestAnimationFrame` sólo si se necesita progreso decorativo de scroll. No añadir GSAP, Framer Motion, smooth-scroll engine, fuentes externas o dependencias. Crear una utilidad/directiva compartida sólo si el análisis demuestra reutilización independiente; si sólo sirve a Home, mantener ownership local.

Escuchar scroll de forma pasiva cuando sea necesario, agrupar lecturas/escrituras por frame, pausar trabajo fuera de viewport y destruir observers/listeners al salir de la ruta. No animar top/height/margins para evitar relayout. Evitar blur/canvas/partículas permanentes en esta primera versión; no trasladar todos los efectos de la referencia por el hecho de existir.

Sin scroll hijacking, scroll snap obligatorio, autoplay audiovisual ni bloqueo del gesto táctil. Sticky sólo en desktop/tablet donde cabe el contenido; deshabilitar cuando viewport/zoom no permita leerlo entero. El header no puede tapar encabezados o foco. Resolver `onScrollTo` actual, que pide smooth siempre, para respetar movimiento reducido sin modificar destinos.

### Accesibilidad y fallback

- `prefers-reduced-motion: reduce`: quitar reveal/parallax/superposición animada y scroll smooth; orden y contenido completos, sin espacios altos reservados para una escena inexistente. Contemplar cambio de preferencia durante la sesión.
- Mobile/coarse-pointer y zoom/reflow: lectura vertical; no depender de hover. No cambiar orden DOM para producir la composición.
- Sin soporte de observer o error del efecto: contenido visible y usable; la decoración estática conserva el layout. La animación es una mejora progresiva.
- Elementos decorativos no reciben foco; usar `aria-hidden` sólo en decoración, nunca en contenidos/CTAs. No anunciar cada entrada o cambio de paso.
- Mantener foco de navegación/anclas, menú/Escape, contraste y tamaños de targets aceptados. El foco de teclado no espera una animación ni queda en un elemento transparente.

## Impacto y puertas de ejecución

Esta solicitud amplía el plan previo de rebranding con presentación/movimiento de **Home únicamente**. No equivale a autorizar rediseño de organizer/admin/guest ni a reabrir tickets DONE. Puede describirse y revisarse la dirección UX mientras la ratificación de logos está pendiente.

**READY_FOR_FRONTEND_PLANNING: PARTIAL para esta propuesta:** dirección y pruebas propuestas; falta ratificación/handoff UI YES y selección de ilustraciones si se requieren. No generar tickets frontend o plan detallado ejecutable hasta ese YES. La ratificación de los cuatro PNG de Phoeve permanece pendiente y se separa de la aprobación del movimiento de Home; no se exige vectorizar ni sustituir esas fuentes. Mantener ambas salidas y gates explícitos, y la ausencia de autorización para implementar todavía el rebranding.

Antes de ejecutar: requirements_reviewer del alcance ampliado → architect verifica baseline sin nuevas dependencias → ui_designer ratifica responsive/motion/fallback → incorporación autorizada del handoff → ticketización afectada y gate2. El plan técnico posterior debe partir de HTML/SCSS actuales y conservar los contratos de sesión/navegación. No duplicar Home ni crear páginas de producto de demostración.

Archivos candidatos: `public-home.component.html/.scss/.ts` y sus pruebas; header sólo para compensación de foco/anclas si se demuestra necesario; configuración/harness E2E de Home. Estilos globales, API y dominio permanecen fuera del alcance. El movimiento no requiere PostgreSQL, cambios de cuentas o envíos.

## Criterios verificables de aceptación

| ID | Criterio | Evidencia requerida |
|---|---|---|
|M1|Colores UI y Manrope conservados, contenido/CTA/orden/anclas íntegros|Diff editorial/tokens, DOM y estilos efectivos comparados con baseline. |
|M2|Transiciones distinguen secciones y no tapan ni retrasan lectura/CTA|Capturas antes/durante/después y revisión visual sobre commit concreto. |
|M3|320/375/768/1024/1440CSSpx y zoom200%/400% equivalentes sin overflow/cortes|Capturas y navegación real; sticky deshabilitado si impide lectura. |
|M4|Reduced-motion desde inicio y al cambiar preferencia: sin parallax/reveal/smooth, contenido completo|Playwright con `reducedMotion: 'reduce'`, mediciones/estilos y prueba de `onScrollTo`. |
|M5|Teclado, saltar contenido, anclas, menús y CTA conservan foco y autorización|Tests de interacción de componentes y navegador. No nuevas rutas o permisos. |
|M6|Sin observer/error de efecto y tras navegar fuera/volver: Home usable, sin listeners duplicados|Tests de lifecycle/fallback y repetición de navegación, contenido nunca oculto. |
|M7|No degradación de budgets existentes, sin trabajo decorativo fuera de viewport|Build, comparación de perfil/bundle y tracing con entorno registrado; no inventar puntuación de rendimiento ni SLA. |
|M8|Raíz y base prefijada siguen sirviendo assets y anclas según el plan|Tests del build real en ambas bases; no validar sólo paths sintéticos. |

No se ejecutaron builds, pruebas de animación o capturas de nuestra futura Home. La lectura de código de la referencia demuestra mecanismos, no equivalencia visual ni PASS de ejecución. La ratificación gráfica de Phoeve y los gates de publicación/legal siguen el plan principal.
