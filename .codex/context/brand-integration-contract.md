# Contrato local de integración de marca

2026-10-12 · CR-004 · Gate técnico APPROVED. Contrato acotado incorporado por el orquestador desde el dictamen read-only de `brand_architecture_gate`; autorizado por la solicitud de consolidación/ticketización. No cambia baseline ni selecciona estrategia CSS global o librerías DEFERRED.

## Arte y publicación (EL-TK-203)

Maestro/derivados documentales en `docs/branding/assets/`. Publicar sólo derivados corporativos aprobados en `apps/web/public/assets/branding/`, servidos como `assets/branding/...`; configurar assets Angular y enlace favicon relativo al `base href` desde index.html. No publicar todo docs ni incluir PDF maestro por defecto, birthday global o media privada. Registrar página fuente, hash y copia/generación; runtime no es otra fuente editable de marca. No redibujo/PWA/header nuevo.

## Fuentes y foundation (EL-TK-204)

Manrope autoalojada en `apps/web/public/assets/fonts/manrope/`; WOFF2 estáticos con pesos reales400/500/600/700 o variable que los cubra. Registrar procedencia, versión/commit disponible, hashes y licencia de redistribución; incluir licencia. Si no se acredita licencia o pesos, no incorporar ese archivo ni certificar DONE; obtener distribución válida de la misma Manrope, sin elegir otra tipografía. `font-display: swap`; familia `Manrope, system-ui, sans-serif`. Sin petición obligatoria a proveedor remoto.

Foundation SCSS en `apps/web/src/styles`: partials `_tokens`, `_breakpoints`, `_mixins`, `_fonts`, `_reset`, `_typography` y `styles.scss` como único entrypoint global registrado en styles Angular, que emite los custom properties `--el-*` en `:root` y las capas globales `fonts`/`reset`/`typography`. Los componentes consumen tokens sólo por `var(--el-*)` (herencia a través de la encapsulación Emulated); `@angular/build` compila SCSS con `inlineStyleLanguage: scss` y `stylePreprocessorOptions.includePaths: ["src/styles"]`. Los colores semánticos no se usan como texto (fallan AA). Esta foundation sustituye el archivo único inerte `ui-foundation.css` y las variables `--el-ui-*` del piloto CR-004, retirados por [EL-TD-009](technical-baseline.md#el-td-009--frontend-styling-strategy)/DEC-111.

## Piloto encapsulado

Exclusivamente nodos propios de OrganizerAppShellComponent existente: header/footer/contexto/controles. Conservar encapsulación, inputs/outputs selectedEvent/exitContext, onExitContext, proyección y semántica. Sin `::ng-deep`, cambio de encapsulación ni modificación de hijos. Preservar herencia system-ui/#0f172a y fondos compartidos ya existentes; no aplicar nueva familia/color/fondo a host, raíz, main o contenedor ng-content que migren contenido proyectado. Estilos nuevos en hojas propias, sin herencia que alcance al badge hijo. Surface sólo en header/footer/contexto propios. Comparar estilos efectivos antes/después de proyección/badge. No convertir dashboard, admin, guest o badges por cascada. [Handoff UI adoptado](ui-brand-foundation.md).

## Validación y evidencia

Vitest monta el componente real y prueba entradas/salidas/contexto/proyección. Playwright usa harness exclusivo de tests montando el mismo componente y foundation productiva, fixtures marcadas como pruebas; fuera del entrypoint/bundle productivo. Entrada/configuración de compilación separada sólo test permitida dentro infraestructura aceptada; no ruta/root/adapter ficticio de producto ni HTML que imite shell.

Verificar: paths y base href; disponibilidad real assets/favicon/fuentes; procedencia/hashes/licencia; fidelidad PDF; tamaños reales y límites del arte; carga efectiva de Manrope/pesos y fallback forzando fallo; contraste/foco/teclado/reflow/nombres largos; con/sin evento, exitContext y proyección; ausencia de recolor en externos/proyectados y de harness en build producción; build/typecheck/pruebas pertinentes. No certificar auth/routing/API/Beta ni dispositivos no usados.

Baseline aplicable ACCEPTED: EL-TD-001/005/006/007/009; EL-TD-004 preservado. Sin persistencia, API, transacciones, recovery ni permisos nuevos. Reversión de referencias/CSS no requiere migración de datos. La estrategia de estilos es ahora general (Sass/SCSS + CSS custom properties `--el-*`), resuelta en [EL-TD-009](technical-baseline.md#el-td-009--frontend-styling-strategy)/DEC-111; el piloto CR-004 queda superseded.

Readiness técnico propio suficiente; gate UI YES y revisión final203/204 APPROVED registrados.203 listo para comenzar;204 espera salidas203 validadas. Sin implementación acreditada. [Registro de gates](../product/sessions/2026-10-12-brand-planning-gates.md).
