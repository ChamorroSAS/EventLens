# EL-TK-061 — preparación experimental

No adapters productivos ni herramientas seleccionadas para producción. Candidato local FFmpeg/ffprobe y libheif; imagen y versiones exactas se capturan en evidencia. Fuente técnica: https://ffmpeg.org/ffprobe.html y https://github.com/strukturag/libheif.

Desde la raíz del proyecto, siempre Docker:

```powershell
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action build
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action generate
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action register
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action run
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action test
powershell -NoProfile -File infra/spikes/media-processing/Run.ps1 -Action serve
```

Preview de escritorio: http://127.0.0.1:19061. Para dispositivo físico en red local confiable, detener con Ctrl+C y ejecutar `-Action serve -BindAddress <IPv4 local exacta>`, abrir `http://<IPv4>:19061`. No se abre firewall automáticamente, no se crea túnel y nunca se aceptan bindings wildcard. El usuario controla esa exposición temporal y debe cerrarla al terminar. Solo derivados con hash validado están servidos; no originales ni upload endpoint.

Presupuesto experimental, no límites nuevos de producto: CPU1, RAM512MiB, PIDs64, scratch128MiB, tmp16MiB, subprocess30s, deadline exterior por intento120s, stdout2MiB, 40MP y8streams. Video máximo aprobado300s. Candidato sin red, no-root, filesystem readonly, cap_drop ALL, no-new-privileges; inputs readonly salvo generación controlada. Parser por caso sin acceso a /work: input individual readonly y scratch privado tmpfs; controlador separado exporta únicamente tres nombres permitidos y valida hashes/inventario antes del allowlist de preview. La salida privada no se promociona a producto. Fault injection y límites fueron validados solo para el alcance acotado documentado al final; esto no certifica throughput de Beta ni transformaciones en todos los tamaños/codecs.

## Matriz física y retorno

`run` genera `infra/spikes/.local/media-processing/physical-results-template.json`, una fila por caso (derivado, rechazo y slot sin muestra) y navegador:
1. iPhone14Pro / Safari iOS / WebKit.
2. iPhone14Pro / Chrome iOS / WebKit (mismo motor).
3. RedmiA5 / Chrome Android / Blink.

Copiar a `physical-results.json`; mantener runId, runManifestSha256, caseId, originalSha256, hashes de outputs y browser id sin cambios. Completar OS/browserVersion, testedAt ISO8601, notes, status PASS/FAIL/BLOCKED. No usar PASS sin cada comprobación pertinente. NOT_RUN significa no ejecutado, NOT_APPLICABLE se conserva solo cuando el template lo establece.

Por cada fila comprobar:
- selection: selector real de galería/archivos para el original (manual desde dispositivo; este preview no recibe originales ni simula uploads).
- orientation: flecha/texto correcto en thumbnail, preview y video.
- thumbnail/preview: imagen visible, sin deformación/error.
- playback: inicio/reproducción/final video; seek: avanzar/retroceder con controles.
- audio: audible/correcto cuando hay audio; no inventar resultado si silenciado.
- touch: controles táctiles utilizables; responsive: vertical/horizontal y sin overflow.

Upload real requiere integración posterior; no se afirma cubierto por este servidor. Casos rechazados usan checks safeError/noDerivatives, sin playback. Slots sin muestra incluyen sourceAvailable: marcar BLOCKED con motivo mientras falte el archivo. El selector local del preview no transmite el archivo: comprobar desde la galería del dispositivo; para fixtures controlados u originales del otro dispositivo, transferir previamente el archivo sin recomprimir. Upload real continúa pendiente. `-Action validate-results` rechaza reportes obsoletos, hashes distintos, filas faltantes, versiones ausentes o PASS parcial. Un reporte físico se interpreta junto con la revisión de cobertura y evidencia automatizada; no certifica por sí solo el experimento completo.

DevTools/Safari responsive mode solo layout. Devolver el JSON completo y observaciones/capturas neutras por caseId; no devolver medios privados, coordenadas ni secretos. Si algo no funciona marcar FAIL con pasos y síntoma; si no puede probarse marcar BLOCKED y motivo.

Cada archivo derivado exportado tiene presupuesto experimental de 16MiB. No cambia el l�mite aprobado del original (foto25MB/video500MB) ni certifica transformaci�n de todos los tama�os v�lidos. Si un derivado leg�timo supera este presupuesto, la preparaci�n se detiene: registrar BLOCKED por presupuesto del laboratorio, no clasificar el original como formato rechazado. Casos de video largos/tama�os grandes siguen pendientes del spike completo. Las filas MISSING pueden devolverse BLOCKED/sourceAvailable BLOCKED con motivo en notes, sin inventar versi�n/fecha de una prueba que no ocurri�.

Las rendiciones limitan ancho al menor entre fuente y objetivo experimental (320/960), conservan relaci�n de aspecto y dimensiones pares; no ampl�an artificialmente la imagen ni aumentan calidad perdida. El parser comprueba dimensiones reales del derivado frente a la fuente antes de permitir exportaci�n.

## Resultado final EL-TK-061

