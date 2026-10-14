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

## Assets derivados de marca (EL-TK-243 / CR-009) — PROPUESTA

> Estado: **PROPUESTA**, vigente sólo tras `CHANGE_READY` de [CR-009](../product/changes/CR-009.md). Incorporada desde el gate técnico (rondas 1-5) para cerrar la extensión de contrato requerida; no modifica decisiones aceptadas ni la baseline EL-TD-*.

El arte canónico y las cuatro copias publicadas en `apps/web/public/assets/branding/phoeve/` siguen siendo **bit a bit** (`source.equals(published)` intacto). Para eliminar el warning dev-only NG0913 y reducir el peso se autoriza, de forma acotada, servir **derivados PNG** del mismo arte, declarados en `docs/branding/phoeve-source-manifest.json` (`schemaVersion: 2`).

Invariantes:

- **I1** Los 4 originales publicados permanecen byte-idénticos a `docs/branding/assets/phoeve/*`; no se relaja `source.equals(published)`.
- **I2** Prohibido sobrescribir un nombre de rol publicado con contenido derivado; todo derivado usa nombre nuevo que incluye el ancho objetivo.
- **I3** Cada derivado declara `derivedFrom` + `sourceSha256` + `sha256` + `bytes` + `width`/`height` + parámetros de transformación, atados a `assets[]`.
- **I4** Transformación permitida: sólo `raster-resize` del mismo arte (incluye re-codificación PNG); sin recolor, recorte, redibujo, vectorización ni cambio de proporción/transparencia. La fidelidad fina es evidencia declarativa + revisión visual.
- **I5** Cap: `minWidthPx[rol] ≤ width ≤ 512` y `height ≤ 512`; `height === width / 3`; sin upscale. Ningún `<img>` de marca puede referenciar un archivo por encima del cap.
- **I6** Ningún `<img>` de marca usa rutas absolutas: además de la igualdad normalizada con `assets/branding/phoeve/${derivative.file}`, el `src` **crudo** de la plantilla no empieza por `/` ni contiene `./` (aserción negativa en los cinco nodos).
- **I7** Se conservan `alt="Phoeve"`, `width`/`height` explícitos, `aspect-ratio: 2172/724` y el fallback `onLogoError`/texto de marca.
- **I8** No se alteran bytes ni rutas de favicon, grayscale, fondos de login ni avatar; no se generan derivados de roles no usados como `<img>`.
- **I9** No se cambia `loading` ni se añade `lazy` en imágenes de marca (verificado por grep de ausencia, propiedad de `verify-branding-assets.mjs`).

Autorización machine-checkable en el manifiesto: `derivativeGeneration` (`authorizedBy`, `authorizedOn`, `allowedTransforms`, `minWidthPx`, `maxWidthPx`, `maxHeightPx`, `upscale`) **más** un opt-in en el propio CR: el verificador sólo autoriza si el archivo **del CR referenciado por `authorizedBy`** —y sólo ése— contiene el token en **forma endurecida** (una línea cuyo contenido sea exactamente `AUTHORIZED_DERIVATIVES: <authorizedBy>`, sin backticks, comillas, viñetas ni texto adicional) **y** el archivo declara `CHANGE_READY`; una mención en prosa o en bloque de código no satisface el control y la sola palabra `AUTHORIZED_DERIVATIVES` tampoco. El token no existe mientras el CR esté `DRAFT` y lo emite el `documenter` (o el owner) al pasar el CR a `CHANGE_READY`, en el mismo cambio que retira `DRAFT` y reescribe las entradas de CONVENTIONS/BACKLOG. El verificador falla con `UNAUTHORIZED_DERIVATIVES` si hay derivados sin autorización válida. `derivatives[].role` ∈ {`primary`, `dark`}. `verify-branding-assets.mjs` posee la auditoría de los cinco nodos (binding rol↔superficie, no-vacuidad, aserción negativa I6 e I9); `verify-ui-foundation.mjs` valida el wordmark del shell contra el derivado (leyendo el `.html` en vez del `.ts`, que se conserva para `styleUrl`/SCSS) en lugar del literal `logo-primary.png`, conservando `alt` y `brand-fallback-text`.
