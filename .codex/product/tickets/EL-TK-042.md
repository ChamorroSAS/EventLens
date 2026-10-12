# EL-TK-042 — Eliminar una media en cuarentena mediante actor autorizado

## Parent epic

EL-EP-006

## Status

DONE

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador o automatización de seguridad autorizada, **quiero** ordenar la eliminación de una media en cuarentena, **para** retirar un contenido que no debe volver al flujo normal.

## Criterios de aceptación

**Dado** una media `QUARANTINED` y un actor autorizado con justificación, **cuando** ordena eliminarla, **entonces** confirma primero una barrera durable y disposición restrictiva, bloquea nuevos reprocesamientos y accesos normales, registra la orden y delega la eliminación física al contrato de retención/purga propietario. **Dado** un fallo al entregar la purga, **cuando** se recupera, **entonces** reintenta la disposición sin reactivar contenido ni duplicar efectos destructivos. **Dado** un organizador, actor sin autorización o media fuera de cuarentena, **cuando** intenta eliminarla por esta vía, **entonces** se deniega sin cambiar su estado.

## Fuera de alcance

Definir retención, prioridad legal o purga física: pertenecen a EL-EP-008 y EL-EP-015.

## Dependencias de tickets

- **depends_on:** EL-TK-034, EL-TK-044.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Orden autorizada, denegación al organizador, idempotencia y bloqueo de acceso/reproceso posterior.

## Observabilidad / auditoría

Auditar actor, autorización, justificación, transición y referencia de disposición sin registrar multimedia.

## Prioridad / estimación

P0 / S

## Traceability

Q-023; DEC-037, DEC-038; EL-EP-006, EL-EP-008, EL-EP-015.

## Correctivo aprobado, sin implementación — 2026-10-12

DEC-109/110 / ARCH-019: [contrato actualizado](../../context/trash-quarantine-purge-policy.md). El cierre DONE documenta la ejecución histórica y se conserva. Auditoría de fuente confirma DELETED lógico antes de purga; la corrección futura aprobada conserva QUARANTINED restringido, registra disposición irreversible/ancla/binding y sólo confirma DELETED mediante propietario tras verify físico/drain. Guardia041 bajo lock requerida; no reactivar filas antiguas ni equiparar receipt con evidencia física.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el alcance correctivo definido, tras architect/requirements_reviewer; no acredita que el correctivo esté construido ni reabre automáticamente el ticket histórico DONE. Debe enrutarse como trabajo correctivo trazable antes de exposición integrada, sin duplicar purga015 ni modificar ARCH-006.

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

### Actores y avisos de intervención
**Dado** intervención humana, **cuando** ejecuta, **entonces** exige principal administrativo vigente de044 y grant MOD-007 de acción/recurso/motivo, validando revision/epoch/barriers en servidor. Identidad sola, grant ajeno/revocado o motivo ausente no mutan. Automatización de seguridad usa identidad/autorización de servicio explícita y scope/policy/generation vigentes: no cookie/login044 ni bypass administrativo implícito. Su ruta independiente no queda automáticamente bloqueada por política de sesiones humanas.

Audita actor/autorización/motivo/generation/resultado sin contenido. Registra NotificationIntent durable de intervención al organizador cuando corresponda según EL-EP-013; si policy legal/seguridad exige supresión, conserva causa auditada. No correo por cada archivo procesado. Tests API/PG distinguen admin/automatización/owner denegado y grants revocados; PITR no reactiva intervención histórica. Contrato de credencial/sesión044 APPROVED por TB-03; implementación humana sigue dependiente de044, sin cambio funcional de intervención.

**HISTÓRICO — dictamen anterior al paquete TB:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). Ruta humana requiere contrato de credenciales/sesiones044 PENDING; automatización autorizada independiente conserva su alcance contractual.

Trazabilidad de remediación: GAP-EL-EP-006-07/08/10.

## Integración ratificada TB-01..05 — 2026-10-08 (HISTÓRICO; reevaluación vigente al final)

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- policy de barrera/disposición
- handoff a retención/audit y rutas humana/automatización

