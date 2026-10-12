# EL-TK-093 — Consultar el estado de intentos y resultados de carga del lote

## Parent epic
EL-EP-005

## Status
DONE

## User story
**Como** invitado, **quiero** consultar el estado de cada archivo de mi lote, **para** distinguir qué fue recibido, qué requiere atención y qué sigue en progreso.

## Alcance funcional
Exponer un snapshot autorizado por sesión con estados de UploadAttempt y resultado de aceptación por archivo, sin mezclar estados de procesamiento multimedia posteriores como si fueran transferencia.

## Fuera de alcance
Galería, biblioteca del organizador, detalles internos de jobs o información de otras sesiones.

## Criterios de aceptación
### Escenario 1
**Dado** un lote con resultados mixtos, **cuando** se consulta, **entonces** devuelve cada archivo con estado autorizado y acciones/capacidades vigentes.

### Escenario 2
**Dado** una sesión distinta, **cuando** consulta el mismo evento, **entonces** no recibe intentos ni archivos ajenos.

### Escenario 3
**Dado** un archivo aceptado y enviado a procesamiento, **cuando** se consulta, **entonces** transferencia/recepción se distingue del procesamiento posterior.

## Reglas de negocio
100% de transferencia no prueba aceptación ni publicación. Estados públicos no exponen errores internos técnicos.

## Validaciones y permisos
Aislamiento por GuestSession y eventId.

## Casos de error y estados vacíos
Lote vacío, intento cancelado, resultado parcial, sesión revocada o consulta temporalmente indisponible.

## Datos / contratos afectados
UploadBatchSnapshot, UploadItemStatus, capabilities.

## Dependencias técnicas y funcionales
Estados producidos por EL-TK-086,088,089,090,092.

## Dependencias de tickets
- **depends_on:** EL-TK-086, EL-TK-088, EL-TK-089, EL-TK-090, EL-TK-092.
- **blocks:** EL-TK-094, EL-TK-095.

## Pruebas requeridas
Aislamiento, lote mixto, vacío, cancelación, accepted vs processing y sesión revocada.

## Observabilidad / auditoría
Consulta normal sin revelar secretos, object keys ni errores internos.

## Prioridad / estimación
P0 / S

## Traceability
Q-009; DEC-011, DEC-014, DEC-085; EL-EP-005, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Evidencia de Implementación y Verificación — 2026-10-11
- **Implementación:**
  - `packages/event-management/src/upload-lifecycle.ts`: método `getUploadBatchSnapshot` consultando los intentos vinculados estrictamente a la sesión (`guest_session_id`) y evento (`event_id`), aislando sesiones ajenas.
  - Distinción contractual estricta: computa `receivedCount`, `inProgressCount`, `actionRequiredCount`, `rejectedCount` y asigna `canRetry` sin confundir recepción con transcodificación o moderación.
- **Verificación:**
  - `packages/event-management/test/upload-lifecycle.unit.test.ts` (15/15 PASS).
  - `packages/event-management/test/upload-lifecycle.integration.test.ts` (7/7 PASS).
  - `packages/event-management/test/upload-e2e-flow.integration.test.ts` (4/4 PASS).

