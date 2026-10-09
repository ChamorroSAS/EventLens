# EL-TK-050 — Integrar el procesamiento seguro de una portada EventAsset

## Parent epic

EL-EP-002

## Status

READY

## User story

**Como** sistema de procesamiento, **quiero** procesar de forma segura un EventAsset de portada confirmado, **para** producir derivados privados elegibles para asignación.

## Alcance funcional

Integrar EventAsset EVENT_COVER en PhotoInspector/Transformer mediante puertos reutilizables. Una responsabilidad técnica MOD-003; no duplica pipeline033/035 ni GuestContribution/MediaGovernance, no asigna cover ni publica PUBLISHED. Consume contrato de inspección/transformación acordado, sin depender de toda implementación guest.

## Criterios de aceptación

**Dado** asset recibido confirmado, **cuando** procesa, **entonces** valida bytes reales/formato/tamaño/seguridad, conserva original/checksum y crea thumbnail/cover preview privados bajo generation/lease vigente; sólo resultado seguro completo confirma READY técnico.

**Dado** tipo falso/truncado/inseguro o fallo de proceso, **cuando** procesa, **entonces** registra FAILED/QUARANTINED pertinente sin derivado autorizable ni cambio de portada vigente. EventAsset técnico está separado de media.status de aporte; no galería/Mis aportes/ZIP.

**Dado** job duplicado, pérdida lease o resultado tardío de generation/barrera anterior, **cuando** termina, **entonces** dedup/fencing/CAS rechazan promoción obsoleta; parciales inventariados y retry sin reemplazar original ni duplicar ledger físico. SQL de resultado/job/audit atómico; rollback no deja READY parcial.

## Datos / contratos afectados

EventAssetCatalog/ProcessingService, PhotoInspector/Transformer, referencias exactas/generation y job versionado/lease. Ledger COVER operacional DEC-079; sin nuevos recortes/dimensiones/proveedor. Barrera/recovery epoch actuales por puertos antes de promover.

## Pruebas requeridas

Vitest/corpus JPEG/PNG/HEIC/HEIF/WebP tipo falso/truncado/inseguro; contrato reutilizable de original conservado/derivados privados; PG real doble job/pérdida lease/rollback/CAS obsoleto; API estado no filtra objetos ni autoriza inseguro; epoch anterior impide promover job restaurado. EventCoverUploader049 consume estado sin cola UI alternativa.

## Dependencias técnicas y funcionales

AQR-002; media-and-jobs-architecture §Portada; domain-map/api-conventions/operations-and-recovery/testing-strategy; DEC-071/074/079. Puertos adapter-neutral acordados sin seleccionar DEFERRED ni depender de toda otra épica.

## Dependencias de tickets

- **depends_on:** EL-TK-049.
- **blocks:** EL-TK-051.
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

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. EventAsset implementable por contratos compartidos adoptados de inspección/foto; no duplica033/035 ni exige toda media guest. Integración real requiere049 y adapters/executor reutilizables033/035/056 bajo lease055. Son requisitos de integración por puertos, no nuevas predecesoras duras de handlers guest para construir cover.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
