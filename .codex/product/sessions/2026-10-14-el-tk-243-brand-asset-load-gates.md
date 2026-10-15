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

## Ronda 3 (revisión 3 de los artefactos)

### Gate 1 — requirements_reviewer

**Veredicto: NEEDS_CHANGES.** `UI_REQUIRED: NO`. `REQUIREMENTS_READY: NO`. Sin BLOCKER.
Resolución de la ronda 2: N1–N6 **RESOLVED** (verificado contra el repositorio, `.gitignore` y
`git check-ignore`); la observación de ronda 2 **PARTIAL** (cota inferior y notación de cap
resueltas; KB/KiB seguían mezclados).

| ID | Severidad | Hallazgo de la ronda 3 |
|---|---|---|
| R3-1 | MINOR | CR-009 declaraba `brand-integration-contract.md (extensión)` como actualizado sin estarlo ni figurar entre los contratos afectados. |
| R3-2 | MINOR | La condición de máquina "CR cuyo estado no sea `DRAFT`" no fijaba fuente canónica ni token exacto (el literal `DRAFT` sigue presente tras la aprobación). |
| OBS | OBSERVATION | Dos magnitudes de peso con el mismo nombre (944.397 B con favicon vs 569.581 B sólo `<img>`); notación del cap y `margen cero`; CR citaba sólo `105×35`/`120×40` omitiendo header/footer `96×32`; "Próximo paso" del hallazgo seguía en la ronda 1. |

### Gate técnico — architect

**Veredicto: NEEDS_CHANGES.** `baseline_impact: EXTENSION_REQUIRED`. `critical_review: NO`.
Resolución de la ronda 2: A2/A4/A5/A6/A7/A8/A9/A10 **RESOLVED**; A1 **RESOLVED** en su forma;
A3 **PARTIAL** (autorización satisfacible por cualquier CR no `DRAFT`); I1/I2/I3/I5 **YES**,
I4/I6/I7/I8 **PARTIAL**, I9 **NO** (sin mecanismo).

| ID | Severidad | Hallazgo de la ronda 3 |
|---|---|---|
| B1 | MAJOR | `verify-ui-foundation.mjs:167` conservaba la aserción del literal `logo-primary.png` que el propio cambio elimina → AC #2 insatisfacible sin una tercera actualización no especificada. |
| B2 | MINOR | `authorizedBy` sólo exigía "CR existente no `DRAFT`": CR-006 (REVIEW_PENDING) habría pasado pese a prohibir la modificación. |
| B3 | MINOR | El campo/token de estado del CR no estaba definido y los CR usan formatos distintos. |
| B4 | MINOR | Ambigüedad de la suma de peso (por nodo ≈100 KB vs por derivado ≈40 KB) y "margen cero" incoherente con el tamaño realista. |
| B5 | MINOR | No se fijaba el formato de `derivatives[].file` (nombre vs ruta) necesario para la regla `src ∈ derivatives[]`. |
| B6 | MINOR | El conjunto auditado no ataba el rol por superficie (header/shell/logins podrían servir `logo-dark-192.png` y pasar). |
| B7 | OBSERVATION | `brand-integration-contract.md` declarado actualizado sin contener la extensión (mismo defecto que R3-1). |

---

## Ronda 4 (revisión 4 de los artefactos)

Correcciones aplicadas a partir de la ronda 3: token de autorización **opt-in** en el CR
(`AUTHORIZED_DERIVATIVES: <id>`, inexistente mientras el CR siga `DRAFT`); formato de
`derivatives[].file` = nombre sin ruta con normalización del `src`; **binding superficie→rol**
esperado en los cinco nodos; **sustitución** de la aserción de `verify-ui-foundation.mjs`; suma de
peso sobre los **dos derivados distintos** con expectativa por medición real y techo holgado;
grep de ausencia de `loading`/`lazy` (I9); extensión de `brand-integration-contract.md`
incorporada como **PROPUESTA**; precisión de los atributos HTML por superficie; y reescritura de
las entradas de CONVENTIONS/BACKLOG al retirar `DRAFT`.

