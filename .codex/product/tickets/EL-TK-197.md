# EL-TK-197 — Persistir tombstones y reconciliar eliminación con RecoveryAuthority

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** sistema, **quiero** coordinar hechos durables de eliminación ajenos a PITR, **para** impedir resurrecciones al restaurar snapshots antiguos.

## Alcance funcional
Integrar PREPARE → SQL → ACK con RecoveryAuthority vigente, journal de request/cancel/claim/main purge y tombstones/generación/epoch; reconciliar ACK perdido/crash/PITR antes de admitir scopes; exigir checkpoint íntegro.

## Fuera de alcance
No crear segunda autoridad de recuperación ni declarar restore ejercicio=integración completa.

## Criterios de aceptación
### Escenario 1
Dado PREPARED con SQL incierto, cuando se recupera, entonces se reconcilia sin reabrir acceso o disparar destrucción irreversible sin autorización.

### Escenario 2
Dado snapshot previo a request/cancel/claim, cuando se restaura, entonces journal/tombstones imponen estado reciente y deniegan grants previos.

### Escenario 3
Dado checkpoint incompleto/epoch stale, cuando se intenta servir un recurso, entonces se falla cerrado hasta reconciliar.

## Reglas de negocio
No desplazar purgeStartedAt ni romper causalidad de cancelación; las restricciones independientes de PITR sobreviven backups.

## Validaciones y permisos
Solo autoridad única ARCH-010 y puertos owner, no SQL cross-module arbitrario.

## Casos de error y estados vacíos
Gap de secuencia, ACK tardío, restore parcial, authority indisponible, concurrencia con cancel/claim.

## Datos / contratos afectados
RecoveryAuthority, journal/tombstones, recovery046 y contratos EL-TK-172/174.

## Dependencias técnicas y funcionales
EL-TK-188, EL-TK-046, EL-TK-172, EL-TK-174.

## Dependencias de tickets
- **depends_on:** EL-TK-188, EL-TK-046, EL-TK-172, EL-TK-174.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Fault-PITR PG16: PREPARED/commit/ACK/crash/restore viejo; monotonic epoch y barreras before traffic.

## Observabilidad / auditoría
Auditoría compacta de seq/checkpoint/acción con pseudónimo, sin multimedia.

## Prioridad / estimación
P0 / L

## Traceability
DEC-045/092/097..110; ARCH-002/010/018/019; EL-EP-014/015

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
