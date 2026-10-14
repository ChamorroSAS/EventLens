# EL-TK-243 — Optimizar la carga de los assets de marca Phoeve y eliminar el warning NG0913

Hallazgo de rendimiento detectado durante la verificación de EL-TK-242. Trabajo
correctivo fuera de CR-004/CR-008; requiere CR propio o excepción aprobada a la
restricción de bytes de CR-006 antes de READY. DRAFT.

**Enfoque fijado (CONFIRMED por el usuario, 2026-10-14): B — derivados optimizados,
autorizados de forma acotada por [CR-009](../changes/CR-009.md) (DRAFT / PENDING_GATES),
servidos con `srcset`/`NgOptimizedImage` (RECOMMENDED). El enfoque A queda como mecanismo
de servicio, no como alternativa de decisión.**

## Parent epic

EL-EP-002 (extensión transversal de marca; el DONE histórico del alcance original y el
cierre de la extensión de CR-004 se conservan).

## Status

DRAFT

## User story

**Como** usuario que carga la aplicación web (organizador, invitado o administrador),
**quiero** que la marca Phoeve se sirva con imágenes del tamaño adecuado, **para** que la
aplicación cargue más rápido y la consola de desarrollo no reporte advertencias de
rendimiento (NG0913), sin alterar la identidad gráfica.

## Problema (CONFIRMED)

Evidencia verificada localmente contra el código instalado:

- `@angular/core@21.2.25` emite `NG0913` en modo desarrollo mediante
  `ImagePerformanceWarning` (`fesm2022/core.mjs`). Regla: `OVERSIZED_IMAGE_TOLERANCE = 1200`;
  un `<img>` es *oversized* si `naturalWidth − devicePixelRatio × renderedWidth ≥ 1200`
  (o el mismo cálculo en el eje alto). Exenciones: `src` terminado en `.svg`,
  `object-fit: cover`, y el atributo `ng-img` (imágenes gestionadas por `NgOptimizedImage`).
- Afectados (usados como `<img>`, renderizados a ~32–36 CSS px de alto):

  | Asset | Intrínseco | Peso | Render |
  |---|---|---|---|
  | `phoeve/logo-primary.png` | 2172×724 | ~280 KB | header 96×32; login admin/organizer ~108×36; shell 96×32 |
  | `phoeve/logo-dark.png` | 2172×724 | ~277 KB | footer 96×32 |

- No afectados: `favicon.png` (se usa en `<link rel=icon>`, no en `<img>`),
  `login-background.jpg` / `admin-login-background.jpg` (`background-image`),
  `organizer-avatar.jpg` (`object-fit: cover`).
- Peso total del set Phoeve publicado ≈ 1,20 MB (`logo-*` 3×~280 KB + `favicon.png` 366 KB),
  servido en la primera visita de varias pantallas.
- `NG0913` es sólo de desarrollo (`ngDevMode`): sin impacto en el bundle productivo; el
  coste real de bytes y de tiempo de carga sí existe.

## Alcance funcional

Eliminar el warning NG0913 y reducir el coste de bytes de los assets de marca Phoeve
usados como `<img>`, preservando la identidad gráfica y las reglas de procedencia vigentes.

Enfoque fijado (decisión cerrada; autorización en [CR-009](../changes/CR-009.md)):

- **B — Derivados optimizados (ENFOQUE APROBADO):** generar variantes PNG del mismo arte a
  ~2× del tamaño renderizado (≈240–512 px de ancho máximo) y servirlas (sustitución o
  `srcset`/`sizes`), conservando los originales intactos como fuente de verdad. Reduce el
  peso del set ~90 % y elimina el warning (natural cercano al renderizado). Autorizado de
  forma acotada por CR-009, que exime la restricción de bytes de CR-006 sin debilitar la
  verificación de procedencia.
- **A — Mecanismo de servicio (RECOMMENDED, no una alternativa):** adoptar
  `NgOptimizedImage` (`ngSrc` + `width`/`height`, `srcset`/`sizes`) en los `<img>` de marca.
  La directiva fija el atributo `ng-img`, que exime la imagen del chequeo NG0913 y refuerza
  la no-regresión futura; por sí sola no reduce bytes sin variantes servidas.

## Fuera de alcance

Cambiar el arte, recolor, vectorizar o sustituir por los SVG históricos de EventLens (marca
distinta; CR-006 lo prohíbe); esquema multibrand; `favicon`, fondos de login y avatar del
organizador (no disparan NG0913); CDN o proveedor de imágenes; estrategia global de
imágenes; identidad técnica `@eventlens/*`, selectores `eventlens-*`, `--el-*`, Manrope,
rutas, API/OpenAPI y permisos.

