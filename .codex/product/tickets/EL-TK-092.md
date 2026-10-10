# EL-TK-092 — Cancelar intentos no confirmados y liberar sus reservas

## Parent epic
EL-EP-005

## Status
READY

## User story
**Como** sistema, **quiero** cancelar intentos no confirmados cuando dejan de estar autorizados o vencen, **para** impedir confirmaciones tardías y recuperar capacidad reservada.

## Alcance funcional
Cancelar UploadAttempts no confirmados por desactivación de uploads, cierre/suspensión/vencimiento del evento, revocación de acceso o expiración; liberar reservas y solicitar limpieza segura del objeto provisional cuando exista.

## Fuera de alcance
Eliminar originales ya confirmados, interrumpir universalmente IO externo en curso o purgar media aceptada.

## Criterios de aceptación
### Escenario 1
**Dado** un intento no confirmado, **cuando** ocurre una condición de DEC-085, **entonces** pasa a cancelado y no puede confirmarse posteriormente.

### Escenario 2
**Dado** una reserva de un intento cancelado o vencido, **cuando** se reconcilia, **entonces** se libera exactamente una vez.

### Escenario 3
**Dado** un original ya aceptado antes del cambio, **cuando** ocurre la misma condición, **entonces** no se elimina por esta cancelación.

## Reglas de negocio
La revocación afecta nuevas autorizaciones y confirmaciones; no promete revocar bytes ya transferidos fuera de control de la app.

## Validaciones y permisos
Acción de sistema/policy; idempotente y segura ante carreras con confirmación.

## Casos de error y estados vacíos
Carrera confirmar/cancelar, cleanup de storage fallido, reserva ya liberada y objeto provisional ausente.

## Datos / contratos afectados
UploadAttempt cancellation, reservation release, ObjectStorage.abortUpload/delete cuando aplique.

## Dependencias técnicas y funcionales
Intentos de EL-TK-086, confirmación de EL-TK-088 y policy de EL-EP-003/004.

## Dependencias de tickets
- **depends_on:** EL-TK-086, EL-TK-088, EL-TK-072, EL-TK-075.
- **blocks:** EL-TK-094, EL-TK-095.

## Pruebas requeridas
Todas las causas DEC-085, carreras, liberación única, cleanup fallido y original ya confirmado.

## Observabilidad / auditoría
Registrar causa de cancelación y resultado de cleanup sin secretos.

## Prioridad / estimación
P0 / M

## Traceability
Q-009, Q-011; DEC-080, DEC-083, DEC-085; EL-EP-005, EL-EP-003, EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el reconciliador de cancelación por policy (DEC-085) que cancela intentos pendientes, libera reservas atómicamente y preserva intactos los originales confirmados previamente.
