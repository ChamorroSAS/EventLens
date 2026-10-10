# EL-TK-090 — Aceptar un original confirmado y transferirlo al pipeline asíncrono

## Parent epic
EL-EP-005

## Status
READY

## User story
**Como** sistema, **quiero** aceptar de forma atómica un original validado, **para** conservarlo y entregarlo una sola vez al procesamiento asíncrono.

## Alcance funcional
Convertir un intento validado en original aceptado, consolidar consumo comercial, liberar/consumir la reserva correspondiente y emitir el contrato que consume EL-TK-032 para encolar procesamiento.

## Fuera de alcance
Inspeccionar malware, transformar media, publicar el contenido o decidir moderación.

## Criterios de aceptación
### Escenario 1
**Dado** un intento confirmado y validado, **cuando** se acepta, **entonces** se crea una única media/original, se consolida el consumo y se entrega el hecho/contrato al pipeline.

### Escenario 2
**Dado** un replay de aceptación, **cuando** se procesa, **entonces** no duplica media, consumo, reserva ni job downstream.

### Escenario 3
**Dado** que la autorización dejó de ser válida antes de aceptar por una condición de DEC-085, **cuando** intenta finalizar, **entonces** no acepta el original usando permisos antiguos.

## Reglas de negocio
Original confirmado se preserva; una reserva no vence permisos. El procesamiento posterior pertenece a EL-EP-006.

## Validaciones y permisos
Revalidar policy vigente antes del commit de aceptación.

## Casos de error y estados vacíos
Conflicto concurrente, intento cancelado, reserva inconsistente o fallo al publicar el contrato downstream deben quedar recuperables sin doble aceptación.

## Datos / contratos afectados
Media original, UploadAttempt, quota consumption/reservation, contrato de carga aceptada consumido por EL-TK-032.

## Dependencias técnicas y funcionales
Validación de EL-TK-089 y contrato downstream de EL-TK-032.

## Dependencias de tickets
- **depends_on:** EL-TK-089.
- **blocks:** EL-TK-092, EL-TK-094, EL-TK-095.

## Pruebas requeridas
Aceptación, replay, concurrencia, revocación en carrera, consistencia reserva/consumo y publicación downstream.

## Observabilidad / auditoría
Auditar aceptación y referencia de media sin exponer object keys sensibles innecesariamente.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-011; DEC-009, DEC-011, DEC-063, DEC-080, DEC-085; EL-EP-005, EL-EP-006, EL-TK-032.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el comando atómico de aceptación de original y consolidación de cuota, emitiendo el contrato downstream consumido por el handler transaccional ya implementado en EL-TK-032 (DONE) para encolar el procesamiento en JobQueue PostgreSQL.
