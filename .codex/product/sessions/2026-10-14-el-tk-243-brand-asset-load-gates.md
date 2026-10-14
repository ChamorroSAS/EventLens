# Dictámenes de gates — CR-009 y EL-TK-243 (2026-10-14)

Registro de los dictámenes de `requirements_reviewer` (Gate 1) y `architect` (gate técnico)
sobre [CR-009](../changes/CR-009.md) y [EL-TK-243](../tickets/EL-TK-243.md). Evidencia del
hallazgo en el [registro de sesión](2026-10-14-el-tk-243-brand-asset-load-finding.md).

Transcripción fiel y condensada de cada dictamen; no se reescriben veredictos.

---

## Ronda 1 (revisión 1 de los artefactos)

### Gate 1 — requirements_reviewer

**Veredicto: NEEDS_CHANGES.** `UI_REQUIRED: NO`. `REQUIREMENTS_READY: NO`. Sin preguntas BLOCKER.

| ID | Severidad | Hallazgo |
|---|---|---|
| MAJOR-1 | MAJOR | Rango de tamaño derivado inconsistente: "2× del render ≈240–512 px" frente a renders reales 96×32 / 108×36. |
| MAJOR-2 | MAJOR | Objetivo de bytes sin protocolo de medición reproducible. |
| MAJOR-3 | MAJOR | Inventario de contratos/pruebas incompleto: faltaban `scripts/verify-ui-foundation.mjs`, la aserción de `verify-branding-assets.mjs` sobre header/footer/shell y `organizer-app-shell.component.spec.ts:63`. |
| MAJOR-4 | MAJOR | CR-009 no fijaba el estado resultante del manifiesto (`modifyVectorizeRecolorOrReplace: NOT_AUTHORIZED`, `schemaVersion===1`, `assets.length===4`). |
| MINOR-5 | MINOR | Trazabilidad del "hallazgo de EL-TK-242" sin artefacto que lo registre. |
| MINOR-6 | MINOR | "1,20 MB servido en primera visita" sobrevalorado (`logo-grayscale.png` nunca se solicita). |
| MINOR-7 | MINOR | Las exclusiones de CR-009 no nombraban favicon/fondos/avatar. |
| MINOR-8 | MINOR | AC de `base href` no acotado (dos assets usan URL absoluta de background). |
| MINOR-9 | MINOR | AC de fidelidad refería "arte aprobado" con `VISUAL_APPROVAL: PENDING`. |
| MINOR-10 | MINOR | Checklist de DoR auto-certificaba criterios aún no verificables. |
| OBS-11 | OBSERVATION | Refactor de plantillas en curso que rompía ambos verificadores. |
| OBS-12 | OBSERVATION | Verificado a favor: tolerancia 1200, regla y exenciones de NG0913 y los renders citados. |

### Gate técnico — architect

**Veredicto: NEEDS_CHANGES.** `baseline_impact: EXTENSION_REQUIRED`.
`critical_review: NO`.

**Decisiones D1–D8**

| ID | Decisión |
|---|---|
| D1 | Enfoque B (derivado) aprobado como mecanismo suficiente: la eliminación de NG0913 la produce el intrínseco del recurso cargado, no la directiva ni `srcset`; la exención `ng-img` **no** debe usarse como mecanismo de corrección. |
| D2 | Si se usan descriptores `w` en `srcset`, `sizes` es obligatorio y debe coincidir con el render real por superficie; alternativa válida y más simple: descriptores de densidad (`1x,2x`) sin `sizes`. |
| D3 | `NgOptimizedImage` deja de ser RECOMMENDED por defecto y pasa a OPTIONAL/CONDICIONAL: el loader por defecto no genera `srcset` real (requeriría loader propio = abstracción de CDN DEFERRED) y añade NG02950/NG02955/NG02960/NG02963. |
| D4 | Requerido un contrato de assets derivados: manifiesto v2 con array `derivatives` independiente (los 4 originales permanecen en `assets`) y autorización machine-checkable; el script debe fallar si hay derivados sin autorización. |
| D5 | La verificación de `base href` (`/` y prefijo) debe re-establecerse con método concreto o reescribirse el AC: hoy ningún script levanta HTTP ni comprueba prefijos. |
| D6 | Sin impacto en API/OpenAPI, Nest/Prisma, sesiones/grants, permisos ni contratos de dominio (confirmado contra baseline). |
| D7 | `critical_review` NO requerido; se escalaría solo si se relaja `source.equals(published)` de los originales o los anclajes de integridad del manifiesto. |
| D8 | Derivados como binarios comprometidos + parámetros declarados; la regeneración byte a byte NO se verifica en CI y debe declararse `[NOT_EVALUATED]`. |

**Invariantes I1–I9**

