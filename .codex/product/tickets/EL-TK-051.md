# EL-TK-051 — Asignar una portada READY segura mediante revisión CAS

## Parent epic

EL-EP-002

## Status

READY

## User story

**Como** organizador propietario, **quiero** asignar un EventAsset READY seguro como portada vigente, **para** actualizarla sin sobrescribir un cambio concurrente.

## Alcance funcional

AssignCoverAsset MOD-002 para EventAsset READY seguro mediante CAS de configuración. Una responsabilidad de asignación; no carga/procesa ni ejecuta delete físico. Consume owner/event/generation/READY de EventAssetCatalog MOD-003.

## Criterios de aceptación

**Dado** organizador activo owner y evento DRAFT/SCHEDULED permitido, asset READY seguro mismo owner/event/generation y expectedCoverRevision, **cuando** asigna, **entonces** SQL corto cambia referencia/revisión vigente y registra audit/recibo/job cleanup anterior atómicamente. Sin anterior no inventa referencia.

**Dado** asset ajeno/no READY/inseguro, barrera o CAS obsoleto, **cuando** asigna, **entonces** no reemplaza vigente; CAS perdido conserva candidato no asignado para retry/cleanup. Dos reemplazos concurrentes dejan un ganador único y no borran activo.

**Dado** replay compatible/rollback, **cuando** se repite/falla, **entonces** receipt devuelve mismo efecto o referencia/audit/job se revierten juntos. Preview grant sólo derivados privados READY con owner/policy actuales; no original/staging ni acceso guest real.

## Datos / contratos afectados

coverAssetId/config revision MOD-002; asset físico MOD-003. Job052 por contrato acordado sin delete sincrónico. EventSnapshot para031 y ledger COVER separado DEC-079; no galería/Mis aportes/ZIP. DRAFT/SCHEDULED de cover no amplía edición de otros formularios.

## Pruebas requeridas

Vitest policy; PG real replace simultáneo/rollback/replay/audit-job únicos; API owner/estado/CAS/grant temporal; componentes/Playwright asignación confirmada, fallo-preserva-vigente/foco estable y recibido-procesando-READY-asignado sin éxito falso. Barrier/recovery actuales impiden grant desde snapshot no reconciliado.

## Dependencias técnicas y funcionales

AQR-002; media-and-jobs-architecture §Portada; domain-map/api-conventions/operations-and-recovery/testing-strategy; DEC-071/074/079. Puertos adapter-neutral acordados sin seleccionar DEFERRED ni depender de toda otra épica.

## Dependencias de tickets

- **depends_on:** EL-TK-020, EL-TK-050.
- **blocks:** EL-TK-052.
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

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Assignment/grant/CAS implementables con EventAsset READY seguro; integración requiere020/050. No genera derivados ni utiliza original/staging como preview.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
