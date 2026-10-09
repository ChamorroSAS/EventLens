# EL-TK-055 — Reservar ejecuciones JobQueue PostgreSQL con lease y fencing

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** worker autorizado, **quiero** reservar y mantener una ejecución mediante lease vigente, **para** procesar trabajo durable sin confirmar efectos de una ejecución obsoleta.

## Alcance funcional

Capacidad compartida JobQueuePostgres de claim/heartbeat/completion fencing y autorización de ejecución; consume JobSpec publish acordado sin depender de recovery038. No redefine política de media, scheduler completo ni proveedores.

## Criterios de aceptación

**Dado** jobs elegibles y capacidad local disponible, **cuando** dos workers reservan, **entonces** SQL corto FOR UPDATE SKIP LOCKED/UPDATE/RETURNING confirma un ganador por ejecución con attempt/fence/worker/lease/epoch; claim acotado no supera slots locales ni mantiene lock durante transcode. DB clock evalúa availableAt/deadline/expiry. Rollback no reserva ni inicia side effects.

**Dado** heartbeat con owner/token/epoch vigentes y lease no expirado/recurso autorizado, **cuando** renueva, **entonces** actualiza lease; expirado/ajeno/revocado/cancelado no renueva ni resucita ejecución. Complete/retry/resultado exigen mismo fence/epoch/generation/policy vigentes y registran recibos/estado junto al efecto domain/audit en UnitOfWork.

**Dado** restore o pérdida DB/lease, **cuando** worker anterior intenta confirmar, **entonces** recovery epoch nuevo y barrera impiden coincidencia de contador restaurado; scope sin reconciliar no claim/renueva/confirma. Capacidad física no se presume detenida por CAS:056/057 verifican cancelación y drain antes de efectos seguros.

## Contratos y pruebas

JobQueue.reserve/heartbeat/complete y recurso/generation/receipt; puertos RecoveryAuthority de owner compartidos, no046 MOD-001 ni segundo adapter. Vitest elegibilidad; PostgreSQL real concurrent claim/SKIP LOCKED/DB clock/rollback/lease expirada/heartbeat vs recovery038 y fencing. PITR con worker viejo y ACK perdido prueba no duplicación del resultado; no SQLite/mock como prueba única. Duración/config operativa se parametriza sin cifras inventadas.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-038, EL-TK-056.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-006-03/08; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED (readiness antes de implementación):** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Claim/heartbeat/fence/CAS era implementable sin predecesora ticket, con contrato RecoveryAuthority acordado y PostgreSQL real059 disponible. Helper060 no sustituía implementación productiva. La evidencia final de restauración semántica y sus límites están registrados abajo; DR global no bloqueó este ticket.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Resultado de implementación — 2026-10-09

[Sesión de cierre y revisión final](../sessions/2026-10-09-el-tk-055-implementation.md).

**CONFIRMED: DONE.** Se implementó `@eventlens/job-queue` como capacidad reutilizable de infraestructura PostgreSQL/Prisma. La evidencia final reporta 25/25 pruebas pasando en PostgreSQL 16 real, además de migración, typecheck, build e importación del paquete verificados. [Evidencia de implementación](../../../infra/validation/job-queue/evidence/result.json), [validación independiente](../../../infra/validation/job-queue/evidence/independent-validation.json), [guía del runner](../../../infra/validation/job-queue/README.md).

El alcance entrega contratos y primitivas de claim, heartbeat, finalización/retry con fencing, autorización por recurso y publicación/receipts atómicos dentro de la UnitOfWork. La política de recursos es inyectada; los slots físicos siguen reservados hasta que el consumidor confirme `releaseAfterQuiescence`. El paquete no implementa handler multimedia, scheduler, autoridad productiva RecoveryAuthority ni control físico de writers.

La restauración se validó mediante simulación semántica de snapshot/counters y autoridad de prueba independiente; no se ejecutó PITR operacional. MEDIA-001, CAP-001, DR-001 y EXPORT-001 permanecen NOT_EVALUATED. La validación independiente fue PASS_WITH_WARNINGS; conserva estas limitaciones de alcance. EL-TK-056 es el siguiente consumidor habilitado por dependencias, pero su integración aún no está implementada.
