# EL-TK-190 — Cancelar eliminación manual de evento antes del claim irreversible

## Parent epic
EL-EP-015

## Status
DONE

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

### Escenario 4
Dado ADMIN_HUMAN con identidad vigente, grant MOD-007 para cancelar esta solicitud/recurso y motivo auditado, cuando cancela dentro de la misma ventana y antes del claim, entonces se aplica el mismo comando propietario y ACK causal. Sin grant, con grant ajeno/revocado, revisión/epoch/freshness inválidos o ventana/claim incompatibles, se deniega sin levantar barreras.

## Reglas de negocio
Comparación estricta now < cancelUntil; otras barreras persisten; no ACTIVE ciego.

## Validaciones y permisos
Owner legítimo, request exacta vigente, CAS y epoch. También se permite la cancelación administrativa ya aprobada en EL-EP-015: ADMIN_HUMAN de MOD-001 / ARCH-013, grant MOD-007 de operación/recurso exactos, motivo auditado y revalidación de revisión, revocación, freshness y recovery epoch. No se acepta una prueba de contraseña del organizador como identidad administrativa ni se amplía la ventana. EL-TK-151 sólo delega al propietario MOD-008; no concede permisos.

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
Pruebas integración PostgreSQL + authority: cancel/claim simultáneos, boundary exacta, replays, rollback; admin autorizado, grant ausente/ajeno/revocado, freshness/revisión/epoch inválidos y motivo auditado.

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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12.

## Evidencia de cierre — 2026-10-12
- **Implementación:** `packages/event-management/src/manual-deletion-workflows.ts` (`ManualDeletionWorkflowService.cancelManualEventDeletion`, `calculateFaithfulEventStatusAfterBarrierRelease`).
- **Verificación:** `packages/event-management/test/manual-deletion-workflows.unit.test.ts` y `packages/event-management/test/manual-deletion-workflows.integration.test.ts` (PASS en PostgreSQL 16 real: frontera estricta `now < cancelUntil`, serialización vs claim irreversible, `ACK` causal antes de liberar barrera, recálculo fiel de estado y suspensiones, y soporte `ADMIN_HUMAN` con grant `MOD-007` + motivo auditado + rechazo de prueba del organizador).

