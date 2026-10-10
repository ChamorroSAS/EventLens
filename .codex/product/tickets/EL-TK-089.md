# EL-TK-089 — Validar restricciones reales del archivo antes de aceptar el original

## Parent epic
EL-EP-005

## Status
READY

## User story
**Como** sistema, **quiero** validar el archivo transferido con sus datos reales, **para** impedir aceptar formatos, tamaños o duraciones fuera del contrato del evento.

## Alcance funcional
Validar tipo/formato, tamaño real y duración cuando aplique después de la transferencia; clasificar el resultado como aceptable o rechazado sin afectar otros archivos del lote.

## Fuera de alcance
MalwareInspection, transcodificación, derivados web, moderación o publicación.

## Criterios de aceptación
### Escenario 1
**Dado** una foto JPG/JPEG, PNG, HEIC/HEIF o WebP dentro del límite vigente, **cuando** se valida, **entonces** queda elegible para aceptación.

### Escenario 2
**Dado** un video MP4/MOV/WebM dentro de tamaño y duración vigentes, **cuando** se valida, **entonces** queda elegible para aceptación.

### Escenario 3
**Dado** un archivo cuyo tipo, tamaño o duración real excede el contrato, **cuando** se valida, **entonces** se rechaza solo ese archivo y los demás intentos del lote continúan.

## Reglas de negocio
Límites configurables; defaults MVP: fotos <=25 MB, videos <=500 MB y <=5 min. La duración puede conocerse después de transferir.

## Validaciones y permisos
Solo intentos confirmados y aún vigentes; no inferir extensión como prueba suficiente del tipo real.

## Casos de error y estados vacíos
Metadata ilegible, archivo dañado, duración no determinable o error temporal de lectura.

## Datos / contratos afectados
UploadValidationResult, detectedType, actualSize, duration, rejectionReason.

## Dependencias técnicas y funcionales
Confirmación real del objeto de EL-TK-088 y límites vigentes del plan.

## Dependencias de tickets
- **depends_on:** EL-TK-088, contrato EL-EP-011.
- **blocks:** EL-TK-090, EL-TK-092, EL-TK-094, EL-TK-095.

## Pruebas requeridas
Todos los formatos admitidos, límites exactos, duración excedida, archivo dañado, lote mixto y error temporal.

## Observabilidad / auditoría
Razones estables y sanitizadas; no exponer detalles internos del parser al invitado.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-009, Q-011; DEC-009, DEC-010, DEC-011; EL-EP-005, EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el validador de restricciones reales de archivo (formatos JPG/JPEG, PNG, HEIC/HEIF, WebP <=25 MB; MP4/MOV/WebM <=500 MB y <=5 min), aislando fallos por archivo sin cancelar el lote.
