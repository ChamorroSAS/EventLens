# EL-TK-005 — Emitir una invitación BETA

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador autorizado, **quiero** emitir una invitación BETA para un correo, **para** permitir que un adulto autorizado inicie su registro.

## Alcance funcional

Una única responsabilidad: emitir una invitación BETA para un correo.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un administrador autorizado y correo válido, cuando emite una invitación, entonces queda pendiente siete días desde su generación.

### Escenario 2
Dado una pendiente vigente o una usada para cuenta activa, cuando intenta emitir otra, entonces recibe la existente sin crear, reactivar ni modificar la cuenta.

### Escenario 3
Dado una pendiente vencida, cuando emite una nueva, entonces inicia siete días propios y no reutiliza la vencida.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Solo administradores autorizados emiten. Validar formato de correo; un correo inválido no crea registros. Para pendiente vigente el administrador recibe la indicación «ya está pendiente» y se conserva la existente.

## Validaciones y permisos

Solo administradores autorizados emiten invitaciones. Validar formato de correo; un correo inválido no crea registros. La información sobre invitaciones pendientes o usadas se devuelve únicamente al administrador; los flujos públicos conservan mensajes neutros.

## Datos / contratos afectados

Invitación BETA: correo, estado e instante de generación; evidencia administrativa y señal de entrega/fallo. La expiración funcional es de siete días; proveedor y mecanismos técnicos permanecen PENDING.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-044.
- **blocks:** EL-TK-006, EL-TK-007, EL-TK-010.
- **can_parallelize_with:** contratos de EL-EP-013 y EL-EP-014 solo mediante interfaces acordadas; no requiere ejecución paralela.

## Pruebas requeridas

Los escenarios de aceptación, autorización pertinente, errores y no enumeración aplicable.

## Observabilidad / auditoría

Auditar creación, intento duplicado y renovación tras expiración con actor, fecha y resultado; emitir señal mínima de entrega/fallo sin secretos.

## Prioridad

P0

## Estimación

S

## Traceability

Q-024, Q-030, Q-031, Q-033; DEC-024, DEC-040, DEC-065, DEC-066, DEC-068; CR-003; EL-TK-001; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** La aprobación READY de 2026-10-07 permanece como hecho histórico; esta actualización queda pendiente de requirements_reviewer.

- Requiere un `ActorContext` administrativo válido de EL-TK-044; no habilita autoelevación ni UI administrativa nueva.
- La creación, conservación de invitación vigente/usada y renovación vencida se resuelven con constraint/transacción idempotente; carreras y rollback no producen dos invitaciones utilizables.
- Cambio, evento de auditoría e intención de correo se aceptan conjuntamente o se revierten; entrega no equivale a aceptación y no expone secretos.
- Expone sólo contrato REST/JSON/OpenAPI de esta acción, con errores autorizados; no reutiliza DTOs internos ni modelos Prisma como contrato.
- Pruebas: Vitest de reglas; integración PostgreSQL real para duplicado/concurrencia/rollback; API de permiso y error; prueba de recuperación post-PITR aplicable a la revisión de invitación.
- La UI aprobada (BetaInviteForm/List/StatusBadge) queda como referencia del handoff; no se crea ni planifica frontend mientras el gate de EL-EP-001 sea PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Autenticación administrativa técnica de EL-TK-044 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
