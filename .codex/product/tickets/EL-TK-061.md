# EL-TK-061 — Evaluar inspección y rendiciones con corpus móvil mediante spike

## Type

SPIKE

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** equipo técnico, **quiero** evaluar inspección y rendiciones con un corpus móvil permitido, **para** recomendar tools/configuraciones compatibles sin implementar adapters productivos.

## Objetivo y fronteras

TB-01 spike de inspección/tools/rendiciones/compatibilidad, posterior a060 PASS y entorno mínimo059 real. No adapters productivos033/035/036, servicio SaaS, tickets por formato ni evidencia estadística Beta058. Un prototipo/harness experimental permitido se ejecutará sólo en etapa posterior autorizada.

## Corpus y casos de prueba

Manifest único versionado de corpus permitido con checksums/provenance/MIME esperado y real/metadata/outcome/versiones runtime; inputs read-only, sin secretos ni medios privados en repo. JPEG/JPG es un formato, más PNG/WebP/HEIC/HEIF; MP4/MOV/WebM con streams/codecs representativos. Incluir válidos/inválidos/corruptos/truncados, orientación/audio/sin audio/GPS-metadata y excesos de recursos/tamaño/duración frente a límites efectivos aprobados, incluido máximo video5min. No cifras ni formatos nuevos.

**Dado**060 PASS explícito y059 capacidades disponibles, **cuando** ensaya corpus, **entonces** inspector distingue formato real/safety y derivados thumbnail/preview orientados/reproducibles con audio pertinente; original byte-identical antes/después y metadata derivada mínima sin GPS innecesario. Inseguro no se promueve. Playback se prueba en matriz existente Safari iPhone/iPad, Chrome Android y desktop aprobados, sin ampliar política de browsers.

## FAULT_INJECTION

Entradas corruptas, interrupción de transformación/IO, pérdida de autorización y resultados parciales; reutiliza mecanismos de TB-02. La evidencia vincula fault/timeline/ref/resultado al caso del manifest y demuestra original inalterado, parciales no promovidos y output de ejecución obsoleta denegado. Es harness experimental, sin ampliar implementación productiva.

## Evidencia y resultados

Registra manifest/outcomes por formato/caso, tools/inspector/runtime/versiones/config/rendiciones, reproducción física/reproducible y limitaciones. PASS requiere cobertura de formatos aprobados, playback utilizable/seguro, original inalterado y evidencia adecuada; FAIL si formato faltante, inseguro, irreproducible o evidencia insuficiente. Entrega recomendación mínima a architect; adopción técnica sigue evaluación pendiente, no elección de producción automática por experimento.

Smoke de compatibilidad no certifica estadísticas:058 conserva foto≥98%/video≥95%, mediana15s/2min y p95 60s/5min desde aceptación completa hasta preview con cola incluida, muestra reproducible explícita sin mínimo inventado.061 no declara esos objetivos cumplidos.

READY_FOR_IMPLEMENTATION recomendado: NO hasta060 PASS explícito y059 entorno real. EXPERIMENT_EXECUTION: NOT_RUN. EXPERIMENT_RESULT: PENDING.060 FAIL completado no desbloquea este ticket.

## Dependencias de tickets

- **depends_on:** EL-TK-059, EL-TK-060.
- **blocks:** EL-TK-056 sólo tras PASS y evaluación del handoff técnico.
- **can_parallelize_with:** preparación contractual independiente de owners existentes; ejecución de spikes respeta secuencia y resultados.

## Prioridad / estimación

P0 / M

## Traceability

Enabler compartido con EL-EP-002 por contrato, sin nueva épica. TB-01 ratificado; [Fuente del paquete](../sessions/2026-10-08-technical-blockers-approved-contracts.md); technical-baseline EL-TD-001..007; ARCH-005/006; media-and-jobs-architecture/testing-strategy/operations-and-recovery pertinentes.

## Definition of Ready

- [x] Objetivo/alcance/criterios/evidencia/salida experimentales conocidos
- [x] Permisos/dependencias/fallos y fases delimitados
- [x] Sin pregunta funcional nueva
- [x] Quality gate requirements_reviewer del paquete APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). NO ejecución hasta060 PASS explícito verificado y059 real;060 concluido FAIL no desbloquea061. Resultado NOT_RUN/PENDING.

## Recursos físicos confirmados — 2026-10-08

