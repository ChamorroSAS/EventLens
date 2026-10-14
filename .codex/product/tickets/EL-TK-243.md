# EL-TK-243 — Optimizar la carga de los assets de marca Phoeve y eliminar el warning NG0913

Hallazgo de rendimiento detectado durante la verificación de EL-TK-242, registrado en
[evidencia de sesión](../sessions/2026-10-14-el-tk-243-brand-asset-load-finding.md). Trabajo
correctivo fuera de CR-004/CR-008; requiere CR propio o excepción aprobada a la restricción de
bytes de CR-006 antes de READY. READY (revisión 4-final; correcciones de las rondas 1-5 aplicadas;
ambos gates APPROVED y cierre documental autorizado por el owner el 2026-10-14;
[dictámenes](../sessions/2026-10-14-el-tk-243-brand-asset-load-gates.md)).

**Enfoque fijado (CONFIRMED por el usuario, 2026-10-14): B — derivados optimizados, autorizados de
forma acotada por [CR-009](../changes/CR-009.md) (CHANGE_READY), servidos por `src`
directo. `NgOptimizedImage` NO se adopta.**

## Parent epic

EL-EP-002 (extensión transversal de marca; el DONE histórico del alcance original y el cierre de
la extensión de CR-004 se conservan).

## Status

READY

## User story

**Como** usuario que carga la aplicación web (organizador, invitado o administrador), **quiero**
que la marca Phoeve se sirva con imágenes del tamaño adecuado, **para** que la aplicación cargue
más rápido y la consola de desarrollo no reporte advertencias de rendimiento (NG0913), sin alterar
la identidad gráfica.

## Problema (CONFIRMED)

Evidencia verificada localmente contra el código instalado y el commit `c744647`:

- `@angular/core@21.2.25` emite `NG0913` (`ImagePerformanceWarning`) en modo desarrollo. Regla:
  `OVERSIZED_IMAGE_TOLERANCE = 1200`; un `<img>` es *oversized* si
  `naturalWidth − devicePixelRatio × renderedWidth ≥ 1200` (o igual en el eje alto). Exenciones:
  `src` `.svg`, `object-fit: cover` y atributo `ng-img`. El chequeo usa el **intrínseco del
  recurso realmente cargado**, no el atributo del HTML, y corre una sola vez ~200 ms tras `load`.
- Wordmarks afectados (render CSS confirmado en SCSS):

  | Superficie | Asset | Intrínseco | Render CSS | Atributos HTML | Peso |
  |---|---|---|---|---|---|
  | Home header (`.el-header__logo`) | `logo-primary.png` | 2172×724 | 96×32 | 96×32 | 286.360 B |
  | Organizer shell (`.brand-logo`) | `logo-primary.png` | 2172×724 | 96×32 | 105×35 | (mismo archivo) |
  | Login admin (`.auth-brand-logo`) | `logo-primary.png` | 2172×724 | 108×36 | 120×40 | (mismo archivo) |
  | Login organizer (`.auth-brand-logo`) | `logo-primary.png` | 2172×724 | 108×36 | 120×40 | (mismo archivo) |
  | Home footer (`.el-footer__logo`) | `logo-dark.png` | 2172×724 | 96×32 | 96×32 | 283.221 B |

- No afectados: `favicon.png` (`<link rel="icon">`), `login-background.jpg` /
  `admin-login-background.jpg` (`background-image`), `organizer-avatar.jpg` (`object-fit: cover`).
- Peso publicado en disco del set PNG ≈1,17 MiB (1.224.308 B); `logo-grayscale.png` (279.911 B)
  está en el catálogo pero **nunca se solicita**. Peso realmente solicitado **como `<img>`** con
  header + footer: 569.581 B (≈556 KiB).
- `NG0913` es sólo de desarrollo (`ngDevMode`); el valor del ticket está en el peso real de bytes.
- **Estado de los verificadores en HEAD:** `node scripts/verify-branding-assets.mjs` falla con
  `INVALID_ACTIVE_LOGO:footer` y `node scripts/verify-ui-foundation.mjs` falla leyendo el `.ts` del
  shell. Ambos son criterios de aceptación de este ticket. **Re-verificado en `668392d`** (commit
  posterior del owner): los fallos persisten idénticos, y los cinco nodos auditados siguen vigentes
  con `src` relativos crudos (`app-header.component.html:11/13`, `legal-footer.component.html:5/7`,
  `organizer-app-shell.component.html:14/16`, `organizer-login.component.html:5/7`,
  `admin-login.component.ts:16/18`).

