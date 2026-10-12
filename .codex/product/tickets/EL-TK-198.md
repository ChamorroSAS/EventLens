# EL-TK-198 — Cerrar estados DELETED y liquidar consumo solo con prueba principal

## Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** sistema, **quiero** confirmar eliminación de cuenta/evento/media y cuota tras prueba física, **para** evitar falso borrado o liberación anticipada de capacidad.

## Alcance funcional
Consolidar DeletionEvidence por recurso, finalizar state DELETED mediante API propietaria solo tras inventario verificado y escritores detenidos, liquidar consumo original exactamente una vez mediante EL-TK-137 y emitir hechos de notificación EL-TK-159; mantener residual pendiente explícito.

## Fuera de alcance
No afirmar backups eliminados instantáneamente ni usar label QUARANTINED/DELETED legado como evidencia física.

## Criterios de aceptación
### Escenario 1
Dado todas refs/versiones principales Missing verificadas y drenaje, cuando se cierra, entonces mainPurgedAt queda estable y estado propio DELETED autorizado.

### Escenario 2
Dado purga parcial, cuando se evalúa, entonces no marca finalizado ni libera consumo.

### Escenario 3
Dado cierre repetido o recibo duplicado, cuando llega, entonces cuota se liquida una vez y notificación no se duplica.

## Reglas de negocio
Retener tombstones/evidencia mínima; evento/cuenta DELETED no se reactiva; ledger original solo tras físico.

## Validaciones y permisos
MOD-003/002/001 propietarios mutan estados, MOD-006 cuota, MOD-009 avisos.

## Casos de error y estados vacíos
Media legacy DELETED sin evidencia, recibo sin inventario, fallo email, cálculo cuota doble.

## Datos / contratos afectados
DeletionEvidence, ledger EL-TK-137, NotificationIntent EL-TK-159, proprietarios de state.

## Dependencias técnicas y funcionales
EL-TK-196, EL-TK-197, EL-TK-137, EL-TK-159 para comunicación completa.

## Dependencias de tickets
- **depends_on:** EL-TK-196, EL-TK-197, EL-TK-137, EL-TK-159 para comunicación completa.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Tests transaccionales receipt idempotente, cuota, fail email, múltiples recursos, legacy reconciliation.

## Observabilidad / auditoría
Registro mínimo de mainPurgedAt, causalityId, cuota y pending residual; sin bytes.

## Prioridad / estimación
P0 / M

## Traceability
DEC-092/099/110; ARCH-006/010/019; EL-EP-011/013/015

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

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12.

## Evidencia de cierre — 2026-10-12
- **Implementación:** `packages/event-management/src/deletion-finalization-and-residual.ts` (`DeletionFinalizationAndResidualService.finalizeDeletedStateAndSettleQuota`).
- **Verificación:** `test/deletion-purge-and-residual.unit.test.ts` y `test/deletion-purge-and-residual.integration.test.ts` (PASS en PostgreSQL 16 real) + `pnpm --filter @eventlens/event-management build` (0 errores).