**CONFIRMED — usuario:** iPhone 14 Pro con Safari/Chrome iOS y Redmi A5 con Chrome Android están disponibles. Safari/Chrome iOS comparten WebKit; Android aporta Chromium/Blink. [Inventario y límites de evidencia](../sessions/2026-10-08-physical-validation-resources.md).

Gap de disponibilidad física iOS/Android: RESOLVED. Corpus completo/versionado, ejecución, evidencia y casos no producibles directamente siguen pendientes. Cada formato/caso requiere resultado registrado; disponibilidad no equivale a validación. DevTools responsive/Safari Responsive Design Mode sólo apoyan layout, sin sustituir playback físico ni codecs. EXPERIMENT_EXECUTION: NOT_RUN. EXPERIMENT_RESULT: PENDING.


## Reevaluación de ejecución — 2026-10-08

**CONFIRMED:** EL-TK-059 está DONE y EL-TK-060 terminó con PASS verificado (20/20 comprobaciones). Las condiciones previas referidas a esos tickets están satisfechas; sus notas NO/NOT_RUN/PENDING anteriores son históricas respecto de esa dependencia, no una falta de evidencia de aislamiento actual.

**PENDING — bloqueo de recurso:** `infra/spikes/corpus/manifest.json` sigue en `PENDING_FULL_CORPUS`, versión `0.0.0-preparation`, con `cases: []`. No hay archivos de corpus en esa carpeta. Falta localizar las muestras permitidas y preparar su manifest versionado con procedencia y checksums antes de inspección/rendiciones.

PREPARATORY_SCOPE_READY:
- Especificar registro de casos, procedencia, checksums y evidencia; delimitar harness y pruebas físicas sin afirmar compatibilidad.

BLOCKED_SCOPE:
- Ejecución de inspección, transformación y fault injection ligados a casos reales del corpus.
- Dictamen completo de compatibilidad con evidencia de playback por caso en los dispositivos confirmados.

BLOCKED_BY:
- Corpus permitido aún no disponible/versionado; se solicitó su ruta local al usuario.
- Coordinación de las pruebas manuales físicas y su evidencia pendiente; disponibilidad de iPhone 14 Pro y Redmi A5 ya confirmada, sin reabrir ese gap.

REQUIREMENTS_READY: YES.
READY_FOR_IMPLEMENTATION: NO para la ejecución completa mientras falta el corpus.
EXPERIMENT_EXECUTION: NOT_RUN.
EXPERIMENT_RESULT: PENDING.

Análisis detenido ante el bloqueo de recurso. No se instalaron herramientas ni se ejecutaron transformaciones; tampoco se adoptaron herramientas productivas ni se marcaron gates PASS. [Handoff de análisis](../sessions/2026-10-08-el-tk-061-analysis.md).
## Preparación autorizada del spike — 2026-10-08

La autorización posterior habilitó preparar el harness y una smoke controlada. Este addendum sustituye únicamente el bloqueo de preparación por falta de ruta/muestras descrito en el análisis anterior; el análisis se conserva como historial. **No cambia el resultado ni el estado global del spike.**

**CONFIRMED — preparación disponible:** manifest versionado en `infra/spikes/corpus/manifest.json`; carpetas para originales neutros del usuario en `infra/spikes/corpus/physical/ios/` y `infra/spikes/corpus/physical/android/`; generador de fixtures controlados, identificación/registro, ejecución Docker aislada por archivo, reporte de evidencia y validador de resultados físicos. Ningún original del usuario estaba presente o fue leído durante la preparación. Las instrucciones operativas y la matriz exacta están en [README de EL-TK-061](../../../infra/spikes/media-processing/README.md).

**CONFIRMED — smoke de fixtures, no compatibilidad:** la evidencia registra cinco fixtures controlados: tres derivados y dos rechazados, sin resultados inesperados. FFmpeg/ffprobe y libheif son candidatos experimentales de la imagen local, no herramientas adoptadas para producción. Los límites Docker observados pertenecen al presupuesto del laboratorio, no cambian límites funcionales del producto. Evidencia: [preparación](../../../infra/spikes/evidence/spike061-preparation.json) y [validación independiente](../../../infra/spikes/evidence/spike061-independent-validation.json).

**PREPARATORY_SCOPE_READY: YES.** Puede ejecutarse la preparación local, generarse el template y validarse su estructura. **BLOCKED_SCOPE:** corpus completo y versionado; inspección/fault injection representativa; resultados físicos reales; playback y compatibilidad por caso; evaluación técnica final. Las siete ranuras de originales de dispositivo continúan vacías: iOS HEIC, HEIF, JPEG, MOV y MP4; Android JPEG y MP4.