## Alcance funcional

Eliminar el warning NG0913 y reducir el peso de los wordmarks usados como `<img>`, preservando la
identidad gráfica y las reglas de procedencia vigentes.

**Enfoque B (APROBADO), un derivado por rol:**

| Rol | Uso | Derivado nuevo | Tamaño |
|---|---|---|---|
| `logo-primary` | header, shell, login admin, login organizer | `logo-primary-216.png` | 216×72 |
| `logo-dark` | footer | `logo-dark-192.png` | 192×64 |

- Sustitución directa del `src` por el derivado. **Sin `srcset`/`sizes`** (un archivo por rol cubre
  DPR 1 y 2 con margen amplio; el intrínseco queda por debajo del umbral incluso a DPR 1: el
  mínimo restrictivo es 96 px render + tolerancia 1200). Si se añadieran descriptores `w` en el
  futuro, `sizes` sería obligatorio por superficie.
- Los originales publicados y los de `docs/branding/assets/phoeve/` **no se tocan** (nombres y
  hashes intactos): siguen siendo la fuente de verdad. Los derivados usan nombres nuevos con el
  ancho.
- **Descartado: `NgOptimizedImage`** (loader por defecto no produce `srcset` real y añade
  NG02950/NG02955/NG02960/NG02963). Opción condicional futura con decisión de `priority`.
- La matriz de render es **CSS**, no los atributos del HTML: header y footer declaran `96×32`, el
  shell `105×35` y ambos logins `120×40`, y se conservan para CLS. 2× no cubre DPR 3 (ligera
  suavidad, sin NG0913): variante futura.

## Fuera de alcance

Cambiar el arte, recolor, vectorizar o sustituir por los SVG históricos de EventLens; esquema
multibrand; `favicon`, `logo-grayscale`, fondos de login y avatar; CDN o proveedor de imágenes;
estrategia global de imágenes; adoptar `NgOptimizedImage`; `srcset`/`sizes`; identidad técnica
`@eventlens/*`, selectores `eventlens-*`, `--el-*`, Manrope, rutas, API/OpenAPI y permisos.

**Residual aceptado:** `favicon.png` (374.816 B) sigue sin optimizar; es el archivo más pesado
**del set PNG de marca**, aunque avatar (698.657 B) y fondos de login lo superan y quedan fuera.

## Criterios de aceptación

### Warning y diagnósticos (falsable)

**Dado** el entorno de desarrollo, **cuando** se cargan las cinco superficies de marca (Home
header+footer, login admin, login organizer, shell organizador) en DPR 1 y DPR 2 y se espera al
evento `load` más la ventana de escaneo (~200 ms), **entonces** no aparece `NG0913` y no aparece
**ningún diagnóstico de consola nuevo** (warning/error de Angular) respecto de la captura base
registrada antes del cambio.

Método: captura de consola antes/después con la misma matriz de superficies y DPR, registrada como
evidencia; la aserción es la ausencia de líneas nuevas respecto de la base.

### Peso (protocolo de medición)

**Dado** un build de producción, **cuando** se mide la suma de bytes de los **dos derivados
distintos** referenciados por los cinco nodos wordmark, **entonces** el total es **≤ 40 KiB**
(40.960 B, techo holgado) y la reducción frente a la línea base **569.581 B** (`logo-primary.png`
286.360 B + `logo-dark.png` 283.221 B = los originales que los derivados sustituyen) es **≥ 85 %**
(esperada > 95 %).

- Conjunto medido: **los dos archivos distintos** (`logo-primary-216.png`, `logo-dark-192.png`),
  aunque los referencien cinco nodos; **no** se suma cinco veces. Por mecanismo, los nodos
  auditados son los de la tabla de *Contrato de derivados* de CR-009. **Excluidos explícitamente:**
  `organizer-avatar.jpg` (698.657 B), favicon y fondos (`background-image`), que impedirían
  alcanzar el techo.