Ticket: `DONE`. `EXPERIMENT_RESULT: PASS` en el alcance `BOUNDED_REPRESENTATIVE_LOCAL_SPIKE`; tester `PASS_WITH_WARNINGS`, reviewer `APPROVED_NO_ACTIONABLE_FINDINGS`. Resumen: [resultado final](../evidence/spike061-result.json). Herramientas y rendiciones son **recomendaciones para evaluación de architect**, no adopción productiva.

Validación: 17/17 Vitest; 26/26 casos base y 6/6 transformaciones límite aceptadas (32 en total); 4/4 revalidaciones negativas son un subset de casos existentes, no casos nuevos; 3/3 fallos inyectados de IO/cancelación/timeout. La evidencia de integración existente registra 9/9 checks reales PostgreSQL/MinIO. Se verificaron hashes de 26 inputs y 41 outputs. Se inspeccionaron valores por debajo/en/por encima de foto 25 MB, video 500 MB, duración 300 s y presupuesto 40 MP; 40 MP fue solo inspección y los medios sintéticos de tamaño/duración no certifican throughput ni todos los codecs a 500 MB.

`PHYSICAL_COMPATIBILITY: PASS_FOR_APPROVED_COVERAGE`. La cobertura aprobada tiene 39 PASS, 0 FAIL, 0 bloqueos activos y 9 filas `BLOCKED` históricas. Los reportes y el validador raw `FAIL_OR_BLOCKED` permanecen intactos; se interpretan junto con la revisión aprobada de cobertura. Los nueve slots no exigen nuevas muestras por sí mismos. Versiones físicas de SO/navegadores permanecen `UNKNOWN`. Ningún gate `MEDIA-001`, `CAP-001`, `DR-001` o `EXPORT-001` se marcó PASS.

La evidencia incluye HEIF representativo HEVC 8/10-bit y `mif1`, no todos los perfiles/plugins. Se comprobaron tags GPS EXIF controlados y su omisión en derivados sin decodificar/registrar coordenadas; no hubo fuente XMP poblada. Cinco variantes de video sin audio mantuvieron la salida sin pista. Rendiciones recomendadas: thumbnail JPEG con ancho máx. 320 px y preview JPEG con ancho máx. 960 px, sin upscale; video MP4 H.264/yuv420p, AAC solo si hay audio de origen, `faststart`, ancho máx. 960 px. Versiones recomendadas: FFmpeg/ffprobe `8.0.1-r1`, libheif `1.23.0-r0`, libde265 `1.0.16-r0`, x265 `4.1-r0`; configuración de un thread para decoder/filter/encoder y threads de codec/tile libheif en 1. Ninguna se selecciona para producción mediante este PASS.

`READY_FOR_ARCHITECT_DECISION: YES` habilita evaluar estas recomendaciones; su adopción sigue pendiente. EL-TK-056 no se desbloquea automáticamente. El spike no certifica infraestructura productiva, seguridad universal, rendimiento Beta, transformación de todas las imágenes 40 MP/todos los videos de 500 MB ni todos los codecs/perfiles. Revisa [evidencia automática](../evidence/spike061-automated-validation.json), [casos suplementales](../evidence/spike061-automated-supplemental.json), [integración](../evidence/spike061-supplemental-integration.json) y [revisión de cobertura física](../evidence/spike061-physical-coverage-review.json).

## Ejecuciones suplementales aisladas

Estos son los comandos verificados para futuras ejecuciones supplementales separadas. El resultado de este ticket ya está registrado; para consultarlo, usa los artefactos de evidencia anteriores y no vuelvas a generar/registrar/ejecutar el corpus canónico.

`Supplemental.ps1 -Action fixtures` crea un dataset independiente en el espacio privado `infra/spikes/.local/media-processing/supplemental/` e imprime su ruta. Para un dataset existente bajo ese directorio:

```powershell
powershell -NoProfile -File infra/spikes/media-processing/Supplemental.ps1 -Action fixtures
powershell -NoProfile -File infra/spikes/media-processing/Supplemental.ps1 -Action execute -Dataset <ruta-del-dataset>
powershell -NoProfile -File infra/spikes/media-processing/Supplemental.ps1 -Action execute -Dataset <ruta-del-dataset> -TransformBoundary
powershell -NoProfile -File infra/spikes/media-processing/Supplemental.ps1 -Action execute -Dataset <ruta-del-dataset> -RevalidateNegative
powershell -NoProfile -File infra/spikes/media-processing/SupplementalFaults.ps1 -Dataset <ruta-del-dataset>
powershell -NoProfile -File infra/spikes/media-processing/supplemental-integration.ps1 -MediaDirectory <directorio-de-medios-privado> -BindingFile <binding-json>
```

Reemplaza `<ruta-del-dataset>` por la ruta impresa, dentro de `infra/spikes/.local/media-processing/supplemental/`; no copies el placeholder literalmente. `-TransformBoundary` y `-RevalidateNegative` son selecciones distintas. La integración exige que `MediaDirectory` esté dentro de `infra/spikes/.local/media-processing/` y que el binding contenga hashes válidos; escribe su estado temporal allí, usa el Compose local con el servicio PostgreSQL/MinIO existente y actualiza `infra/spikes/evidence/spike061-supplemental-integration.json`. Conserva la evidencia actual antes de cualquier rerun deliberado de integración. Estos scripts no regeneran el manifest ni los resultados físicos canónicos, pero sí crean/actualizan evidencia supplemental; no los ejecutes para reproducir el PASS ya cerrado.