### Entrega de muestras y pruebas físicas

Colocar únicamente muestras originales, neutras y permitidas en:

- `infra/spikes/corpus/physical/ios/`
- `infra/spikes/corpus/physical/android/`

Después de registrar y ejecutar el corpus, completar `infra/spikes/.local/media-processing/physical-results-template.json` y guardarlo como `infra/spikes/.local/media-processing/physical-results.json`. Por cada fila, conservar identificadores y hashes; registrar versión de OS/navegador, fecha ISO-8601, estado `PASS`/`FAIL`/`BLOCKED` y notas del síntoma o bloqueo. La matriz requiere:

- iPhone 14 Pro / Safari iOS / WebKit;
- iPhone 14 Pro / Chrome iOS / WebKit (mismo motor);
- Redmi A5 / Chrome Android / Blink.

Evaluar selección real del archivo, orientación, thumbnail/preview, reproducción y seek de video, audio cuando aplique, controles táctiles y layout vertical/horizontal. No marcar playback como `PASS` si no se probó en el dispositivo. Ejecutar `powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action validate-results` y devolver el JSON completo junto con observaciones neutras por `caseId`; no incluir medios, datos privados, coordenadas ni secretos. Las filas sin muestra deben seguir `BLOCKED` con motivo, sin inventar fecha o versión.

Una plantilla física completa tampoco convierte por sí sola el resultado experimental en PASS: siguen pendientes los casos representativos, fault injection, límites, playback, evidencia global y dictamen técnico.

**READY_FOR_IMPLEMENTATION: NO** para el spike completo. **EXPERIMENT_EXECUTION: PREPARATION_SMOKE_ONLY**; **EXPERIMENT_RESULT: PENDING**; **PHYSICAL_COMPATIBILITY: NOT_RUN**; validation gates `NOT_EVALUATED`. No avanzar el consumidor downstream hasta PASS revisado.
## Corpus disponible y preparación de pruebas físicas — 2026-10-09

Este handoff actualiza el estado de preparación descrito arriba; los bloqueos de corpus vacío y siete slots ausentes corresponden a la ejecución anterior y se conservan como historial. No cambia el estado global `READY`, no completa el experimento ni declara compatibilidad física.

**CONFIRMED — smoke y corpus:** el run `470e6689-d6e4-47ec-b784-226c6f38d4a3` registró ocho originales neutros y cinco fixtures controlados (13 casos). Se obtuvieron 11 rendiciones `DERIVED` y dos rechazos esperados; los 27 derivados y los ocho originales coincidieron con sus hashes. Vitest: 13/13. El rechazo por falta de recursos del run anterior `df4d141a-8894-4937-b9ec-f05fe1a05b27` se debió a threads automáticos al procesar MOV; la ejecución actual usa un thread de codec manteniendo los mismos límites Docker. El arreglo es experimental, no una decisión de herramienta/configuración de producción. Evidencia: [validación del corpus](../../../infra/spikes/evidence/spike061-corpus-validation.json).

**PREPARATORY_SCOPE_READY: YES.** Se puede realizar la matriz física en la ejecución actual usando el [plan local de pruebas](../../../infra/spikes/.local/media-processing/physical-test-plan.md). La vista previa temporal de este run está en http://192.168.40.135:19061/ (misma Wi-Fi). Comprobar que muestra el run ID indicado en el plan antes de probar; la dirección pertenece al laboratorio temporal y puede dejar de estar activa.

**Matriz manual pendiente:** 48 filas, todas `NOT_RUN` (39 filas para los 13 casos disponibles y nueve para los tres slots faltantes). Los slots `IOS-HEIF`, `IOS-JPEG` e `IOS-MP4` deben registrarse `BLOCKED` con motivo; JPEG y MP4 sí tienen muestras Android, pero estas no cubren las variantes iOS. No se reabre el gap de disponibilidad de dispositivos. Completar el JSON de resultados de este run según el plan, sin cambiar IDs ni hashes, y validar con `powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action validate-results`. No regenerar el run mientras se está probando: cambiaría sus identificadores y hashes.

