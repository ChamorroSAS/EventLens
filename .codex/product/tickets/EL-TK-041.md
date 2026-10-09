# EL-TK-041 — Liberar una cuarentena mediante actor autorizado

## Parent epic

EL-EP-006

## Status

READY

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador o automatización de seguridad autorizada, **quiero** liberar una media en cuarentena hacia un nuevo procesamiento, **para** reexaminar contenido cuya condición de seguridad cambió.

## Criterios de aceptación

**Dado** una media `QUARANTINED` y un actor autorizado con justificación, **cuando** solicita liberación, **entonces** se crea una nueva generación auditada, conserva el historial y encola un ciclo de hasta tres intentos automáticos totales; el worker hace la transición a `PROCESSING` y reevalúa antes de transformar o publicar. **Dado** un organizador, actor sin autorización o una media fuera de cuarentena, **cuando** intenta liberarla, **entonces** se deniega sin cambiar su estado. **Dado** una solicitud repetida, **cuando** ya existe la ejecución vigente, **entonces** no se duplican trabajos.

## Reglas de negocio

La liberación no marca la media como segura, `PUBLISHED` ni entrega lectura. La transición activa corresponde al worker y la inspección se repite.

## Dependencias de tickets

- **depends_on:** EL-TK-032, EL-TK-034, EL-TK-038, EL-TK-044.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Liberación autorizada con motivo, denegación al organizador, idempotencia y repetición obligatoria de inspección.

## Observabilidad / auditoría

Auditar actor, autorización, justificación, estado previo, ciclo y resultado solicitado.

## Prioridad / estimación

P0 / S

## Traceability

Q-023; DEC-038, DEC-064; EL-EP-006, EL-EP-012.

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
- policy de liberación/ciclo/idempotencia/audit
- rutas humana/automatización por contrato

BLOCKED_SCOPE:
- ejecución humana integrada con044
- reprocesamiento real upstream

BLOCKED_BY:
- 044 implementado bajo TB-03 APPROVED
- 033/035/036/056 ejecución real para reprocesar

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Policy/handoff independientes listos; ruta humana044 implementado y reprocesamiento upstream real. Automatización mantiene identidad/policy propia.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. TB-03/044 tienen contrato aprobado: policy/handler/encolado implementables sin decisión nueva. Ruta humana usable requiere044 (043/046), grant MOD-007 y032/034/038; reprocesamiento real requiere033/035/036/056. Automatización conserva identidad/policy propia. Upstream no implementado no impide construir por puertos cerrados.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
