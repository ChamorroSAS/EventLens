# EL-TK-064 — Activar un evento SCHEDULED manual o automáticamente

## Parent epic
EL-EP-003

## Status
DRAFT

## User story
**Como** organizador o sistema, **quiero** activar un evento SCHEDULED, **para** habilitar su experiencia cuando corresponda sin alterar su vencimiento.

## Alcance funcional
SCHEDULED→ACTIVE por activación anticipada autorizada o por llegada del instante programado.

## Fuera de alcance
Cerrar, reabrir, suspender o extender.

## Criterios de aceptación
### Escenario 1
**Dado** un SCHEDULED antes de su inicio, **cuando** el organizador activa anticipadamente, **entonces** pasa a ACTIVE y conserva expiresAt/graceEndsAt anclados al instante programado.

### Escenario 2
**Dado** un SCHEDULED cuyo inicio llegó, **cuando** procesa el scheduler, **entonces** pasa idempotentemente a ACTIVE.

### Escenario 3
**Dado** un evento ya ACTIVE o temporalmente vencido, **cuando** se repite el comando, **entonces** no se crea una segunda transición incompatible.

## Reglas de negocio
No recalcular vencimiento por activación anticipada.

## Validaciones y permisos
Organizador propietario para activación manual; sistema autorizado para activación temporal.

## Casos de error y estados vacíos
Carreras entre manual/scheduler se resuelven por revisión/CAS y resultado idempotente.

## Datos / contratos afectados
status, activatedAt, lifecycle revision y auditoría.

## Dependencias técnicas y funcionales
JobQueue PostgreSQL y scheduler recuperable; timeline canónico.

## Dependencias de tickets
- **depends_on:** EL-TK-063, EL-TK-062, EL-TK-055.
- **blocks:** EL-TK-065, EL-TK-067, EL-TK-071, EL-TK-072.

## Pruebas requeridas
Manual anticipada, automática, carrera doble, replay y pérdida/reintento del scheduler.

## Observabilidad / auditoría
Auditar origen manual/automático, revisión y resultado.

## Prioridad
P0

## Estimación
M

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