**Limitaciones y estado:** `EXPERIMENT_RESULT: PENDING`; `PHYSICAL_COMPATIBILITY: NOT_RUN`; la cobertura completa, los fault cases, metadata y el dictamen siguen pendientes. Los 80 outputs históricos del laboratorio se retienen en el directorio privado ignorado y no están permitidos por el allowlist del preview (404); no se borraron. Ocho run IDs antiguos no tienen snapshots completos, por lo que no se presentan como evidencia revalidada. Ningún validation gate está en PASS y no se adopta ninguna herramienta para producción. No avanzar el trabajo consumidor hasta que se entregue y revise la evidencia manual y el experimento completo.
## Resultados físicos reportados por el usuario — 2026-10-09

Este handoff actualiza el estado de la matriz del run `470e6689-d6e4-47ec-b784-226c6f38d4a3`; conserva como historial el estado inicial de 48 filas `NOT_RUN`. El reporte mantiene los IDs, nombres y hashes existentes y no recalculó hashes de medios.

**USER_REPORTED — casos derivados:** el usuario confirmó los 11 casos derivados en iPhone 14 Pro/Safari iOS, iPhone 14 Pro/Chrome iOS y Redmi A5/Chrome Android. Las 33 filas aplicables están registradas `PASS`, incluidos los checks de imagen y, para video, reproducción, audio y seek. La fecha reportada es aproximada (`2026-10-09T00:51:17-05:00`); OS/browser versions permanecen `UNKNOWN`.

**Confirmación y validación:** el usuario confirmó para los dos casos rechazados que aparece un mensaje de rechazo seguro y que no hay derivados. El reporte final registra `PASS` en las seis filas correspondientes; las nueve filas de `IOS-HEIF`, `IOS-JPEG` e `IOS-MP4` siguen `BLOCKED` por falta de muestra. Las 48 filas del reporte pasan la validación de estructura (`PHYSICAL_RESULTS_VALID: YES`). Versiones de OS/navegador permanecen `UNKNOWN`; no se inventaron. Reporte y evaluación locales: `infra/spikes/.local/media-processing/manual-user-report.json` y `infra/spikes/.local/media-processing/manual-evaluation.json`.

**Estado global:** `PHYSICAL_COMPATIBILITY: FAIL_OR_BLOCKED` por los nueve slots sin muestra; no se reportaron fallos en los 39 controles completados. `EXPERIMENT_RESULT: PENDING`; `AUTOMATED_COMPATIBILITY: PARTIAL`; `READY_FOR_ARCHITECT_DECISION: NO`. Quedan pendientes los slots faltantes y la evidencia restante del spike completo (metadata, límites, codecs/casos faltantes y fault injection). Ningún validation gate se marca PASS y no se adopta tecnología para producción.
## Revisión arquitectónica de los nueve slots históricos — 2026-10-09

La revisión de cobertura de architect determina que los nueve registros `BLOCKED` son placeholders históricos por fuentes ausentes, no fallos de pruebas. Bajo el alcance y evidencia actuales: `ACTIVE_PHYSICAL_BLOCKERS_FROM_REVIEWED_SLOTS: 0`; `NEW_PHYSICAL_SAMPLES_REQUIRED: 0`. No se añadió ninguna fila PASS, no se alteraron corpus, manifiestos, reporte, hashes ni resultados originales. El estado histórico de validación `FAIL_OR_BLOCKED` y `EXPERIMENT_RESULT: PENDING` se mantienen; la revisión no marca compatibilidad completa ni gates PASS. Evidencia: [revisión arquitectónica de cobertura](../../../infra/spikes/evidence/spike061-physical-coverage-review.json).

Interpretación por familia/capacidad: HEIC físico aporta muestra de imagen HEVC en la familia HEIF; no demuestra todos los perfiles HEIF. La identificación genérica `mif1`/`msf1`, perfiles representativos justificados y entradas malformadas siguen como pruebas automatizadas. Las muestras JPEG Android ya cubren selección, orientación y visualización real en los tres navegadores; una captura JPEG del iPhone sería opcional salvo que aparezca una variante material distinta. Las dos muestras MP4 Android cubren selección, reproducción, audio y seek en iPhone Safari/Chrome y Chrome Android. El origen MOV de la cámara iPhone no se renombra ni convierte para simular MP4; el ajuste “Most Compatible” cambia el codec a H.264, pero no garantiza contenedor MP4.