### Resultado de la ronda 4

**Gate 1 — requirements_reviewer: NEEDS_CHANGES** (sin BLOCKER ni MAJOR). R3-1 **RESOLVED**
(la extensión del contrato está incorporada como PROPUESTA y es coherente en CR-009 y EL-TK-243);
R3-2 **RESOLVED** (token opt-in documentado y reescritura de registros declarada); observaciones de
ronda 3 atendidas. Quedaron:

| ID | Severidad | Hallazgo de la ronda 4 |
|---|---|---|
| R4-1 | MINOR | CONVENTIONS.md:93 y BACKLOG.md:424 conservaban «rondas 1-2 / revisión 3 pendiente». |
| R4-2 | MINOR | La columna «Cota de máquina» de CR-009 usaba `216 ≤ w,h ≤ 512` / `192 ≤ w,h ≤ 512`, notación ambigua (intersección no explícita). |
| R4-3 | OBSERVATION | Unidades mezcladas KB/KiB («280 KB», bandas de estimación) frente al cap en KiB. |
| R4-4 | OBSERVATION | Placeholder pendiente de la ronda 4 en el propio registro de dictámenes. |

**Gate técnico — architect: NEEDS_CHANGES** (sin BLOCKER; un MAJOR previo B1 **RESOLVED**). B1
**RESOLVED** (el contrato exige sustituir la aserción de `verify-ui-foundation.mjs`); B2/B3
**RESOLVED** (token opt-in inequívoco y no satisfacible por CR-006); B4 **RESOLVED** (suma sobre los
dos derivados distintos, expectativa por medición real); B5/B6 **RESOLVED** (`file` y normalización
definidos; rol atado por superficie); B7 **RESOLVED** (extensión incorporada). I1/I2/I3/I5/I7/I8
**YES**; I4 **PARTIAL** (declarativo + visual). Quedaron:

| ID | Severidad | Hallazgo de la ronda 4 |
|---|---|---|
| B8 | MINOR | La notación de la cota admitía lectura `h ≥ 216`; convenía `w ≥ rol ∧ w ≤ 512 ∧ h ≤ 512`. |
| B9 | MINOR | I6 sólo cubría la igualdad normalizada; faltaba **aserción negativa** sobre el `src` crudo (no empezar por `/` ni contener `./`) en los cinco nodos. |
| B10 | MINOR | Debía precisarse que `verify-ui-foundation.mjs` sólo conmuta a `.html` para el wordmark, conservando la lectura del `.ts` para `styleUrl`/SCSS. |
| B11 | OBSERVATION | El contrato debía fijar el **formato exacto del token** y el **paso/rol** que lo emite en `CHANGE_READY`. |
| B12 | OBSERVATION | La referencia «AC #2» en EL-TK-243 no era resoluble contra el articulado. |
| B13 | OBSERVATION | Cohesión de la asignación del grep I9 entre los dos verificadores. |

---

## Ronda 5 (revisión 4-final de los artefactos)

Correcciones aplicadas a partir de la ronda 4: cota reescrita como `w ≥ rol ∧ w ≤ 512 ∧ h ≤ 512`;
**aserción negativa I6** sobre el `src` crudo añadida a CR-009 y a EL-TK-243; reparto explícito de
responsabilidades entre `verify-branding-assets.mjs` (auditoría de los cinco nodos + I9) y
`verify-ui-foundation.mjs` (wordmark del shell contra el derivado, leyendo el `.html`, conservando
`alt`/`brand-fallback-text` y la lectura del `.ts` para `styleUrl`/SCSS); formato exacto del token
`AUTHORIZED_DERIVATIVES: <authorizedBy>` y responsable de emitirlo fijados en el contrato; sustituida
la referencia «AC #2» por la cita explícita del criterio; unidades unificadas a KiB; registros
CONVENTIONS/BACKLOG actualizados a rondas 1-4.

### Resultado de la ronda 5