- Fuente y comando: `derivatives[].bytes` del manifiesto tras
  `pnpm --filter @eventlens/web build`, contrastado con el tamaño real de los archivos publicados.
- Expectativa: se fija la **medición real del encoder** (para 216×72 / 192×64 RGBA el orden realista
  es 3–6 KiB por archivo; ≈6–12 KiB la suma). El techo de 40 KiB es un límite superior holgado, no
  un valor esperado: si la medición se acercara al techo, se investiga antes de cerrar y el cap se
  revisa **con evidencia**, nunca en silencio.

### Fidelidad y procedencia

**Dado** los assets publicados, **cuando** se valida la fidelidad, **entonces** proporción, colores,
transparencia y encuadre permanecen equivalentes a la **fuente canónica** de
`docs/branding/assets/phoeve/` a los tamaños renderizados reales, se conservan `alt="Phoeve"`, los
atributos `width`/`height`, el `aspect-ratio: 2172/724` y el fallback (`onLogoError` / marca
textual), y **no aparece** `loading=` ni `lazy` en los cinco nodos (grep de ausencia). Esta
comprobación **no** constituye ni implica la aprobación visual pendiente de CR-006. Se anota la
tabla "Copia publicada (mismos bytes)" de `docs/branding/PHOEVE-MANUAL-DE-MARCA.md` (documental,
sin cambio de arte).

**Dado** el repositorio, **cuando** se ejecutan los verificadores, **entonces**
`node scripts/verify-branding-assets.mjs` y `node scripts/verify-ui-foundation.mjs` pasan, con:

- originales byte-idénticos (hashes de origen sin cambios) y `source.equals(published)` intacto;
- **conjunto auditado por mecanismo, con rol esperado atado por superficie:** `.el-header__logo`
  (`app-header.component.html`) → `logo-primary-216.png`; `.el-footer__logo`
  (`legal-footer.component.html`) → `logo-dark-192.png`; `.brand-logo`
  (`organizer-app-shell.component.html`) → `logo-primary-216.png`; `.auth-brand-logo`
  (`organizer-login.component.html`) → `logo-primary-216.png`; `.auth-brand-logo` (plantilla inline
  de `admin-login.component.ts`) → `logo-primary-216.png`. **No-vacuidad:** cada nodo contiene ≥1
  `<img>` cuyo `src` normalizado es **exactamente** el derivado esperado de su rol (no cualquier
  derivado); **aserción negativa I6:** el `src` crudo no empieza por `/` ni contiene `./`; se leen
  las plantillas `.html` reales (el shell ya usa `templateUrl`); ninguna referencia a un archivo por
  encima del cap. Esta auditoría de los cinco nodos (binding, no-vacuidad, aserción negativa y grep
  de ausencia de `loading`/`lazy`) la posee `verify-branding-assets.mjs`;
- **`verify-ui-foundation.mjs`:** debe leer el `.html` del shell (no el `.ts`, que se conserva para
  `styleUrl`/SCSS) y **sustituir** su aserción actual
  `includes('assets/branding/phoeve/logo-primary.png')` (línea 167) por la comparación con el
  literal del derivado, conservando `alt` y `brand-fallback-text`; de lo contrario el criterio
  *Fidelidad y procedencia → verificadores* es insatisfacible, porque al servir
  `logo-primary-216.png` esa subcadena desaparece;
- manifiesto `schemaVersion: 2` con `assets.length === 4` y `derivatives[]` conforme a las
  condiciones de máquina de CR-009 (`authorizedBy` con opt-in válido, `derivedFrom`/`sourceSha256`/
  `transform.from` atados a `assets[]`, `role` coherente, `minWidthPx[role] ≤ width ≤ maxWidthPx`,
  `height ≤ maxHeightPx`, `height === width / 3`, sin upscale, `transform.type ∈ allowedTransforms`,
  `file` = nombre sin ruta, firma PNG + IHDR + `colorType === 6`, `bytes`/`sha256` reales); el
  verificador falla con `UNAUTHORIZED_DERIVATIVES` si hay derivados sin autorización válida;