Continúan como trabajo automatizado del spike: metadata/GPS y minimización, casos sin audio, truncamiento/malformados adicionales, límites aprobados, combinaciones representativas de codecs/contenedores y fault injection. HEIC no se presenta como prueba de todo HEIF. Si más adelante se incorporan rendiciones materialmente distintas, se evaluará playback focalizado; no se exige repetir en bloque las nueve filas históricas. `READY_FOR_ARCHITECT_DECISION: NO_FOR_TOOL_ADOPTION`; no cambian formatos aprobados, arquitectura, proveedores ni decisiones de producción.
## Cierre del spike automatizado — 2026-10-09

**EL-TK-061: DONE.** `EXPERIMENT_RESULT: PASS` para el alcance `BOUNDED_REPRESENTATIVE_LOCAL_SPIKE`, con tester `PASS_WITH_WARNINGS` y reviewer `APPROVED_NO_ACTIONABLE_FINDINGS`. La evidencia final está en [resultado](../../../infra/spikes/evidence/spike061-result.json), [validación automatizada](../../../infra/spikes/evidence/spike061-automated-validation.json), [casos supplementales](../../../infra/spikes/evidence/spike061-automated-supplemental.json) e [integración PostgreSQL/MinIO](../../../infra/spikes/evidence/spike061-supplemental-integration.json).

La validación incluye 17/17 Vitest; 26/26 casos base y 6/6 transformaciones límite aceptadas (32 en total; los cuatro negativos revalidados son un subconjunto, no casos únicos nuevos); 3/3 fallos inyectados de IO/cancelación/timeout; y 9/9 comprobaciones reales PostgreSQL/MinIO en la evidencia de integración existente. Los 26 inputs y 41 outputs verificados conservaron hashes coincidentes. La medición adicional revalidó límites de tamaño foto 25 MB y video 500 MB por debajo/en el límite/por encima, duración 300 s y el presupuesto de 40 MP; algunas comprobaciones fueron solo inspección. No equivale a rendimiento de Beta ni certifica transformar todos los medios hasta 40 MP/500 MB bajo 512 MiB.

`AUTOMATED_COMPATIBILITY: PASS_FOR_BOUNDED_SPIKE_SCOPE`; `PHYSICAL_COMPATIBILITY: PASS_FOR_APPROVED_COVERAGE`. La cobertura física aprobada tiene 39 PASS, 0 FAIL y 0 bloqueos activos; nueve filas `BLOCKED` permanecen como historial en el reporte original. El validador/reportes canónicos conservan su resultado bruto `FAIL_OR_BLOCKED`, sin editar ni inventar PASS; la interpretación conjunta usa la [revisión de cobertura aprobada](../../../infra/spikes/evidence/spike061-physical-coverage-review.json). Versiones de navegador/SO siguen `UNKNOWN`; no se agrega otra afirmación física. Ningún gate `MEDIA-001`, `CAP-001`, `DR-001` o `EXPORT-001` está evaluado/PASS.

**HISTÓRICO — recomendación al cierre, posteriormente adoptada por ARCH-015:** FFmpeg/ffprobe `8.0.1-r1`; libheif `1.23.0-r0`, libde265 `1.0.16-r0` y x265 `4.1-r0`, con un thread de decoder/filter/encoder y threads de codec/tile libheif en 1. Rendiciones candidatas: thumbnail JPEG máx. 320 px y preview JPEG máx. 960 px, ambas sin upscale; video MP4 H.264/yuv420p, AAC si el original trae audio, sin pista cuando no la trae, `faststart` y ancho máx. 960 px. `READY_FOR_ARCHITECT_DECISION: YES` significa que la recomendación puede evaluarse; la adopción sigue pendiente. Este cierre no cambia formatos, arquitectura ni proveedores, y no desbloquea automáticamente EL-TK-056.

Limitaciones: HEIF se evaluó con ejemplos representativos HEVC de 8/10 bits y marca genérica `mif1`, no todos los codecs/perfiles, plugins o semánticas de secuencia. Se comprobó presencia de tags GPS EXIF y omisión del dato en derivados, sin decodificar ni registrar coordenadas; no hubo un caso XMP poblado. Cinco variantes de video sin audio preservaron la ausencia de pista. La matriz, reportes, hashes y corpus físicos permanecen sin cambios. Los intentos previos y la primera clasificación fallida se conservan como historial privado; no fueron sobreescritos por esta validación focal.

## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. DONE/PASS automatizado y físico. Recomendación histórica adoptada porARCH-015; no decisión pendiente de tooling/targets/runtime.39PASS/0FAIL/0bloqueos físicos activos, hashes/corpus intactos. No certifica adapters productivos/throughput/metadata universal ni gates.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
