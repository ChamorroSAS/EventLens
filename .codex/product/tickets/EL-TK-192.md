# EL-TK-192 — Cancelar eliminación de cuenta con prueba nueva y recálculo de eventos

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** organizador, **quiero** cancelar el borrado pendiente de su cuenta en plazo, **para** recuperar la cuenta sin resucitar eventos o contenidos ya purgados.

## Alcance funcional
Comando cancel account requiere reauth nueva para CANCEL_ACCOUNT_DELETION, consume evidencia de un uso, serializa vs claim/fin ventana; restituye acceso ordinario y recalcula cada evento según lifecycle/cierres/barreras vigentes después de ACK.

## Fuera de alcance
No cancelar gracia irreversible, no restaurar media purgada ni imponer ACTIVE a todos los eventos.

## Criterios de aceptación
### Escenario 1
Dada cuenta dentro 7d con nueva evidencia, cuando cancela antes del claim, entonces cancelación queda confirmada y eventos recuperan solo capacidades elegibles.

### Escenario 2
Dado claim ganador/ventana expirada, cuando cancela, entonces no se revierte purga ni se anuncia éxito.

### Escenario 3
Dado ACK incierto o reapertura parcial, cuando consulta, entonces permanece acceso restringido hasta evidencia causal reconciliada.

## Reglas de negocio
No encadenar 72h por eventos; conservar plazos de gracia y cierre voluntario.

## Validaciones y permisos
Solo cuenta propia, evidence de operación CANCEL/expectedRevision/requestId exactos.

## Casos de error y estados vacíos
429 rate limit, sesión restringida, idempotencia incompatible, restore antiguo.

## Datos / contratos afectados
MOD-001 restricted session y reauth; MOD-008 cancellation; MOD-002 event recalc.

## Dependencias técnicas y funcionales
EL-TK-191, EL-TK-186; integración EL-TK-193.

## Dependencias de tickets
- **depends_on:** EL-TK-191, EL-TK-186; integración EL-TK-193.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
PostgreSQL CAS/cancel-claim concurrente, múltiples eventos, PITR, evidencia nueva vs reused, ACK.

## Observabilidad / auditoría
Auditoría mínima de request/cancel/resultado; no contraseñas.

## Prioridad / estimación
P0 / L

## Traceability
DEC-044/091/092/098/099/107; ARCH-010/017; EL-EP-015

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
