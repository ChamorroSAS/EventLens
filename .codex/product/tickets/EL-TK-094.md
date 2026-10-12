# EL-TK-094 — Integrar selección, progreso y retry por archivo en la interfaz guest

## Parent epic
EL-EP-005

## Status
DONE

## User story
**Como** invitado desde móvil, **quiero** seleccionar varios archivos y ver progreso, errores y retry por archivo, **para** completar el lote aun cuando una transferencia falle.

## Alcance funcional
Integrar FilePicker, UploadSelectionSummary, UploadFileItem, UploadQueue, UploadProgressSummary, UploadRetryAction, FileThumbnail/FileTypeIcon y UsageLimitAlert usando los contratos backend de EL-EP-005.

## Fuera de alcance
Galería, procesamiento multimedia interno, botón de cancelación manual no aprobado o promesa de resume universal tras cerrar navegador.

## Criterios de aceptación
### Escenario 1
**Dado** una selección múltiple, **cuando** hay archivos inválidos conocidos localmente, **entonces** se señalan individualmente sin bloquear los elegibles.

### Escenario 2
**Dado** transferencias activas, **cuando** hay progreso medible, **entonces** se muestra por archivo y a nivel de lote sin afirmar aceptación prematura.

### Escenario 3
**Dado** un fallo retryable, **cuando** el usuario reintenta ese archivo, **entonces** los demás mantienen su estado.

### Escenario 4
**Dado** cierre/revocación/cancelación por policy, **cuando** el servidor actualiza capacidades, **entonces** los intentos no confirmados se muestran cancelados y los confirmados permanecen recibidos.

## Reglas de negocio
Sin selección, progreso, confirmación y procesamiento son estados distintos. El frontend consume capacidades del servidor.

## Validaciones y permisos
Validación local es ayuda UX; servidor conserva autoridad final.

## Casos de error y estados vacíos
Sin selección, offline, cuota llena, sesión vencida, error temporal, resultado parcial y archivo cancelado por policy.

## Datos / contratos afectados
Cliente OpenAPI de upload intents, transfer grants, batch snapshot y retry.

## Dependencias técnicas y funcionales
Handoff UI/UX de EL-EP-005.

## Dependencias de tickets
- **depends_on:** EL-TK-086, EL-TK-087, EL-TK-088, EL-TK-089, EL-TK-090, EL-TK-091, EL-TK-092, EL-TK-093.
- **blocks:** EL-TK-095 y consumidores UI downstream.

## Pruebas requeridas
Component/unit, lote mixto, progreso, retry, offline, cuota, cancelación por policy, teclado/foco y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin telemetría invasiva ni exposición de nombres/rutas locales más allá de la UI autorizada.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-009, Q-011; DEC-010, DEC-011, DEC-080, DEC-085; EL-EP-005; ui-mvp-epic-review.md#el-ep-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Evidencia de Implementación y Verificación — 2026-10-11
- **Implementación:**
  - `apps/web/src/app/upload/`:
    - `file-picker.component.ts`: selector nativo accesible `input[type="file"][multiple]` con soporte Drag & Drop y tap target >= 44x44px.
    - `upload-file-item.component.ts`: fila vertical móvil accesible con thumbnail/icono, tamaño formateado, barra de progreso medible durante transferencia (`aria-valuenow`), estado textual indeterminado durante confirmación/validación y botón de retry individual (`UploadRetryAction`).
    - `upload-progress-summary.component.ts`: progreso agregado del lote con copy contractual («X archivos recibidos; Y requieren atención», «100% de transferencia no prueba aceptación»).
    - `usage-limit-alert.component.ts`: alerta accesible `role="alert"` ante restricciones de cuota o cancelación por política.
    - `upload-container.component.ts`: contenedor orquestador que valida localmente archivos inválidos sin bloquear los elegibles, maneja reintentos por archivo y reconcilia cancelaciones preservando confirmados.
    - `upload.service.ts`: servicio Angular con validaciones locales y cómputo de resumen del lote.
- **Verificación:**
  - `apps/web/src/app/upload/upload-container.component.spec.ts` (5/5 PASS cubriendo Escenarios 1 a 4 y WCAG 2.2 AA).
  - Suite completa de `@eventlens/web` (6 archivos, 33/33 PASS).

