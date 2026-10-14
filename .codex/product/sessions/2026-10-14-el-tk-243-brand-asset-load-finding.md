# Hallazgo de carga de assets de marca y warning NG0913 — 2026-10-14

Registro de evidencia del hallazgo que origina [EL-TK-243](../tickets/EL-TK-243.md) y
[CR-009](../changes/CR-009.md). Investigación de solo lectura; no se modificó código, arte ni
binarios.

## Objetivo

Registrar de forma verificable (a) el warning de rendimiento NG0913 de Angular detectado
durante la verificación de [EL-TK-242](../tickets/EL-TK-242.md), (b) el coste de bytes real de
los assets de marca Phoeve y (c) el estado de los verificadores de marca en el commit de
referencia. El hallazgo no estaba registrado en ningún artefacto previo (EL-TK-242 es el
ticket de gaps de admin organizers y no contiene evidencia de NG0913).

## Método

Inspección directa, sin ejecución de build ni modificación de archivos:

- Lectura del código instalado `apps/web/node_modules/@angular/core` versión **21.2.25**
  (`fesm2022/core.mjs`) para la regla y las exenciones de `ImagePerformanceWarning`.
- Lectura de las plantillas/CSS de las cinco superficies de marca y de los scripts
  `scripts/verify-branding-assets.mjs`, `scripts/verify-ui-foundation.mjs`.
- Medición de bytes con `Get-ChildItem` (tamaño en disco) sobre
  `apps/web/public/assets/branding/phoeve/`.
- Ejecución de los dos verificadores sobre el árbol de trabajo limpio (commit `c744647`).

## CONFIRMED — causa del warning NG0913

- `NG0913` es `ImagePerformanceWarning`, **solo en modo desarrollo** (`ngDevMode`). Umbral
  `OVERSIZED_IMAGE_TOLERANCE = 1200`: un `<img>` es *oversized* si
  `naturalWidth − devicePixelRatio × renderedWidth ≥ 1200` o el mismo cálculo en el eje alto.
- Exenciones verificadas: `src` terminado en `.svg`; `object-fit: cover`; y el atributo
  `ng-img` que fija `NgOptimizedImage`.
- El chequeo compara el tamaño **intrínseco del recurso realmente cargado**, no lo declarado
  en el HTML, y se ejecuta una sola vez, ~200 ms después del evento `load`.

## CONFIRMED — superficies afectadas y tamaños de render

| Superficie | Archivo de marca | Render CSS efectivo |
|---|---|---|
| Home header | `logo-primary.png` | 96×32 (`height: 32px` + `aspect-ratio: 2172/724`) |
| Organizer shell | `logo-primary.png` | 96×32 (`block-size: 32px`) |
| Admin login | `logo-primary.png` | 108×36 (`block-size: 36px` en `styles`) |
| Organizer login | `logo-primary.png` | 108×36 (`block-size: 36px`) |
| Home footer | `logo-dark.png` | 96×32 (`height: 32px`) |

Los dos PNG de wordmark son **2172×724** intrínsecos, por lo que el exceso frente al render es
del orden de 2000 px y supera con holgura la tolerancia de 1200.

## CONFIRMED — no afectados

`favicon.png` (se usa en `<link rel="icon">`, no en `<img>`), `login-background.jpg` y
`admin-login-background.jpg` (`background-image`), `organizer-avatar.jpg`
(`object-fit: cover`).

## CONFIRMED — coste de bytes

| Asset | Bytes en disco | ¿Se solicita? |
|---|---|---|
| `logo-primary.png` | 286.360 | Sí, como `<img>` |
| `logo-dark.png` | 283.221 | Sí, como `<img>` |
| `favicon.png` | 374.816 | Sí, como `<link rel=icon>` |
| `logo-grayscale.png` | 279.911 | **No**: solo figura en el catálogo, sin uso como `<img>` |
| `login-background.jpg` | 427.266 | Sí (CSS, fuera de alcance) |
| `admin-login-background.jpg` | 496.962 | Sí (CSS, fuera de alcance) |
| `organizer-avatar.jpg` | 698.657 | Sí (fuera de alcance) |