## Criterios de aceptación

### Warning y carga

**Dado** el entorno de desarrollo, **cuando** se cargan Home, login admin, login organizador
y el shell del organizador, **entonces** la consola no reporta NG0913 para
`logo-primary.png` ni `logo-dark.png` (ni para el resto del set de marca).

**Dado** un build de producción, **cuando** se mide el payload de los `<img>` de marca
(`logo-primary.png` + `logo-dark.png`, línea base ≈557 KB), **entonces** se sirven derivados
a ~2× del tamaño renderizado (≈240–512 px de ancho) con reducción **≥ 85 %** del payload
(objetivo RECOMMENDED ≈40 KB combinados), sin cambios perceptibles en la marca renderizada.
El resto del set (`favicon`, fondos, avatar) no altera su tamaño.

### Fidelidad y procedencia

**Dado** los assets publicados, **cuando** se valida la fidelidad, **entonces** proporción,
colores, transparencia y encuadre permanecen equivalentes al arte aprobado a los tamaños
renderizados reales, `alt="Phoeve"` se conserva y el fallback existente (`onLogoError` /
marca textual) sigue funcionando.

**Dado** el repositorio, **cuando** se ejecuta `node scripts/verify-branding-assets.mjs`,
**entonces** pasa; los originales conservan sus hashes de origen y el script, el manifiesto
`docs/branding/phoeve-source-manifest.json` y `branding-assets.ts` verifican además la
procedencia de los derivados (parámetros de derivación + hash) sin debilitar la integridad.

### Resolución y base href

**Dado** cualquier `base href` compatible, **cuando** el navegador solicita los assets,
**entonces** las URLs resuelven bajo `assets/branding/phoeve/...` sin 404 (raíz `/` y
prefijo `/eventlens/`).

## Reglas de negocio

- **CONFIRMED (CR-006):** la publicación vigente es copia **bit a bit** y
  `docs/branding/phoeve-source-manifest.json` declara
  `modifyVectorizeRecolorOrReplace: NOT_AUTHORIZED`.
- **CONFIRMED (CR-009, DRAFT/PENDING_GATES):** autoriza de forma acotada la generación de
  derivados PNG del mismo arte y la actualización de su verificación, conservando los
  originales y sus hashes. Habilita el enfoque B; la aprobación formal depende de los gates
  de requisitos y de arquitectura.
- Los derivados no alteran arte, colores, transparencia, proporción ni encuadre, y no se
  vectorizan ni se recolorean.
- **CONFIRMED:** no se transforma el PNG en un supuesto vector maestro ni se introducen los
  SVG históricos de EventLens como identidad Phoeve.
- La marca se sirve igual en todas las superficies; el cambio es de carga/optimización, no de
  diseño.
- Los assets de marca son públicos, sin datos de evento ni contenido privado.

## Validaciones y permisos

Publicación estática de identidad, sin sesión/grant ni permisos nuevos. Validar
procedencia/licencia antes de publicar cualquier derivado. No consultar ni almacenar datos
de eventos para validaciones visuales. No leer secretos.

## Casos de error y estados vacíos

Fallo al cargar una imagen: se mantiene el fallback existente (`onLogoError` en el shell;
texto alternativo en header/footer/login), sin icono roto ni retry. Variante derivada ausente
o 404: la imagen debe degradar a un tamaño disponible válido, nunca a un placeholder
improvisado. Un cambio que altere la marca, rompa el verify o introduzca un warning nuevo
impide el cierre.

## Datos / contratos afectados

`apps/web/src/app/branding/branding-assets.ts` (catálogo de assets y hashes),
`docs/branding/phoeve-source-manifest.json`,
`apps/web/public/assets/branding/phoeve/*` (derivados autorizados por CR-009; originales
intactos),
`scripts/verify-branding-assets.mjs`,
`apps/web/src/app/branding/branding-assets.spec.ts`, y los `<img>` de marca en
header/footer/login/shell. Sin cambios de API/OpenAPI, Nest, Prisma, sesiones, grants ni
contratos de dominio.

## Dependencias técnicas y funcionales

`@angular/core@21.2.25` (`ImagePerformanceWarning`) y `@angular/common`
(`NgOptimizedImage`); [CR-009](../changes/CR-009.md) (autorización de derivados);
[CR-006](../changes/CR-006.md); [CR-004](../changes/CR-004.md);
`docs/branding/phoeve-source-manifest.json`; `docs/branding/MANUAL-DE-MARCA.md`;
EL-TK-203/204 (assets publicados y piloto del shell).

