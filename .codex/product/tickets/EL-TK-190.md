# EL-TK-190 — Cancelar eliminación manual de evento antes del claim irreversible

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** organizador, **quiero** cancelar una solicitud vigente de borrado de su evento, **para** recuperar únicamente capacidades todavía permitidas.

## Alcance funcional
Endpoint cancel por request/revision con confirmación; serializa cancel vs expiry/claim bajo CAS/barrier; ACK causal antes de quitar exclusivamente la restricción aportada por esa solicitud; recalcular lifecycle y suspensiones.

## Fuera de alcance
No restaurar DELETED ni suprimir restricciones por otras causas.

## Criterios de aceptación
### Escenario 1
Dada cancelación anterior a cancelUntil y sin claim, cuando confirma, entonces request queda cancelada y se recalculan capacidades.

### Escenario 2
Dada cancelación a la hora exacta de fin de ventana o después de claim, cuando solicita, entonces se deniega y no deshace purga.

### Escenario 3
Dada respuesta UNKNOWN o retry concurrente, cuando consulta, entonces conserva estado seguro hasta recibo reconciliado.

## Reglas de negocio
Comparación estricta now < cancelUntil; otras barreras persisten; no ACTIVE ciego.

## Validaciones y permisos
Owner legítimo, request exacta vigente, CAS y epoch.

## Casos de error y estados vacíos
Request ajena, cancelada, vencida, expiración simultánea, ACK perdido.

## Datos / contratos afectados
MOD-008 cancel endpoint, MOD-002 recalc, RecoveryAuthority receipts.

## Dependencias técnicas y funcionales
EL-TK-189, EL-TK-188; EL-TK-193 para propagación.

## Dependencias de tickets
- **depends_on:** EL-TK-189, EL-TK-188; EL-TK-193 para propagación.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Pruebas integración PostgreSQL + authority: cancel/claim simultáneos, boundary exacta, replays, rollback.

## Observabilidad / auditoría
Evidencia de cancelación y barreras restantes sin secretos.

## Prioridad / estimación
P0 / M

## Traceability
DEC-043/091/092/098/099; ARCH-010; EL-EP-015

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
