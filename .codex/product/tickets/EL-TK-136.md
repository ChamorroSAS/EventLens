# EL-TK-136 — Reservar y liberar capacidad comercial de forma atómica

## Parent epic
EL-EP-011

## Status
DONE

## User story
**Como** sistema, **quiero** reservar bytes y cupos de archivo contra los límites efectivos, **para** evitar sobreasignación cuando varias cargas compiten cerca de la cuota.

## Alcance funcional
Implementar el contrato de reserva de capacidad consumido por EL-TK-086/092: reservar atómicamente, rechazar exceso, liberar cancelaciones y evitar doble liberación.

## Fuera de alcance
Autorizar sesión/upload, transferir bytes, confirmar original o definir TTL no aprobado.

## Criterios de aceptación
### Escenario 1
**Dado** hay capacidad suficiente, **cuando** se reserva, **entonces** bytes y cupo quedan comprometidos atómicamente.

### Escenario 2
**Dado** dos reservas compiten por el último cupo, **cuando** se procesan, **entonces** como máximo una excede cero disponible y nunca se sobreasigna.

### Escenario 3
**Dado** una reserva cancelada se libera dos veces, **cuando** se reintenta, **entonces** la segunda operación es idempotente.

## Reglas de negocio
La reserva no concede permisos de carga ni continuidad contra lifecycle. Preserva reservas existentes ante reducción.

## Validaciones y permisos
Solo comandos internos autorizados por el flujo de upload.

## Casos de error y estados vacíos
Capacidad insuficiente, replay, versión obsoleta, evento no elegible y rollback.

## Datos / contratos afectados
CapacityReservation, reservationBytes, reservationFileSlot, idempotency key.

## Dependencias técnicas y funcionales
EL-TK-086/092 consumen este contrato; PostgreSQL real para atomicidad.

## Dependencias de tickets
- **depends_on:** EL-TK-134
- **blocks:** contrato consumido por EL-TK-086, EL-TK-092; EL-TK-137, EL-TK-145

## Pruebas requeridas
Concurrencia, rollback, idempotencia, reducción bajo reserva y aislamiento.

## Observabilidad / auditoría
Auditar operación/cantidad/resultados sin contenido.

## Prioridad / estimación
P0 / M

## Traceability
DEC-079, DEC-080, DEC-085; EL-EP-011, EL-EP-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-079/080/093..095/100..102 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Resolución e implementación — 2026-10-11
- **Paquete:** `@eventlens/capacity-management` en `packages/capacity-management`.
- **Modelos:** `CapacityReservation` y `EventCapacityBalance` en PostgreSQL con Prisma (migración `202610110028_capacity_reservation`).
- **Servicio:** `CapacityReservationService`:
  - `reserveCapacity`: compromiso atómico de bytes y cupos de archivo con serialización a nivel de fila (`event_capacity_balance FOR UPDATE`) que previene matemáticamente la sobreasignación ante cargas concurrentes (DEC-080).
  - Idempotencia por `(eventId, idempotencyKey)`: peticiones repetidas retornan la reserva activa existente sin duplicar deducciones.
  - `releaseReservation`: liberación idempotente de intentos cancelados o vencidos con motivo; reintentos sobre reservas ya liberadas son seguros y no causan errores ni dobles liberaciones.
  - `commitReservation`: consolida reservas activas en consumo firme en `event_capacity_balance`.
  - `getCapacitySnapshot`: snapshot consistente de límites efectivos, uso firme, reservas y capacidad disponible.
- **Verificación:** 19/19 pruebas pasando (13 unitarias + 6 de integración sobre PostgreSQL 16 real en Docker, gate `CAP-001: PASS`).
