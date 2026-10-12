# EL-TK-187 — Corregir disposición y liberación de media en cuarentena

## Parent epic
EL-EP-006

## Status
DONE

## User story
**Como** operación de seguridad, **quiero** impedir liberación tras una disposición irreversible, **para** alinear EL-TK-041/042 con ARCH-006 sin reescribir sus cierres históricos.

## Alcance funcional
Correctivo focalizado de quarantine-delete/release: barrera PREPARE-SQL-ACK, disposición autorizada persistida con ancla y policyRef; media sigue QUARANTINED hasta verificación física por MOD-003; release comprueba disposición bajo mismo lock; datos legacy se reconcilian sin reactivar. La [política aprobada de papelera/cuarentena](../../context/trash-quarantine-purge-policy.md) y el [contrato de coordinación](../../context/deletion-coordination-contract.md) son normativos para ancla, deadlines, restricciones y separación de disposición/evidencia física; sin purga productiva en este correctivo.

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
EL-TK-041/042 DONE, EL-TK-046. EL-TK-194 es consumidor downstream de este correctivo, no una predecesora.

## Dependencias de tickets
- **depends_on:** EL-TK-041, EL-TK-042, EL-TK-046.
- **blocks:** EL-TK-194; ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — architect y requirements_reviewer APPROVED individualmente.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO — correctivo backend; ui_designer confirma delimitación sin nueva UI.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED.
REVIEW_STATUS: APPROVED — [dictámenes formales185..187](../sessions/2026-10-12-el-tk-185-187-readiness.md).

Histórico: DRAFT en la propuesta original y fuera de la revisión188..202; READY tras revisión individual del 2026-10-12. No acredita implementación, pruebas, migración/cutover ni validation gates PASS.

## Cierre de implementación — 2026-10-12
- Implementado `QuarantineDeleteService` alineado estrictamente con Opción A (DEC-109/110 / ARCH-006): el estado de la media en `media_catalog` permanece `QUARANTINED` incrementando la revisión de control monótona; la eliminación física no se afirma sin verificación de MOD-003.
- Ancla persistida única: `purge_started_at = dispositionConfirmedAt` originado exclusivamente del reloj servidor en SQL confirmado (`RETURNING clock_timestamp()`), con `policy_ref = 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1'`, `main_purge_deadline = +7 días UTC`, `residual_purge_deadline = +30 días UTC`, y `expected_revision`.
- `QuarantineReleaseService` verifica bajo el mismo lock `FOR UPDATE` en `media_catalog` la existencia de intenciones de purga activas en `media_quarantine_purge_intent` (`PENDING` o `CONFIRMED`); rechaza cualquier solicitud o replay con `QuarantineReleaseDeniedError('DISPOSITION_BARRED')` y registra auditoría de denegación.
- Función de reconciliación legacy `reconcileLegacyQuarantineDeleted(tx, mediaRef)` añadida: preserva el estado `DELETED` histórico con acceso restringido sin reactivar el recurso (`reopened: false`) y sin certificar purga física sin evidencia (`physicalPurged: false`).
- Migración DDL agregada: `202610120022_quarantine_disposition_barrier/migration.sql` y ensamblado central verificado.
- Verificación: 16 archivos de tests unitarios ejecutados en `@eventlens/media-inspection` (213 pruebas pasadas), suites de integración actualizadas con escenarios de barrera.