**Gate 1 — requirements_reviewer: NEEDS_CHANGES** (sin BLOCKER ni MAJOR). R4-1 **RESOLVED**,
R4-2 **RESOLVED**, R4-4 **RESOLVED**; R4-3 **PARTIAL** (la unificación a KiB se aplicó en CR-009
pero no en EL-TK-243). Quedaron:

| ID | Severidad | Hallazgo de la ronda 5 |
|---|---|---|
| R5-1 | MINOR | EL-TK-243:292-293 conservaba «280 KB / 698 KB / 924 KB» (y «280 KB» era incorrecto en ambos convenios), frente a KiB en el resto del ticket y en CR-009. |
| R5-2 | MINOR | El «Próximo paso» del registro del hallazgo seguía en «Rondas 1-3», ignorando la ronda 4 (repetición del defecto señalado en la ronda 3). |
| R5-3 | OBSERVATION | Las cabeceras de estado decían «revisión 4» mientras el cuerpo y el registro usaban «revisión 4-final». |
| R5-4 | OBSERVATION | Placeholder de la ronda 5 en el propio registro. |

**Gate técnico — architect: NEEDS_CHANGES** (1 MAJOR). B8/B9/B10/B12/B13 **RESOLVED**; B11
**PARTIAL**. I1/I2/I3/I5/I6/I7/I8/I9 **YES**; I4 **PARTIAL** (declarativo + visual). Quedaron:

| ID | Severidad | Hallazgo de la ronda 5 |
|---|---|---|
| B14 | MAJOR | CR-009:92 contenía el literal `AUTHORIZED_DERIVATIVES: CR-009` como ejemplo → el opt-in se auto-satisfacía con el CR en `DRAFT`, contradiciendo su propia afirmación de mención partida; el control de autorización quedaba inoperante. |
| B15 | OBSERVATION | Dominio de `derivatives[].role` sin fijar explícitamente ({`primary`,`dark`}) frente a los rótulos `logo-primary`/`logo-dark` de la tabla. |
| B16 | OBSERVATION | El contrato omitía la precisión de B10 (la lectura del `.ts` se conserva para `styleUrl`/SCSS). |
| B17 | OBSERVATION | Placeholder de la ronda 5 en el registro. |

---

## Ronda 6 (revisión 4-final de los artefactos)

Correcciones aplicadas a partir de la ronda 5: token en **forma endurecida** (línea única
sin backticks/viñetas + `CHANGE_READY` en el mismo archivo) y retirada de todo literal del propio id
en CR-009 y el contrato; dominio `derivatives[].role ∈ {primary, dark}` fijado en CR-009 y el
contrato; contrato completado con la conservación de la lectura del `.ts` para `styleUrl`/SCSS;
unidades unificadas a KiB en EL-TK-243; nomenclatura «revisión 4-final» homogeneizada; y registros
CONVENTIONS/BACKLOG actualizados a rondas 1-5.

### Resultado de la ronda 6

**Gate 1 — requirements_reviewer: NEEDS_CHANGES** (sin BLOCKER ni MAJOR). R5-1/R5-2/R5-3/R5-4
**RESOLVED**, pero el defecto de clase R5-2 no se había propagado. Quedaron:

| ID | Severidad | Hallazgo de la ronda 6 |
|---|---|---|
| R6-1 | MINOR | CR-009:15 seguía en «Rondas 1-4 … NEEDS_CHANGES en todas» sin incorporar la ronda 5 ni sus correcciones (token endurecido, dominio de `role`, retención del `.ts`), contradiciendo gates.md y CONVENTIONS/BACKLOG (rondas 1-5). |
| R6-2 | MINOR | EL-TK-243:6 y :327 seguían en «rondas 1-4». |
| R6-3 | OBSERVATION | «≈1,20 MB» (CR-009:33, EL-TK-243:50, finding:68) no corresponde ni a MB decimal (1,22) ni a MiB (1,17), con el valor exacto al lado. |
| R6-4 | OBSERVATION | Marcador de la ronda 6 en el registro (misma clase que B17). |

