# EL-TK-187 — Corregir disposición y liberación de media en cuarentena

## Parent epic
EL-EP-006

## Status
DRAFT

## User story
**Como** operación de seguridad, **quiero** impedir liberación tras una disposición irreversible, **para** alinear EL-TK-041/042 con ARCH-006 sin reescribir sus cierres históricos.

## Alcance funcional
Correctivo focalizado de quarantine-delete/release: barrera PREPARE-SQL-ACK, disposición autorizada persistida con ancla y policyRef; media sigue QUARANTINED hasta verificación física por MOD-003; release comprueba disposición bajo mismo lock; datos legacy se reconcilian sin reactivar.

## Fuera de alcance
No reimplementa autorizaciones de 041/042, no ejecuta purga física ni recalcula retención legal.

## Criterios de aceptación
### Escenario 1
Dada disposición autorizada, cuando se persiste la intención, entonces queda cierre durable, ancla única y media QUARANTINED restringida, no DELETED física.

### Escenario 2
Dada media dispuesta, cuando se solicita release/replay/procesamiento, entonces CAS/lock la rechaza y no crea nueva generación.

### Escenario 3
Dado legacy DELETED sin prueba física, cuando se reconcilia, entonces no se reabre ni se reporta purga completada sin evidencia.

## Reglas de negocio
DEC-109/110 y Opción A; dispositionConfirmedAt solo desde SQL confirmado, nunca fecha de respuesta ni inicio job.

## Validaciones y permisos
Solo actor admin/security previamente permitido, fence/epoch/revision vigentes.

## Casos de error y estados vacíos
PREPARED, ACK perdido, disposición duplicada, restore, versión antigua y lease perdido.

## Datos / contratos afectados
QuarantinePurgeIntent, disposition receipt, MOD-003 lifecycle, RecoveryAuthority y contrato MOD-008.

## Dependencias técnicas y funcionales
EL-TK-041/042 DONE, EL-TK-046; prerequisito consumidor EL-TK-194.

## Dependencias de tickets
- **depends_on:** EL-TK-041/042 DONE, EL-TK-046; prerequisito consumidor EL-TK-194.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
PostgreSQL real, concurrencia disposition vs release, PREPARE/SQL/ACK/crash, dedup, restauración antigua y datos legacy.

## Observabilidad / auditoría
No guardar bytes; alertar discrepancies label/evidence; preservar justificación y actor auditados.

## Prioridad / estimación
P0 / L

## Traceability
DEC-109/110; ARCH-006/019; EL-EP-006, EL-EP-015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación propuesto
REQUIREMENTS_READY: YES (contratos aceptados, pendiente revisión formal del ticket).
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
REVIEW_STATUS: PENDING — propuesta documental sin prueba ejecutada ni dictamen automatizado de requirements_reviewer.
