# EL-TK-202 — Validar eliminación ordinaria de extremo a extremo y criterios de Beta

## Parent epic
EL-EP-015

## Status
DRAFT

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
Vitest/PG16 real y ObjectStorage real, Playwright Angular, carrera/lease, fault-PITR, accesibilidad, gate de recuperación y costos.

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

## Gate de implementación propuesto
REQUIREMENTS_READY: YES (contratos aceptados, pendiente revisión formal del ticket).
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
REVIEW_STATUS: PENDING — propuesta documental sin prueba ejecutada ni dictamen automatizado de requirements_reviewer.