**Gate técnico — architect: APPROVED.** B14 **RESOLVED** (el literal `AUTHORIZED_DERIVATIVES: CR-009`
desapareció y el token se define en forma endurecida: línea única + `CHANGE_READY`), B15 **RESOLVED**
(`role ∈ {primary, dark}`), B16 **RESOLVED** (retención del `.ts` para `styleUrl`/SCSS), B17
**RESOLVED**. I1/I2/I3/I5/I6/I7/I8/I9 **YES**; I4 **PARTIAL** por diseño (declarativo + visual).
`baseline_impact: NONE` (la extensión ya está incorporada como PROPUESTA); `critical_review: NO`.
Observaciones no bloqueantes: (B18) el co-requisito de estado sólo exige declarar `CHANGE_READY`, sin
forma endurecida anti-`DRAFT` — mitigado porque el token endurecido no existe en `DRAFT`—; (B19) el
marcador de la ronda 6.

---

## Ronda 7 (cierre del Gate 1, revisión 4-final)

Correcciones aplicadas a partir de la ronda 6: recuento de rondas actualizado a 1-5 con la ronda 5
incorporada a la enumeración de correcciones (CR-009) y a la cabecera y al bloque de gates
(EL-TK-243); peso del set expresado como ≈1,17 MiB; registros del hallazgo y de dictámenes alineados.
La ronda 6 no introdujo cambios en el contenido técnico (sólo registro, unidades y nomenclatura), por
lo que el dictamen **APPROVED** del gate técnico (ronda 6) se mantiene vigente.

### Resultado de la ronda 7

**Gate 1 — requirements_reviewer: APPROVED.** R6-1/R6-2/R6-3/R6-4 **RESOLVED**. Sin BLOCKER,
MAJOR ni MINOR. Dos OBSERVATION no bloqueantes: (a) CONVENTIONS.md:93 reformula de forma ambigua la
retención de la lectura del `.ts`; (b) magnitud duplicada en el registro del hallazgo (:70).
`UI_REQUIRED: NO`; `REQUIREMENTS_READY: YES`.

**Gate técnico — architect: APPROVED** (ronda 6, vigente: las rondas 6-7 no alteraron contenido
técnico). `baseline_impact: NONE`; `critical_review: NO`.

### Cierre de gates

Ambos gates quedan **favorables** para la **revisión 4-final**. **Paso documental de cierre ejecutado
el 2026-10-14 con autorización del owner:** (1) CR-009 pasa a `CHANGE_READY` y emite la línea única
del token (`AUTHORIZED_DERIVATIVES: CR-009`); (2) CONVENTIONS/BACKLOG pasan de `DRAFT` a
`CHANGE_READY` y el CR queda registrado en CHANGELOG; (3) la sección del contrato de marca se
promueve de PROPUESTA a vigente; (4) EL-TK-243 pasa a `READY` (`REQUIREMENTS_READY: YES`,
`READY_FOR_IMPLEMENTATION: YES`); y (5) se saldan las dos OBSERVATION de la ronda 7 (redacción de
CONVENTIONS:93 y magnitud duplicada en el registro del hallazgo).

**Decisiones del owner (2026-10-14):** (a) **CONFIRMED** — la reparación de los dos verificadores se
mantiene **dentro de EL-TK-243** (no se separa en ticket propio); (b) **autorizado** el paso
documental de cierre, ya ejecutado (CR-009 `CHANGE_READY`; EL-TK-243 `READY`).

**Nota posterior a los dictámenes (solo evidencia, sin cambio técnico):** el owner commiteó
`668392d` (refactor de `organizer-app-shell.component.html` / `organizer-account.component.html`,
con los artefactos de EL-TK-243 en su revisión previa). Se re-ejecutaron ambos verificadores en ese
HEAD y los fallos persisten idénticos, y los cinco nodos auditados siguen vigentes con `src`
relativos crudos. Las notas de re-verificación se añadieron al registro del hallazgo y a la sección
de problema de EL-TK-243 como evidencia aditiva, sin alterar el contenido técnico dictaminado.