## Dependencias de tickets

- **depends_on:** EL-TK-203 (assets publicados), EL-TK-204 (shell con wordmark) y la
  aprobación de CR-009 (autorización de derivados).
- **blocks:** ninguno.
- **can_parallelize_with:** ninguno sobre los mismos archivos de marca.

## Pruebas requeridas

Unitarias de `branding-assets.spec.ts` y de los componentes que usan la marca; ejecución de
`node scripts/verify-branding-assets.mjs`; `pnpm --filter @eventlens/web typecheck|test|build`;
comprobación reproducible en dev de ausencia de NG0913 (consola) en las cuatro superficies;
verificación visual registrada a tamaño real y con `base href` raíz y prefijo; medición de
bytes del build antes/después. No declarar PASS sin ejecutar ni certificar sobre artes
distintos a los aprobados.

## Observabilidad / auditoría

Evidencia: captura de consola sin NG0913, resultado del verify script, delta de bytes del
build y registro de procedencia de los derivados (parámetros + hashes). `NG0913` sólo existe
en desarrollo; no hay auditoría de dominio. No registrar secretos ni contenido de eventos.

## Prioridad

RECOMMENDED P2 — correctivo de rendimiento/DX; no bloquea capacidad funcional (el warning es
dev-only), pero el coste de bytes es real en la primera visita.

## Estimación

M (enfoque B: derivados + actualización de manifiesto/verify/spec + servicio con
`srcset`/`NgOptimizedImage`).

## Riesgos / notas

- **Gobernanza:** el enfoque B cae bajo la restricción "bit a bit / sin modificación de
  imagen" de CR-006 → se implementa únicamente con [CR-009](../changes/CR-009.md) aprobado
  por los gates; no implementar por implicación.
- **Marca:** `VISUAL_APPROVAL: PENDING` en CR-006; los derivados conservan el arte y su
  aprobación visual sigue pendiente por separado.
- **Procedencia:** debilitar `verify-branding-assets.mjs` al tocar hashes/procedencia; los
  hashes de origen no cambian y se añade verificación de derivados.
- **Cache / `base href`:** rutas relativas y verificación en `/` y prefijo.
- El warning desaparece en producción por `ngDevMode`; el valor del ticket está en el peso
  real de bytes, no sólo en silenciar el aviso de desarrollo.

## Traceability

Hallazgo de la verificación de EL-TK-242; [CR-009](../changes/CR-009.md) (autorización
acotada de derivados), CR-006 (restricción de bytes) y CR-004 (publicación de marca);
`scripts/verify-branding-assets.mjs`; `docs/branding/phoeve-source-manifest.json`;
`ImagePerformanceWarning` de `@angular/core@21.2.25`.

## Definition of Ready

- [x] Comportamiento inequívoco y enfoque decidido (B fijado; autorización en CR-009)
- [x] Criterios comprobables y objetivo de bytes definido (≥ 85 % del payload de los `<img>`)
- [x] Dependencias identificadas
- [x] Permisos/errores definidos (estáticos; sin permisos nuevos)
- [x] Sin preguntas BLOCKER

REQUIREMENTS_READY: PENDING (pendiente de dictamen del gate de requisitos).
READY_FOR_IMPLEMENTATION: NO (pendiente del gate técnico de `architect` y de la aprobación
formal de CR-009). UI_REQUIRED: NO (no introduce ni cambia pantallas, formularios,
navegación, estados visibles ni componentes reutilizables; sí exige verificación visual de
no-regresión). IMPLEMENTED: NO.

## Bloqueos y gates requeridos

1. **Autorización de bytes (era BLOCKER del enfoque B):** atendida por
   [CR-009](../changes/CR-009.md) (DRAFT). Queda efectiva sólo tras su aprobación por los
   gates; no se implementa antes.
2. **Gate de requisitos/arquitectura:** requirements_reviewer + architect deben verificar
   CR-009 y este ticket antes de `READY`.
3. **Decisión de enfoque:** CERRADA — B (derivados) con `srcset`/`NgOptimizedImage`
   (RECOMMENDED) como mecanismo de servicio.

## Change request

[CR-009](../changes/CR-009.md) — Optimización de carga de los assets de marca Phoeve
(type Technical change, excepción acotada a la restricción de bytes de CR-006). Este ticket
no pertenece a CR-004 ni a CR-008. Secuencia: CR-009 DRAFT → Gate 1 requisitos → gate
técnico `architect` → (`ui_designer` NO) → EL-TK-243 `READY` → software delivery. Sin ese
CR no debe declararse READY ni implementarse por implicación.