- acoplamiento de esquema: `schemaVersion === 1 ⇒` sin `derivatives`; `2 ⇒` v2 completo.

### Resolución y base href

**Dado** los cinco nodos wordmark, **cuando** se valida la resolución, **entonces** usan rutas
relativas (`assets/branding/phoeve/...`, sin `/` inicial), verificadas por aserción estática que
compara el `src` normalizado con `assets/branding/phoeve/${derivative.file}`;
`resolveBrandAssetUrl` se valida por prueba unitaria con `/` y con el prefijo de pruebas del spec
(`/phoeve-preview/`) — se declara explícitamente que esa prueba cubre el **helper**, no las
plantillas, y que ninguna plantilla lo usa hoy. Quedan **fuera del AC** las URL absolutas de
`background-image` (`admin-login.component.ts:153`, `organizer-login.component.scss:12`), sin
cambios. La verificación HTTP real sirviendo el build en subruta se registra como `[NOT_EVALUATED]`
si no se ejecuta.

## Reglas de negocio

- **CONFIRMED (CR-006):** la publicación vigente es copia **bit a bit**; el manifiesto declara
  `modifyVectorizeRecolorOrReplace: NOT_AUTHORIZED`.
- **CONFIRMED (CR-009, `CHANGE_READY`):** autoriza de forma acotada la generación de derivados
  PNG del mismo arte y la actualización de su verificación, conservando los originales y sus
  hashes. La excepción vive en `derivativeGeneration` + opt-in del CR (token emitido el 2026-10-14);
  el literal de CR-006 no se enmienda en su valor y se añade referencia cruzada. Aprobado por ambos
  gates (revisión 4-final).
- Los derivados no alteran arte, colores, transparencia, proporción ni encuadre; no se vectorizan ni
  recolorean; nunca se sobrescribe un nombre de rol publicado; la transformación permitida es sólo
  `raster-resize` (incluye la re-codificación PNG).
- **CONFIRMED:** no se transforma el PNG en un supuesto vector maestro ni se introducen los SVG
  históricos de EventLens como identidad Phoeve.
- La marca se sirve igual en todas las superficies; el cambio es de carga/optimización, no de diseño.
- Los assets de marca son públicos, sin datos de evento ni contenido privado.

## Validaciones y permisos

Publicación estática de identidad, sin sesión/grant ni permisos nuevos. Validar procedencia/licencia
antes de publicar cualquier derivado. No consultar ni almacenar datos de eventos para validaciones
visuales. No leer secretos.

## Casos de error y estados vacíos

Fallo al cargar una imagen: se mantiene el fallback existente (`onLogoError` en el shell; texto
alternativo en header/footer/login), sin icono roto ni retry. Derivado ausente o 404: degrada al
texto alternativo, nunca a un placeholder improvisado. Un cambio que altere la marca, rompa un
verificador, relaje `source.equals(published)` o introduzca un diagnóstico nuevo impide el cierre.

## Datos / contratos afectados

- Assets nuevos: `apps/web/public/assets/branding/phoeve/logo-primary-216.png`,
  `apps/web/public/assets/branding/phoeve/logo-dark-192.png`.
- Originales: `apps/web/public/assets/branding/phoeve/{logo-primary,logo-dark,logo-grayscale,favicon}.png`
  y `docs/branding/assets/phoeve/*` **sin cambios** (byte-idénticos).
- Superficies: `apps/web/src/app/public-home/app-header.component.html`,
  `legal-footer.component.html`, `apps/web/src/app/admin/admin-login.component.ts` (plantilla
  inline), `apps/web/src/app/organizer-auth/organizer-login.component.html`,
  `apps/web/src/app/organizer/organizer-app-shell.component.html`.
- Catálogo y manifiesto: `apps/web/src/app/branding/branding-assets.ts` (nuevo export
  `CORPORATE_BRAND_DERIVATIVES`, sin tocar `CORPORATE_BRAND_ASSETS`),
  `docs/branding/phoeve-source-manifest.json` (v2).
