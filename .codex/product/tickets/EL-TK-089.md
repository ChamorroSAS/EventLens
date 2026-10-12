# EL-TK-089 — Validar restricciones reales del archivo antes de aceptar el original

## Parent epic
EL-EP-005

## Status
DONE

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

## Evidencia de Implementación y Verificación — 2026-10-11
- **Implementación:**
  - `packages/event-management/src/upload-media-validator.ts`: implementación segura sin parsers nativos inseguros ni ejecución de código arbitrario (ARCH-015). Inspecciona magic bytes para JPEG, PNG, WebP, HEIC/HEIF, MP4, QuickTime (MOV) y WebM leyendo los primeros 128 KB del archivo. Para video MP4/MOV, extrae la duración analizando de forma lineal y acotada los átomos ISO `moov` / `mvhd` sin ejecutar ffmpeg en el proceso de API.
  - Rechazo localizado por archivo: si un archivo falla por tamaño, duración (>300 s) o tipo no soportado, se marca como `REJECTED`, se registra la razón en PostgreSQL y se libera su reserva de capacidad (`CapacityReservationPort.releaseReservation`) sin afectar al resto del lote.
- **Verificación:**
  - `packages/event-management/test/upload-lifecycle.unit.test.ts` (15/15 PASS).
  - `packages/event-management/test/upload-lifecycle.integration.test.ts` (7/7 PASS).
  - `packages/event-management/test/upload-e2e-flow.integration.test.ts` (4/4 PASS).