- Peso **publicado en disco** del set PNG: 1.224.308 B ≈1,17 MiB.
- Peso **realmente solicitado** en una visita con header + footer, **incluyendo el favicon**:
  `logo-primary` (286.360) + `logo-dark` (283.221) + `favicon` (374.816) = 944.397 B
  (≈922 KiB). De esa cifra, los **wordmarks `<img>`** suman **569.581 B**, que es la
  línea base del criterio de peso (el favicon queda fuera de alcance).

## CONFIRMED — estado de los verificadores en HEAD (`c744647`)

Ambos verificadores **fallan hoy**, con independencia de este hallazgo:

- `node scripts/verify-branding-assets.mjs` → `[FAIL] INVALID_ACTIVE_LOGO:footer`. La
  [línea 47-51](../../../scripts/verify-branding-assets.mjs) exige `logo-primary.png` en
  header, footer y shell, pero el footer usa legítimamente `logo-dark.png`
  (`legal-footer.component.html:5`).
- `node scripts/verify-ui-foundation.mjs` → `[FAIL] Component does not reference
  assets/branding/phoeve/logo-primary.png`. La [línea 163-170](../../../scripts/verify-ui-foundation.mjs)
  lee `organizer-app-shell.component.ts`, pero el marcado del wordmark se movió a
  `organizer-app-shell.component.html` en el commit `c744647`.

Consecuencia: el criterio "ejecutar los verificadores de marca" de EL-TK-243 no puede
satisfacerse sin repararlos; ambas reparaciones forman parte de las actualizaciones ya
exigidas por el gate técnico de CR-009.

**Re-verificación en `668392d`** (commit posterior del owner, que toca también
`organizer-app-shell.component.html`): se ejecutaron de nuevo ambos scripts y los fallos persisten,
idénticos — `[FAIL] INVALID_ACTIVE_LOGO:footer` y `[FAIL] Component does not reference
assets/branding/phoeve/logo-primary.png`. Se confirmó además que el conjunto auditado de cinco nodos
sigue vigente y con `src` relativos crudos (sin `/` inicial ni `./`):
`app-header.component.html:11/13`, `legal-footer.component.html:5/7`,
`organizer-app-shell.component.html:14/16`, `organizer-login.component.html:5/7` y
`admin-login.component.ts:16/18`.

## Decisión adoptada

El usuario fijó el **enfoque B**: derivados PNG del mismo arte a 2× del render, conservando los
originales y sus hashes, autorizados de forma acotada por CR-009. El enfoque A
(`NgOptimizedImage`) queda descartado como mecanismo principal: con el loader por defecto no
genera `srcset` real (requeriría un loader propio = abstracción de CDN, DEFERRED en baseline) y
añade diagnósticos propios.

## ASSUMED / no verificado

- `ASSUMED`: la mejora de tiempos de carga percibida es marginal en la primera visita porque el
  peso dominante son avatar (≈682 KiB / 698.657 B) y fondos de login (≈903 KiB / 924.228 B), fuera de alcance.
- `[NOT_EVALUATED]`: regeneración byte a byte de los derivados en CI (no se añadirá dependencia
  de imágenes al repositorio).
- `[NOT_EVALUATED]`: verificación HTTP real bajo prefijo de `base href` en subruta.

## Próximo paso

Rondas 1-6 de gates aplicadas (ver
[dictámenes](2026-10-14-el-tk-243-brand-asset-load-gates.md)): la **revisión 4-final** de CR-009 y
EL-TK-243 corrige el token de autorización opt-in (forma endurecida, sin auto-autorización), el
formato de `derivatives[].file` y su normalización, el binding superficie→rol del conjunto
auditado, la aserción de `verify-ui-foundation.mjs` que el cambio invalidaba, la ambigüedad de la
suma de peso, el dominio de `role` y las precisiones de unidades/nomenclatura/recuento de rondas.
En la ronda 6 el gate técnico (`architect`) pasó a **APPROVED** y en la ronda 7 el **Gate 1**
también aprobó (con dos OBSERVATION no bloqueantes). Ambos gates son favorables sobre la revisión
4-final; el paso documental de cierre (`CHANGE_READY` + token, registros, contrato a vigente,
EL-TK-243 a `READY`) queda **pendiente de autorización del owner**. El owner ratificó (CONFIRMED,
2026-10-14) que la reparación de los dos verificadores se mantiene dentro de EL-TK-243.