- Verificadores: `scripts/verify-branding-assets.mjs`, `scripts/verify-ui-foundation.mjs`.
- Pruebas: `apps/web/src/app/branding/branding-assets.spec.ts`,
  `apps/web/src/app/organizer/organizer-app-shell.component.spec.ts:63`.
- Contrato de marca: `.codex/context/brand-integration-contract.md` (§ *Assets derivados de marca*,
  extensión PROPUESTA incorporada desde CR-009).
- Documentación: `docs/branding/PHOEVE-MANUAL-DE-MARCA.md`.
- Sin cambios de API/OpenAPI, Nest, Prisma, sesiones, grants ni contratos de dominio.

## Dependencias técnicas y funcionales

`@angular/core@21.2.25` (`ImagePerformanceWarning`); [CR-009](../changes/CR-009.md) (autorización
de derivados); [CR-006](../changes/CR-006.md); [CR-004](../changes/CR-004.md);
`docs/branding/phoeve-source-manifest.json`; `docs/branding/PHOEVE-MANUAL-DE-MARCA.md`;
EL-TK-203/204 (assets publicados y shell).

## Dependencias de tickets

- **depends_on:** EL-TK-203 (assets publicados), EL-TK-204 (shell con wordmark), aprobación de
  CR-009 y reparación de los dos verificadores de marca.
- **blocks:** ninguno.
- **can_parallelize_with:** ninguno sobre los mismos archivos de marca.

## Pruebas requeridas

1. `node scripts/verify-branding-assets.mjs` → PASS (repara `INVALID_ACTIVE_LOGO:footer` **y**
   `INVALID_ACTIVE_LOGO:shell`; añade la verificación de derivados y la no-vacuidad).
2. `node scripts/verify-ui-foundation.mjs` → PASS (lee `organizer-app-shell.component.html` y
   valida el wordmark contra los derivados, no el literal antiguo).
3. `pnpm --filter @eventlens/web typecheck|test|build` → PASS, con `branding-assets.spec.ts` (los
   cuatro originales + el nuevo export de derivados) y `organizer-app-shell.component.spec.ts`
   actualizados.
4. Captura de consola antes/después en las cinco superficies, DPR 1 y 2, tras `load`: sin NG0913 y
   sin diagnósticos nuevos.
5. Medición de bytes de los **dos derivados distintos** con el protocolo del AC de peso, con la
   tabla antes/después.
6. Verificación visual registrada a tamaño real y con `base href` raíz (+ prefijo si se ejecuta).
7. `[NOT_EVALUATED]` explícito: regeneración byte a byte de derivados en CI y verificación HTTP
   servida en subruta.

No declarar PASS sin ejecutar ni certificar sobre artes distintos a la fuente canónica.

## Observabilidad / auditoría

Evidencia: capturas de consola (base y final), salida de ambos verificadores, tabla de bytes
antes/después, registro de procedencia de los derivados (parámetros + hashes) en el manifiesto y
anotación del manual Phoeve. `NG0913` sólo existe en desarrollo. No registrar secretos ni contenido
de eventos.

## Prioridad

RECOMMENDED P2 — correctivo de rendimiento/DX; no bloquea capacidad funcional (el warning es
dev-only), pero el peso real de bytes existe y los verificadores de marca están rojos.

## Estimación

M — dos derivados + manifiesto v2 + catálogo de derivados + dos verificadores + dos specs + medición
+ anotación documental.

## Riesgos / notas

- **Gobernanza:** el enfoque B cae bajo la restricción "bit a bit / sin modificación de imagen" de
  CR-006 → se implementa únicamente con CR-009 aprobado por los gates.
- **Marca:** `VISUAL_APPROVAL: PENDING` en CR-006; los derivados conservan el arte y no implican
  otorgar esa aprobación.
- **Procedencia:** debilitar `verify-branding-assets.mjs`; los hashes de origen no cambian.
  Escalar a `critical_review` sólo si se relaja `source.equals(published)`.
- **Verificadores rojos:** los tres defectos preexistentes (footer, shell `.ts`, aserción de
  `verify-ui-foundation.mjs`) son prerequisito lógico de los AC de este ticket; su reparación se
  mantiene en su alcance y no amplía dominio funcional. **El owner ratificó (CONFIRMED,
  2026-10-14) mantenerla dentro de EL-TK-243**, sin separarla en ticket propio.
