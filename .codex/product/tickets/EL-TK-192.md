# EL-TK-192 — Cancelar eliminación de cuenta con prueba nueva y recálculo de eventos

## Parent epic
EL-EP-015

## Status
READY

## User story
**Como** organizador, **quiero** cancelar el borrado pendiente de su cuenta en plazo, **para** recuperar la cuenta sin resucitar eventos o contenidos ya purgados.

## Alcance funcional
Comando cancel account: el owner requiere reauth nueva para CANCEL_ACCOUNT_DELETION y evidencia de un uso; el camino administrativo conserva ARCH-013 y grants MOD-007. Serializa vs claim/fin ventana; restituye únicamente acceso elegible y recalcula cada evento según lifecycle/cierres/barreras vigentes después de ACK. MOD-001 conserva la emisión/validación de sesiones.

## Fuera de alcance
No cancelar gracia irreversible, no restaurar media purgada ni imponer ACTIVE a todos los eventos.

## Criterios de aceptación
### Escenario 1
Dada cuenta dentro 7d con nueva evidencia, cuando cancela antes del claim, entonces cancelación queda confirmada y eventos recuperan solo capacidades elegibles.

### Escenario 2
Dado claim ganador/ventana expirada, cuando cancela, entonces no se revierte purga ni se anuncia éxito.

### Escenario 3
Dado ACK incierto o reapertura parcial, cuando consulta, entonces permanece acceso restringido hasta evidencia causal reconciliada.

### Escenario 4
Dado ADMIN_HUMAN con identidad vigente, grant MOD-007 para cancelar esta solicitud/cuenta y motivo auditado, cuando cancela dentro de la misma ventana y antes del claim, entonces no requiere la contraseña/prueba del organizador y aplica el mismo recálculo y ACK causal. Sin grant, con grant ajeno/revocado o revisión/epoch/freshness inválidos, se deniega; nunca cancela después de ventana/claim ni restaura DELETED.

## Reglas de negocio
No encadenar 72h por eventos; conservar plazos de gracia y cierre voluntario.

## Validaciones y permisos
Owner: sólo cuenta propia, evidence de operación CANCEL/expectedRevision/requestId exactos; replay exacto autorizado recupera receipt sin repetir consumo conforme al [contrato MOD-001](../../context/account-reauthentication-contract.md). Admin: identidad ADMIN_HUMAN MOD-001 / ARCH-013, grant MOD-007 de operación/recurso exactos, motivo auditado y revalidación de revisión, revocación, freshness y recovery epoch; sin proof de organizador como sustituto. Ambos respetan now < cancelUntil, serialización/CAS, ausencia de claim irreversible y barreras de otras causas. EL-TK-151 sólo delega a MOD-008, sin ampliar permisos.

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
PostgreSQL CAS/cancel-claim concurrente, múltiples eventos, PITR, evidencia nueva vs replay exacto/incompatible y ACK; admin autorizado, grant ausente/ajeno/revocado, freshness/revisión/epoch inválidos y motivo auditado.

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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12. No acredita implementación, ejecución de pruebas ni PASS de validation gates.
