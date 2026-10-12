# EL-TK-091 — Renovar una transferencia temporal para un fallo de red elegible

## Parent epic
EL-EP-005

## Status
DONE

## User story
**Como** invitado con una carga interrumpida, **quiero** reintentar ese archivo sin duplicar su reserva, **para** recuperarme de fallos temporales de red sin perder el resto del lote.

## Alcance funcional
Permitir renovar la autorización temporal de transferencia de un UploadAttempt elegible y reintentar por archivo, manteniendo la misma reserva cuando sigue vigente.

## Fuera de alcance
Prometer resume universal después de cerrar navegador, reintentar archivos ya rechazados por regla de negocio o crear reservas duplicadas.

## Criterios de aceptación
### Escenario 1
**Dado** un fallo temporal y un intento aún vigente, **cuando** el invitado reintenta, **entonces** obtiene una nueva autorización temporal sin duplicar reserva.

### Escenario 2
**Dado** un intento cancelado, expirado o sin permiso vigente, **cuando** solicita retry, **entonces** se rechaza y no se renueva capacidad.

### Escenario 3
**Dado** un lote con un archivo fallido, **cuando** ese archivo reintenta, **entonces** los demás archivos conservan su progreso/resultado.

## Reglas de negocio
Retry es por archivo y solo para fallos elegibles. No se promete continuidad técnica universal del mismo stream/partes.

## Validaciones y permisos
Policy vigente, intento vigente y error retryable.

## Casos de error y estados vacíos
Offline persistente, URL vencida, sesión revocada, quota ya no autorizable por causa distinta a una reserva válida.

## Datos / contratos afectados
UploadAttempt retry state, retryCount cuando aplique, renewedUploadGrant.

## Dependencias técnicas y funcionales
Intento/reserva de EL-TK-086 y autorización temporal de EL-TK-087.

## Dependencias de tickets
- **depends_on:** EL-TK-086, EL-TK-087.
- **blocks:** EL-TK-094, EL-TK-095.

## Pruebas requeridas
Retry temporal, intento cancelado, URL expirada, lote parcial y no duplicación de reserva.

## Observabilidad / auditoría
Métricas de retry por causa sanitizada; no URL ni payload.

## Prioridad / estimación
P0 / S

## Traceability
Q-009; DEC-063, DEC-080, DEC-085; EL-EP-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Evidencia de Implementación y Verificación — 2026-10-11
- **Implementación:**
  - `packages/event-management/src/upload-lifecycle.ts`: método `renewUploadGrant` permitiendo renovación de URL pre-firmada para fallos temporales de red sin invocar nuevamente `reserveCapacity` (reserva única preservada).
  - Verificación de permisos y estado: rechaza intentos cancelados, expirados o de sesiones revocadas.
- **Verificación:**
  - `packages/event-management/test/upload-lifecycle.unit.test.ts` (15/15 PASS).
  - `packages/event-management/test/upload-lifecycle.integration.test.ts` (7/7 PASS).
  - `packages/event-management/test/upload-e2e-flow.integration.test.ts` (4/4 PASS: verificación estricta de que la reserva solo se crea 1 vez y se preserva el resto del lote).