- **Presupuesto de bytes:** techo holgado (40 KiB); exige medición real del encoder y revisión con
  evidencia si se acercara al techo.
- **Falso arreglo:** dejar el original como `src` descargaría ≈280 KiB (286.360 B) y no resolvería el
  peso.
- **Residual:** avatar (≈682 KiB / 698.657 B) y fondos de login (≈903 KiB / 924.228 B) dominan el peso
  real de la primera visita.

## Traceability

Evidencia: [registro del hallazgo](../sessions/2026-10-14-el-tk-243-brand-asset-load-finding.md) y
[dictámenes de gates](../sessions/2026-10-14-el-tk-243-brand-asset-load-gates.md).
[CR-009](../changes/CR-009.md) (autorización acotada de derivados), CR-006 (restricción de bytes) y
CR-004 (publicación de marca); `scripts/verify-branding-assets.mjs`;
`scripts/verify-ui-foundation.mjs`; `docs/branding/phoeve-source-manifest.json`;
`docs/branding/PHOEVE-MANUAL-DE-MARCA.md`; `ImagePerformanceWarning` de `@angular/core@21.2.25`.

## Definition of Ready

- [x] Comportamiento inequívoco y enfoque decidido (B fijado; autorización en CR-009)
- [x] Criterios comprobables y objetivo de peso definido (techo ≤ 40 KiB; ≥ 85 % sobre 569.581 B,
  con protocolo, conjunto medido por mecanismo y expectativa por medición real)
- [x] Matriz de derivados (render CSS), mecanismo de servicio y conjunto auditado con rol atado
- [x] Dependencias identificadas
- [x] Permisos/errores definidos (estáticos; sin permisos nuevos)
- [x] Sin preguntas BLOCKER

REQUIREMENTS_READY: YES — Gate 1 **APPROVED** (ronda 7, revisión 4-final); cierre documental
ejecutado el 2026-10-14 con autorización del owner.
READY_FOR_IMPLEMENTATION: YES — gate técnico **APPROVED** (ronda 6) y CR-009 en `CHANGE_READY`
(token emitido).
UI_REQUIRED: NO (no introduce ni cambia pantallas, formularios, navegación, estados visibles ni
componentes reutilizables; sí exige verificación visual de no-regresión y se reevaluaría si
cambiara el reflujo/CLS). IMPLEMENTED: NO.

## Bloqueos y gates requeridos

1. **Autorización de bytes:** atendida por [CR-009](../changes/CR-009.md) (`CHANGE_READY`, token
   `AUTHORIZED_DERIVATIVES: CR-009` emitido). Resuelta.
2. **Gate de requisitos/arquitectura:** `requirements_reviewer` + `architect` antes de `READY`.
   Rondas 1-5: ambos NEEDS_CHANGES. Ronda 6: gate técnico **APPROVED** y Gate 1 NEEDS_CHANGES sólo
   por correcciones de registro. Ronda 7: **Gate 1 APPROVED**. Ambos gates favorables; transición a
   `READY`/`CHANGE_READY` ejecutada el 2026-10-14 con autorización del owner.
3. **Decisión de enfoque:** CERRADA — B (derivados, `src` directo); `NgOptimizedImage` descartado.
4. **Reparación preexistente:** tres defectos en los dos verificadores. Se mantiene dentro del
   alcance por ser prerequisito lógico de sus propios criterios de aceptación; el owner **ratificó**
   (CONFIRMED, 2026-10-14) no separarla en un ticket propio.

## Change request

[CR-009](../changes/CR-009.md) — Optimización de carga de los assets de marca Phoeve (Technical
change, excepción acotada a la restricción de bytes de CR-006). Este ticket no pertenece a CR-004
ni a CR-008. Secuencia: CR-009 `CHANGE_READY` (2026-10-14) → Gate 1 requisitos APPROVED (ronda 7) →
gate técnico `architect` APPROVED (ronda 6) → (`ui_designer` NO) → EL-TK-243 `READY` (2026-10-14) →
software delivery. Sin ese CR no debe declararse READY ni implementarse por implicación.