| ID | Invariante |
|---|---|
| I1 | Los 4 originales publicados permanecen byte-idénticos a `docs/branding/assets/phoeve/*`; no se relaja `source.equals(published)`. |
| I2 | Prohibido sobrescribir un nombre de rol publicado con contenido derivado; todo derivado usa nombre nuevo que incluye el ancho objetivo. |
| I3 | Cada derivado declara `derivedFrom` + sha256 de origen + sha256 propio + bytes + width/height + parámetros de transformación. |
| I4 | Transformación permitida: solo `raster-resize` del mismo arte; sin recolor, recorte, redibujo, vectorización ni cambio de proporción/transparencia. |
| I5 | Cap de derivados: ≤512 px en cada eje y siempre ≤ tamaño del origen (sin upscale); ningún `<img>` de marca puede referenciar un archivo por encima del cap. |
| I6 | Ningún `<img>` de marca usa rutas absolutas; resolución relativa al `base href`. |
| I7 | Se conservan `alt="Phoeve"`, `width`/`height` explícitos, `aspect-ratio: 2172/724`, el fallback `onLogoError`/texto de marca. |
| I8 | No se alteran bytes ni rutas de favicon, grayscale, fondos de login ni avatar; no se generan derivados de roles no usados como `<img>`. |
| I9 | No se cambia `loading` ni se añade `lazy` en imágenes de marca (evita la variante LCP de NG0913). |

**Hallazgos:** MAJOR ×5 (invertir el chequeo de plantillas de `verify-branding-assets.mjs`;
incluir `verify-ui-foundation.mjs`; fijar el método de medición de bytes; fijar el método de
`base href`; ampliar la condición de "sin diagnósticos nuevos"); MINOR ×4 (matriz de variantes,
inventario de archivos, manifiesto v2, caché/nombres); OBSERVATION ×2 (peso residual dominado
por avatar/fondos; alcance real del "~90 %").

---

## Ronda 2 (revisión 2 de los artefactos)

### Gate 1 — requirements_reviewer

**Veredicto: NEEDS_CHANGES.** `UI_REQUIRED: NO`. `REQUIREMENTS_READY: NO`. Sin BLOCKER ni MAJOR.

Resolución de la ronda 1: MAJOR-1..4 **RESOLVED**, MINOR-5..10 **RESOLVED**, OBS-11
**RESOLVED** (verificado contra el repositorio y el commit `c744647`).

| ID | Severidad | Hallazgo nuevo de la ronda 2 |
|---|---|---|
| N1 | MINOR | Se cita como evidencia `…-brand-asset-load-gates.md`, que no existía (corregido con este registro). |
| N2 | MINOR | El contrato no nombraba el cambio mecánico del guard `schemaVersion !== 1` en `verify-branding-assets.mjs`. |
| N3 | MINOR | Conjunto de `<img>` auditados sin definir: el avatar (`organizer-avatar.jpg`, 698.657 B) es un `<img>` bajo la ruta de marca y supera el cap. |
| N4 | MINOR | "El favicon es el archivo individual más pesado" es falso en el conjunto listado (avatar/fondos lo superan). |
| N5 | MINOR | Se referenciaba el manual histórico de EventLens en lugar de `docs/branding/PHOEVE-MANUAL-DE-MARCA.md`. |
| N6 | MINOR | El registro de evidencia quedaba fuera de control de versiones por la lista blanca de `.gitignore`. |
| OBS | OBSERVATION | Notación de cap inconsistente, unidades KiB/MB mezcladas y ausencia de cota inferior de dimensión. |

### Gate técnico — architect

**Veredicto: NEEDS_CHANGES.** `baseline_impact: EXTENSION_REQUIRED`.
`critical_review: NO`.

Resolución: D1 **RESOLVED**, D2 **RESOLVED**, D3 **PARTIAL**, D4 **PARTIAL**, D5 **RESOLVED**,
D6 **PARTIAL**, D7 **RESOLVED**, D8 **RESOLVED**.

| ID | Severidad | Hallazgo nuevo de la ronda 2 |
|---|---|---|
| A1 | MAJOR | La reparación de `verify-branding-assets.mjs` es incorrecta/incompleta: sigue leyendo el `.ts` del shell (que ya no contiene el logo ni `alt`), por lo que tras arreglar el footer queda `INVALID_ACTIVE_LOGO:shell` o un PASS vacío. Debe leerse la plantilla `.html` y exigir no-vacuidad. |
| A2 | MAJOR | Conjunto auditado/medido no definido por mecanismo: el avatar (698.657 B) y las URL absolutas de `background-image` pueden producir falso FAIL/PASS. |
| A3 | MINOR | `derivativeGeneration` declarativo: sin condiciones explícitas ni vínculo con el estado de CR-009 ni con `assets[]`. |
| A4 | MINOR | Falta cota inferior: un derivado degenerado (p. ej. 3×1) satisface todos los invariantes de máquina. |
| A5 | MINOR | Inconsistencia entre CR y ticket en la condición ampliada de "sin diagnósticos nuevos". |
| A6 | MINOR | Acoplamiento `schemaVersion ↔ derivatives` no especificado. |
| A7 | MINOR | El AC de `base href` declara una prueba de `resolveBrandAssetUrl` que ningún template usa. |
| A8 | MINOR | Representación del catálogo/tipado `role` sin decidir (colisión de "primary"). |
| A9 | MINOR | Sesión de dictámenes inexistente (I1–I9 no auditables). |
| A10 | MINOR | CR-009 no registrado en CHANGELOG/BACKLOG/CONVENTIONS. |
| OBS | OBSERVATION | `restrictions.modifyVectorizeRecolorOrReplace` coexistirá con `derivatives[]` (autorreferencia a aclarar); etiquetar la matriz como "render CSS" y dejar DPR 3 como opción futura. |

---

## Ronda 3

Pendiente: los artefactos se revisan en la **revisión 3** con las correcciones de A1–A10 y
N1–N6 aplicadas. Resultado en la sección siguiente una vez emitidos los dictámenes.

### Resultado de la ronda 3

_(ver actualización al final de este archivo)_