BLOCKED_SCOPE:
- ejecución humana integrada con044
- coordinación de purga con owner retención

BLOCKED_BY:
- 044 implementado bajo TB-03 APPROVED
- contrato/implementación coordinada de retención/purga de su owner; no061 directo

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Policy/barrera/handoff listos; ruta humana044 implementado y coordinación real de retención/purga; sin061 directo.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Barrera/disposición/handoff implementables por contrato044 aprobado y retención/purga vigentes de sus owners. Ruta humana usable requiere044 (043/046) y034; eliminación física requiere owner retención/inventario/drain/adapter reales. No implementa toda purga ni presume delete confirmado.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Implementación y Verificación — 2026-10-11

- **Componentes:**
  - `packages/media-inspection/src/quarantine-delete.ts`: Servicio `QuarantineDeleteService`, error `QuarantineDeleteDeniedError`, tipos `QuarantineDeleteCommand`, `QuarantineDeleteReceipt`, `QuarantineDeleteActor`, `AdminDeleteInterventionGrant`.
  - Migración Prisma `202610110018_quarantine_delete`: Tablas `media_quarantine_delete_receipt`, `media_quarantine_delete_audit`, `media_quarantine_delete_denial_audit`, y `media_quarantine_purge_intent`.
  - Exportación pública en `packages/media-inspection/src/index.ts`.
- **Invariantes contractuales y de gobernanza verificados (DEC-037 / DEC-038 / MOD-006 / MOD-007 / ARCH-015):**
  - **Barrera durable y disposición restrictiva:** Solo aplica a medias en estado `QUARANTINED`. Transiciona atómicamente a `status = 'DELETED'` y avanza revisión (`revision + 1n`), bloqueando de forma irreversible accesos normales, descargas de original y nuevos reintentos de procesamiento.
  - **Cancelación de procesos activos:** Termina ciclos de procesamiento activos en `media_processing_cycle` (`status = 'TERMINATED'`) y cancela trabajos pendientes o en reintento en `job_queue` (`cancelled = true`).
  - **Delegación de purga física:** Emite intención durable `QuarantinePurgeIntent` (`status = 'PENDING'`) con clave de deduplicación determinista para el contrato de retención/purga propietario (EL-EP-008 / EL-EP-015), sin asumir delete confirmado de almacenamiento físico.
  - **Justificación obligatoria y discriminación estricta de actores:**
    - Organizadores de eventos: Estrictamente denegados (`ORGANIZER_DENIED`), auditando el intento en `media_quarantine_delete_denial_audit` sin alterar el estado del medio.
    - Administradores humanos: Exigen contexto autenticado `AdminActorContext` (`EL-TK-044`) y un grant activo MOD-007 (`action: 'DELETE_QUARANTINE'`, con principal y `targetRef` coincidentes y justificación formal).
    - Automatización de seguridad: Utiliza identidad de servicio explícita (`serviceId`) y scope autorizado (`securityScope`), desacoplada de sesiones o cookies humanas.
  - **Idempotencia determinista:** Replays compatibles con el mismo `operationId` retornan el recibo previo (`wasExisting: true`) sin duplicar efectos destructivos ni intenciones de purga. Replays conflictivos lanzan `IDEMPOTENCY_CONFLICT`.
  - **Intención de notificación:** Registra un `NotificationIntent` durable en `media_quarantine_notification_intent` con tipo `ADMINISTRATIVE_INTERVENTION_QUARANTINE_DELETE` y clave de deduplicación determinista para el organizador del evento (conforme a EL-EP-013).
- **Evidencia en Docker con PostgreSQL 16 (`infra/validation/media-inspection/Run.ps1`):**
  - Pruebas unitarias: `test/quarantine-delete.test.ts` (13/13 passed).
  - Pruebas integradas con PG 16 real: `test/quarantine-delete.integration.test.ts` (6/6 passed).
  - Suite enfocada: 19/19 tests passed.
  - Typecheck (`tsc --noEmit`) y build (`tsc -p tsconfig.build.json`): 0 errores.
  - Veredicto de testing: **PASS** (`infra/validation/media-inspection/evidence/result.json`).
