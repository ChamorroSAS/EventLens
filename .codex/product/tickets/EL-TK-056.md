# EL-TK-056 — Ejecutar inspección y transformación multimedia en aislamiento supervisado

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** sistema, **quiero** ejecutar inspección y transformación bajo aislamiento supervisado, **para** contener archivos y procesos sin conservar writers tras perder autorización.

## Alcance funcional

Ejecutor supervisado para adapters MediaInspector/MalwareInspection/PhotoTransformer/VideoTransformer. Una responsabilidad de aislamiento de subprocess e IO; no inspección/codec nuevo ni elección de herramientas/proveedor. Límites CPU/memoria/tiempo/píxeles/streams/threads/PIDs/scratch del contrato aprobado se hacen efectivos con configuración antes de ejecutar, sin cifras inventadas.

## Criterios de aceptación

**Dado** lease/resource/generation autorizados y límites efectivos configurados, **cuando** inicia parser/transformer, **entonces** subprocess sin acceso de red/privilegios adicionales lee refs exactas autorizadas, usa scratch acotado y outputs separados por intento; exceder límite termina y clasifica resultado sanitizado sin promoción parcial. Config ausente no ejecuta sin límites.

**Dado** pérdida lease/DB/autorización o cancelación, **cuando** supervisor la detecta, **entonces** termina subprocess y nuevas operaciones de IO, drena writers pendientes y conserva evidencia de quiescencia; no promueve outputs ni anuncia cancelación física completa mientras writer no esté detenido/verificado. Fence SQL no detiene PUT storage por sí solo.

**Dado** crash/worker viejo después PITR, **cuando** recupera, **entonces** epoch/fence/barrera vigentes impiden ejecución/promoción obsoleta y outputs/scratch inventariados son elegibles para057 sólo tras drain seguro. Original permanece intacto.

## Contratos y pruebas

Lease055 y puertos storage/process supervision/writer drain/attempt inventory. Vitest control límites/policy; PG/API de ejecución obsoleta; ensayo subprocess malicioso/bomba/límite, pérdida heartbeat/DB y PUT pausado evidencia terminación/quiescencia, no sólo mock/fence. Tooling/rendiciones/runtime adoptados por ARCH-015; este ticket implementa y valida configuración efectiva/adapter/drain sin seleccionar DEFERRED.

## Dependencias de tickets

- **depends_on:** EL-TK-055, EL-TK-061.
- **blocks:** EL-TK-033.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-006-04/08; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

**HISTÓRICO — dictamen anterior al paquete TB:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). Herramientas, configuración efectiva de límites, aislamiento y drain del ejecutor real pendientes.

## Integración ratificada TB-01..05 — 2026-10-08 (HISTÓRICO; reevaluación vigente al final)

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- interfaces de supervisor/config/attempt inventory
- cancelación y pruebas unitarias de policy

BLOCKED_SCOPE:
- ejecutor productivo de aislamiento y drain comprobados
- config efectiva adoptada tras evidencia060/061 y entorno059

BLOCKED_BY:
- 060 PASS y061 PASS con handoff técnico evaluado
- 059 capacidades reales y fase integración pertinente
- 055 contrato/capacidad de lease existente

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Interfaces/policy listas; full requiere060/061 PASS, handoff evaluado, entorno/config efectiva y055 existente.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Docker/cgroups/tmpfs/supervisor/config acotada adoptados.059 real,060PASS,061PASS y adopción satisfechos. Construcción puede comenzar con contrato055; integración usable requiere055 productivo. Config suficiente por tarea/máximos y pruebas reales siguen responsabilidad del ticket/CAP/MEDIA, sin copiar prototipo como producto ni esperar PASS Beta para iniciar.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Implementación y cierre — 2026-10-09

**DONE.** Se implementó `@eventlens/media-execution`: supervisor de intentos, runtime Docker aislado e inventario Prisma de infraestructura. Cada intento usa outputs privados; la reserva solo se libera tras evidencia persistida de quiescencia. Un writer local o remoto que no pueda probar terminación mantiene el intento `UNKNOWN` y conserva el slot para reconciliación. La autoridad de storage/runtime sigue siendo un puerto inyectado; este paquete no selecciona el proveedor definitivo ni promueve resultados al dominio.

**Validación independiente:** PASS, 21/21 pruebas con PostgreSQL 16, MinIO de laboratorio y el runtime Docker adoptado; migraciones iniciales y repetidas, typecheck, build e imports públicos aprobados. Los 24 hashes de código de la manifest coincidieron. [Registro final](../../../infra/validation/media-execution/evidence/independent-validation.json) y [sesión de implementación](../sessions/2026-10-09-el-tk-056-implementation.md). El reviewer normal y la revisión crítica aprobaron la versión validada sin hallazgos abiertos.

La prueba de escritura local retenida confirmó que la cancelación no cierra el descriptor ni libera el slot antes de que el writer termine. Las cuotas de recursos usadas son fixtures de prueba, no sizing Beta. La ausencia de prueba terminal durable en recuperación fría permanece `UNKNOWN`. MEDIA-001, CAP-001, DR-001 y EXPORT-001 siguen sin evaluar; EL-TK-056 no los marca PASS.
