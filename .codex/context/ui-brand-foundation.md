# Handoff UI de assets y foundation de marca

2026-10-12 · CR-004 · **READY_FOR_FRONTEND_PLANNING: YES** para EL-TK-203/204. Dictamen read-only `ui_designer` / `brand_ui_gate` incorporado y medidas cosméticas adoptadas por el orquestador bajo el alcance aprobado. Sin nueva pantalla/componente, permiso, variante de dominio ni implementación. [Contrato técnico](brand-integration-contract.md), [manual](../../docs/branding/MANUAL-DE-MARCA.md), [gates](../product/sessions/2026-10-12-brand-planning-gates.md).

## Flujos y responsabilidad

Actor organizador; objetivo identificar plataforma, rol y contexto sin alterar salida. Entrada/precondiciones son las del OrganizerAppShell existente; harness sólo fixtures, no autentica. Sin evento: marca/Organizador, proyección y footer actual. Con evento: región Contexto del evento activo, etiqueta Evento activo:, nombre completo, badge hijo intacto y Mis eventos. Conservar nombre accesible Salir de la configuración del evento, onExitContext y emisión única exitContext; sin mutación ni nueva navegación. null/undefined omiten contexto.

Cargas/errores/vacíos/permisos siguen en contenido funcional proyectado; no añadir skeleton/toast/error API/anuncio de éxito. No campos ni formularios nuevos. Jerarquía DOM: identidad/rol → contexto opcional → proyección → footer. Labels/copy existentes conservados.

## Especificación del piloto adoptada (EL-TK-204)

Manrope y pesos definidos en ui-design-system; system-ui, sans-serif sólo fallback. Aplicación directa a hojas propias, no a agrupaciones heredables que alcancen badge o proyección.

| Hoja propia | Peso / tamaño / line-height | Roles vigentes |
|---|---|---|
| Marca textual de respaldo, h1 existente | Heading600;1.25rem/1.75rem | text-primary |
| Organizador | Label500;0.75rem/1rem | primary sobre accent-soft |
| Evento activo: | Label500;0.875rem/1.25rem | text-secondary |
| Nombre evento | Heading600;1rem/1.5rem | text-primary; líneas/palabras largas completas |
| Mis eventos | Button600;0.875rem/1.25rem;44×44CSSpx mínimo objetivo | primary sobre surface; contorno primary |
| Footer actual | Body400;0.875rem/1.25rem | text-secondary |

Header/footer/región contextual propios: surface, separadores decorativos border, sin nueva sombra. Hover/active botón: primary-hover texto/borde, accent-soft fondo. Foco: contorno2CSSpx primary, offset2CSSpx, sin recorte/ocultamiento. Border tenue no es único identificador del control.

Espaciado mínimo de uso:0.25/0.5/1/1.5/2rem; máximo contenedor1200CSSpx existente. Padding horizontal1rem móvil y1.5rem desde768. Header mínimo64CSSpx, altura flexible/paddingvertical1rem si varias filas. Identidad-contexto gap1rem, relacionados0.5rem; main separaciónvertical2rem y footerpaddingvertical1.5rem existentes conservados. Radio botón0.375rem, contexto0.5rem, etiqueta pill. Sin animaciones nuevas.

Sólo publicar variables necesarias `--el-ui-*`; aliases a roles vigentes, sin HEX nuevo ni poblado de abstracciones sin uso. Esta escala sirve al piloto, no redefine toda la aplicación.

## Logo y fallbacks

203 prueba/publica fuente p2 wordmark y p5 favicon, registra legibilidad16/32/48 claro/oscuro y límites/área libre medidos. Si falla, no certificar DONE ni redibujar; documentar y ajustar margen/escala/formato conservando geometría, o escalar decisión de redibujo fuera de alcance.

204 usa p2 dentro del h1 existente, identificación no interactiva, sin link/heading extra. Nombre accesible EventLens una vez: alt EventLens si imagen única; alt vacío si texto equivalente accesible. Mientras carga o falla, texto visible EventLens y espacio estable, sin icono roto/spinner/toast/retry.

Objetivo de ensayo wordmark160CSSpx y altoauto/proporción original, **no mínimo oficial**. Resultado203 gobierna admisibilidad/área libre. Si exige ancho mayor, reflow; nunca recortar/comprimir por debajo del límite. 140CSSpx/30mm del PR siguen provisionales hasta medir. Pesos400/500/600/700 reales, font-display swap y fallback forzando fallo fuente. Fuente no cambia trazados del logo.

## Responsive y aislamiento

320CSSpx: identidad/rol primero, contexto siguiente fila, nombre completo multiline con min-width0 y ruptura de cadena sin espacios; botón ancho disponible al necesitar nuevafila. Sin scrollhorizontal/elipsis como único acceso al nombre. Desde768 misma fila sólo si cabe, wrapping completo; desde1024 agrupación horizontal/max1200, alto flexible. Orden lector coherente, sin sidebar/menú nuevos. Sticky sólo cuando cabe en una fila; móvil/layout apilado estático para no ocupar viewport ni ocultar foco al zoom.

Preservar herencia system-ui y #0f172a ya existente en raízcompartida; no aplicar nueva familia/color a host/raíz/main/ng-content. Se adopta restricción adicional de conservar también sus fondos compartidos: surface sólo en nodos propios, no cambiar backdrop de proyección. Aplicar estilos nuevos directamente a brand-title/brand-badge/context-label/context-event-name/botón/footer-text. Badge hijo intacto. Comparar estilos efectivos antes/después de proyección y badge; no basta ausencia ::ng-deep.

## Reutilización y validación

OrganizerAppShell PRODUCT_COMPONENT existente; Button/Image patrones genéricos, sin obligar wrappers/librería; EventStatusBadge hijo transversal intacto. Extensión READY_FOR_IMPLEMENTATION en diseño tras Gate2 APPROVED; ejecución204 espera203 validado. No código VALIDATED/DONE.

203: hash/procedencia/fidelidad/trazados/proporción/mínimos, fav16/32/48clarooscuro, assets sin404/basehref. 204: Manrope real/licencia/hash/pesos/fallback; sin/conevento/null/undefined; nombres cortos/multilínea/cadena larga; logo carga/fallo identificado una vez; Enter/Space/foco/44px/exitContext;320/375/768/1024/1440CSSpx,zoom200%,reflow equivalente320CSSpx a400%;contrast4.5:1normal/3:1grande/no textual pertinente, headings/lector; proyección/badge intactos y harness fuera buildproductivo.

Harness monta componente Angular real y foundation real, no HTML imitativo. Fixtures no prueban permisos/auth/API/navegación productiva ni dispositivos no usados. Sin nueva UX legal ni copyjurídico. Sin preguntas de producto bloqueantes: mediciones/pruebas son entregables de implementación, no decisiones tipográficas pendientes.
