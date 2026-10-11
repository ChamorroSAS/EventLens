# EL-TK-038 — Reintentar automáticamente un procesamiento técnico transitorio

## Parent epic

EL-EP-006

## Status

DONE

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** reintentar un procesamiento técnico transitorio dentro de su presupuesto, **para** recuperar trabajos sin intervención manual ni ejecuciones duplicadas.

## Criterios de aceptación

**Dado** un fallo clasificado como transitorio, **cuando** quedan intentos automáticos, **entonces** el trabajo se reprograma de forma durable e idempotente. **Dado** una reserva abandonada, **cuando** se recupera, **entonces** contabiliza el intento y el worker anterior no puede confirmar resultados tardíos. **Dado** el tercer fallo automático total, **cuando** se agota el presupuesto, **entonces** no se programa un cuarto intento automático.

## Reglas de negocio

Los tres intentos incluyen el inicial; las esperas son configurables. `DEAD` del trabajo no elimina el original ni convierte por sí mismo la media en `DELETED`.

## Dependencias de tickets

- **depends_on:** EL-TK-032, EL-TK-055.
- **blocks:** EL-TK-039, EL-TK-041, EL-TK-058.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Fallo transitorio en primer y segundo intento, recuperación de lease abandonado, deduplicación y ausencia de cuarto intento.

## Observabilidad / auditoría

Registrar intento, clasificación sanitizada, próxima ejecución y agotamiento; no almacenar secretos.

## Prioridad / estimación

P0 / M

## Traceability

Q-014, Q-023; DEC-014, DEC-064; EL-EP-006.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final2026-10-08:** remediación APPROVED; aprobación de2026-10-07 histórica. Referencias vigentes: technical-baseline EL-TD-001..007, api-conventions, media-and-jobs-architecture, operations-and-recovery y testing-strategy; no elección DEFERRED. REST/JSON/OpenAPI y cliente Angular generado, sin DTO internos Nest ni entidades Prisma como dominio/HTTP.

### Consistencia y recuperación observable
**Dado** ejecución/comando autorizado con revisión/generation/epoch vigentes, **cuando** confirma su efecto, **entonces** cambio media/job y audit/recibo/intención pertinente se registran atómicamente en SQL corto; rollback no conserva transición ni trabajo/intención parcial. Replay compatible devuelve recibo/efecto previo; payload distinto/revisión vieja da conflicto sin sobrescribir. Original y derivados activos no se sustituyen por efectos parciales o tardíos.

**Dado** carrera de claim/ciclo o pérdida lease/DB/permiso, **cuando** llega un resultado antiguo, **entonces** CAS/fence/epoch y policy vigentes impiden promoverlo o reactivar recurso restringido. Lease en DB no detiene PUT físico: ejecutor056 cancela IO/subproceso y cleanup057 exige drain/quiescencia antes de borrar. Reconciliación utiliza facts/revisión/barrier RecoveryAuthority del owner MOD-003 por puerto compartido; scopes sin checkpoint íntegro permanecen cerrados después PITR. No ampliar046 (MOD-001) ni construir segunda authority/adapter.

### Pruebas requeridas por riesgo
Vitest de policy/invariantes; PostgreSQL real para atomicidad, rollback, replay y carreras de claim/generación/ciclo. API verifica permiso/errores/esquema pertinente. Inyectar crash/ACK perdido/pérdida lease/DB y restore anterior al cambio: worker previo no promueve; snapshot sin reconciliar no autoriza. Las pruebas de consumidores cubren034 cuarentena y039 cierre terminal sin modificar sus artefactos VALID KEEP. Corpus/métricas integrados en058; no resultados ejecutados en fase documental.

Reserva/heartbeat/fence/epoch son capacidad055 independiente; este handler consume recoverExpiredLeases mediante CAS y contabiliza abandono. Tres intentos totales incluido inicial, nunca cuarto ni dos ciclos activos. Recovery no resucita lease vencido y el handler terminal039 sigue durable, con original preservado.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.

Trazabilidad de remediación: GAP-EL-EP-006-03/08/10.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Retry/ciclos/lease recovery implementables por JobSpec y055 contratado. Integración requiere032/055 y executor real; no confundir fallo operacional con contenido inválido ni cambiar tres intentos.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
 
## Cierre de implementación — 2026-10-10

**CONFIRMED — DONE:** el reviewer y tester independiente aprobaron la implementación de reintento automático transitorio y recuperación de leases.
- **Suite enfocada (EL-TK-038):** PASS 20/20 (13 pruebas de integración con PostgreSQL 16 real y 7 pruebas unitarias).
- **Regresión combinada (media-inspection):** PASS 282/282 en 12 archivos de test (inspection, quarantine, photo-derivatives, video-derivatives, successful-processing y transient-retry).
- **Regresión de runtime (EL-TK-056):** PASS 21/21 en `media-execution` en contenedor Docker.
- **Typecheck, build y migraciones repetidas:** PASS.

Aspectos técnicos verificados:
1. **Presupuesto estricto de reintentos:** exactamente 3 intentos totales (incluido el inicial). Al 1er y 2do fallo transitorio se reprograma en estado `RETRYING` con backoff exponencial configurable (`available_at`). Al 3er fallo el presupuesto se agota y transiciona atómicamente a `DEAD` sin programar un 4to intento.
2. **Preservación de original e invariantes de catálogo:** `DEAD` del trabajo no borra el archivo original ni marca la media como `DELETED` en `media_catalog`. Nunca se sobrescriben estados terminales o restrictivos (`QUARANTINED`, `PUBLISHED`, `TRASHED`, `DELETED`, `REJECTED`).
3. **Recuperación de leases abandonados:** `recoverExpiredLeases` en `@eventlens/job-queue` reclama trabajos con `status = 'PROCESSING'` y `lease_until <= clock_timestamp()`, incrementa `fence`, desvincula el worker anterior y avanza a `RETRYING` (o `DEAD` si alcanzó 3 intentos). El worker previo con token/lease vencido queda imposibilitado de confirmar o reintentar (falla con `LEASE_LOST`).
4. **Idempotencia y seguridad:** replay compatible devuelve `ALREADY_COMMITTED` con su recibo determinista (`media_retry_receipt`). Payloads/errores incompatibles generan `IDEMPOTENCY_CONFLICT`. La auditoría sanitiza URLs de base de datos, credenciales, tokens y rutas internas del sistema de archivos. Se asegura rollback completo si falla la persistencia.

Evidencia: [corrida enfocada](../../../infra/validation/media-inspection/evidence/retry-focused-final/), [regresión combinada](../../../infra/validation/media-inspection/evidence/retry-combined-regression/), [regresión runtime EL-TK-056](../../../infra/validation/media-execution/evidence/retry-independent-regression/) y [documentación](../../../infra/validation/media-inspection/README.md#el-tk-038-transient-retry-and-lease-recovery-final-validation).

MEDIA-001, CAP-001, DR-001 y EXPORT-001 permanecen `NOT_EVALUATED`; storage definitivo continúa `DEFERRED`. Se desbloquea downstream EL-TK-039, EL-TK-041 y EL-TK-058.
