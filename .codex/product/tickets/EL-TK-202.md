# EL-TK-202 — Validar eliminación ordinaria de extremo a extremo y criterios de Beta

## Parent epic
EL-EP-015

## Status
DONE

## User story
**Como** equipo de calidad, **quiero** probar solicitud, cancelación, purga y recuperación entre módulos, **para** determinar si la capacidad está realmente lista para una Beta segura.

## Alcance funcional
Suite E2E trazable PG16/ObjectStorage S3-compatible/RecoveryAuthority, eventos y cuentas, gracia, retiro, papelera y cuarentena; fault injection, +7/+30 UTC, seguridad/privacidad, QoS, evidencias de aceptación/NoPASS.

## Fuera de alcance
No certificar proveedores no elegidos, ni hold jurídico, ni apertura pública; test fallido no se marca PASS.

## Criterios de aceptación
### Escenario 1
Dadas solicitudes/cancelaciones concurrentes, cuando se cruza claim/ACK, entonces nunca hay resurrección, acceso no autorizado ni ancla desplazada.

### Escenario 2
Dadas purgas storage parciales/Unknown, cuando vencen reintentos/lease, entonces cuota y DELETED esperan verificación, se alerta y no se oculta deadline.

### Escenario 3
Dado restore PITR anterior a cualquier transición, cuando reabre acceso, entonces journal/tombstones impiden grants y contenido purgado; +7/+30 verificados.

## Reglas de negocio
Separar evidencia principal de backup residual; pruebas con reloj UTC fijo y tiempos reales; limpiar fixtures sensibles.

## Validaciones y permisos
Sólo fixtures/roles de test; verificar mínimo privilegio y autorización de cada operación.

## Casos de error y estados vacíos
Servicios caídos, rollback, crash, S3 multipart/versioning, grant tardío, residual no acreditado.

## Datos / contratos afectados
Test suites/infra de validación existentes, MEDIA-001 CAP-001 DR-001 EXPORT-001, evidence ledger.

## Dependencias técnicas y funcionales
EL-TK-194, EL-TK-196, EL-TK-198, EL-TK-199, EL-TK-200, EL-TK-201; productor EL-TK-109/114/128 vigente.

## Dependencias de tickets
- **depends_on:** EL-TK-194, EL-TK-196, EL-TK-198, EL-TK-199, EL-TK-200, EL-TK-201; productor EL-TK-109/114/128 vigente.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Vitest/PG16 real y ObjectStorage real, Playwright Angular, carrera/lease, fault-PITR, accesibilidad, gate de recuperación y costos. Reutilizar la matriz de EL-TK-200/201 y el [handoff aprobado](../../context/ui-deletion-flow.md); automatizar semántica/teclado/foco y registrar revisión manual con lector, sin considerar Playwright una certificación de lector real.

## Observabilidad / auditoría
Reporte auditado PASS/FAIL por contrato con PR/commit/casos, sin datos privados.

## Prioridad / estimación
P0 / L

## Traceability
DEC-091..110; ARCH-002/005/006/010/017..019; EL-EP-015/017

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
- **Implementación y Suite E2E:** `packages/event-management/test/deletion-beta-e2e.integration.test.ts`, `test/deletion-coordination.integration.test.ts`, `test/manual-deletion-workflows.integration.test.ts`, `test/irreversible-deletion-intake.integration.test.ts`, `test/deletion-purge-and-residual.integration.test.ts`, `test/deletion-ui-workflows.unit.test.ts` y `apps/web/src/app/deletion-management.component.spec.ts`.
- **Verificación:** Todas las suites unitarias, de integración en PostgreSQL 16 real, S3-compatible y Angular en `PASS` con `0` errores de compilación TypeScript.

