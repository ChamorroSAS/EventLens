# EL-TK-196 — Ejecutar purga física durable e idempotente de principales

## Parent epic
EL-EP-015

## Status
READY

## User story
**Como** sistema, **quiero** eliminar físicamente objetos autorizados tras claim y drenaje, **para** cumplir principal +7 sin falsas conclusiones.

## Alcance funcional
Worker MOD-008 orchestrator JobQueue Postgres con CAS, claim/lease/fence, retries y resultados exactos Present/Missing verificado/Unknown; delete de originals/derivatives/covers/exports/versions/multipart, cleanup de SQL owner y journal; priorizar deadlines.

## Fuera de alcance
No declarar DELETED/cuenta finalizada ni reducir cuota ante job encolado, error Unknown o purga parcial.

## Criterios de aceptación
### Escenario 1
Dado manifest y claim reconciliados, cuando storage confirma ausencia de cada objeto/version y drenaje, entonces marca principal verificado con mainPurgedAt.

### Escenario 2
Dado Unknown o error parcial, cuando worker termina, entonces conserva PENDING, reintenta y alerta sin marcar principal ni liberar consumo.

### Escenario 3
Dado replay/lease vencido/worker tardío, cuando se ejecuta, entonces respeta epoch/fence y conserva ancla original, sin doble borrado.

## Reglas de negocio
Cumplir addUtcCalendarDays(purgeStartedAt,7) para principal; storage fuera de transacción SQL; tres intentos agotados no son éxito.

## Validaciones y permisos
Solo worker SYSTEM autorizado con authority sincronizada y lease vigente.

## Casos de error y estados vacíos
DB crash entre fases, copy/version tras HEAD Missing, objeto reaparecido, backoff y DEAD.

## Datos / contratos afectados
DeletionCoordinator, JobQueue, ObjectStorage, manifest, UnitOfWork, purge receipts.

## Dependencias técnicas y funcionales
EL-TK-195, EL-TK-197, EL-TK-194 para cobertura de causas; entradas manuales desde 189/191.

## Dependencias de tickets
- **depends_on:** EL-TK-195, EL-TK-197, EL-TK-194 para cobertura de causas; entradas manuales desde 189/191.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Integración PG16, storage real versiones/multipart, lease/fence, fault injection PREPARE/SQL/ACK, deadline y Unknown.

## Observabilidad / auditoría
Evidencia por ref/version terminal sin payload; alarma de deadline y trabajos DEAD.

## Prioridad / estimación
P0 / L

## Traceability
DEC-092/097..110; ARCH-002/005/006/010/019; EL-EP-015

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

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12. No acredita implementación, ejecución de pruebas ni PASS de validation gates.
