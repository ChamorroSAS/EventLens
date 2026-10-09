# EL-TK-052 — Limpiar portadas anteriores o no asignadas sin borrar la vigente

## Parent epic

EL-EP-002

## Status

READY

## User story

**Como** sistema de mantenimiento, **quiero** limpiar portadas anteriores o no asignadas, **para** recuperar almacenamiento físico sin borrar la vigente ni escrituras en curso.

## Alcance funcional

Cleanup asíncrono MOD-003 de assets anteriores/no asignados con referencia activa/CAS/generation/barrier/writer drain. Reutiliza protocolo e inventario físicos; no crea retención nueva ni borra cuenta/evento entero.

## Criterios de aceptación

**Dado** asset antiguo/no asignado y job elegible vigente, **cuando** reclama y antes de borrar, **entonces** comprueba referencia activa MOD-002, generation/barreras y writers/capacidades por drain común. Nunca borra asset asignado; lease/revisión cambiada exige reevaluar sin snapshot viejo.

**Dado** inventario COVER original/derivados/versions/partials/staging/multipart, **cuando** limpia elegibles, **entonces** conserva evidencia idempotente por ref/generation; duplicate/Missing confirmado no duplica liberación física. Unknown/fallo parcial sigue pendiente y retry sólo lo no confirmado; no DELETED/completo hasta verificar. No libera cuota comercial de aportes.

**Dado** reemplazo concurrente, writer pausado o restore con job/lease viejo, **cuando** cleanup, **entonces** fencing/epoch/drain impiden borrar activo o promover bytes tardíos; scope no reconciliado cerrado. Inventario de todas versiones sigue disponible para purga de evento/cuenta sin ejecutar esa policy aquí.

## Datos / contratos afectados

EventAsset/object inventory COVER y ledger físico; referencia activa MOD-002 por puerto/guard CAS. JobQueue y RecoveryAuthority/epoch/barrier compartidos, sin construir adapter. UnitOfWork recibo/job/audit/progreso lógico; storage fuera SQL y efectos inciertos recuperables. DEC-079 separa originales aportados 10 GB.

## Pruebas requeridas

Vitest elegibilidad/reference policy; PG replace-vs-cleanup/doble claim/lease/generation/rollback; contrato storage Missing/Unknown/fallo parcial/multipart y ledger sin doble liberación. Writer pausado+drain y PITR anterior a sustitución prueban referencia activa/generation vigente sin borrar ganador. Sin mock como única evidencia física.

## Dependencias técnicas y funcionales

AQR-002; media-and-jobs-architecture §Portada; domain-map/api-conventions/operations-and-recovery/testing-strategy; DEC-071/074/079. Puertos adapter-neutral acordados sin seleccionar DEFERRED ni depender de toda otra épica.

## Dependencias de tickets

- **depends_on:** EL-TK-051.
- **blocks:** ninguno.
- **can_parallelize_with:** configuración/consulta independiente sobre contratos acordados; se respetan predecesoras y conflictos serializados.

## Observabilidad / auditoría

Actor/resource/operationId/revisión/resultado pertinentes sin PIN, contenido, firmas o secretos.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-002-06/07/08/09; reemplazo parcial de EL-TK-026; AQR-002; DEC-071/074/079; EL-EP-002; handoff UI002; EL-TD-001..007.

## Definition of Ready

- [x] Comportamiento/criterios delimitados por contratos aprobados
- [x] Dependencias, permisos y errores identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Cleanup COVER implementable por contratos inventario/guard/drain compartidos con057 sin fusionar handlers. Integración requiere051 y primitives055/056/storage/recovery. Missing/Unknown/drain requieren evidencia; no PASS purga/DR.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
