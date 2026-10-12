# EL-TK-188 — Persistir el contrato canónico de solicitudes e intenciones de eliminación

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** sistema, **quiero** registrar solicitudes, causas y plazos sin ambigüedades, **para** coordinar purgas idempotentes con evidencia consistente.

## Alcance funcional
Modelo propio MOD-008 para DeletionRequest/Intent, sourceOperationId, causa, scope, revisión/generación, policyRef, ancla, cancelUntil, deadlinesUTC, estados PREPARED/confirmed/UNKNOWN y receipts; preservar ownership; migraciones y OpenAPI mínimo de consulta.

## Fuera de alcance
No mutar tablas propietarias de MOD-001..007 ni declarar purge/completion por encolado.

## Criterios de aceptación
### Escenario 1
Dada causa válida (manual evento/cuenta, gracia, retiro propio, papelera, cuarentena), cuando se persiste, entonces ancla/plazos provienen del hecho propietario confirmado.

### Escenario 2
Dado replay con misma clave y payload, cuando llega dos veces, entonces se devuelve mismo resultado sin duplicar request; payload incompatible da conflicto.

### Escenario 3
Dado worker tardío o DST, cuando calcula +7/+30, entonces suma días calendario UTC conservando hora y no mueve ancla.

## Reglas de negocio
Las causas irreversibles no tienen ventana de cancelación; hold jurídico deshabilitado; causa nueva no extiende obligaciones anteriores.

## Validaciones y permisos
Solo ports propietarios, identidades/epoch válidos; ningún cliente decide ancla de purga.

## Casos de error y estados vacíos
Intent incompleto, conflicto de revisión, duplicación, UNKNOWN/PREPARE y reloj contradictorio.

## Datos / contratos afectados
MOD-008 DeletionRequest/Intent schema, UnitOfWork, audit receipt, job contract, projection mínima.

## Dependencias técnicas y funcionales
EL-TK-046, EL-TK-067; DEC-091/092/097..110.

## Dependencias de tickets
- **depends_on:** EL-TK-046, EL-TK-067; DEC-091/092/097..110.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Pruebas unitarias de UTC/leap/DST y causas; PostgreSQL real unique-key/CAS/rollback/replay; migration compatible.

## Observabilidad / auditoría
Métricas por causa y resultado, sin media ni PII adicional.

## Prioridad / estimación
P0 / M

## Traceability
DEC-091/092/097..110; ARCH-002/005/010/019; EL-EP-015

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
