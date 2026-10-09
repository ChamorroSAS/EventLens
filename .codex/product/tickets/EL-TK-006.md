# EL-TK-006 — Revocar una invitación BETA no usada

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador autorizado, **quiero** revocar una invitación BETA pendiente, **para** impedir que pueda iniciar una cuenta.

## Alcance funcional

Una única responsabilidad: revocar una invitación BETA pendiente.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado una invitación pendiente, cuando un administrador la revoca, entonces no permite activar una cuenta y el registro público recibe un resultado neutro.

### Escenario 2
Dado una invitación usada para cuenta activa, cuando se intenta revocar, entonces no se modifica la invitación ni la cuenta.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

## Validaciones y permisos

Solo administradores autorizados revocan invitaciones no usadas. Rechazar operaciones sin autorización; una invitación inexistente, usada o no revocable no modifica datos. Los intentos públicos de registro reciben resultados neutros.

## Casos de error y estados vacíos

Una invitación inexistente o no revocable no modifica datos. La revocación de una invitación usada no modifica la cuenta activa.

## Datos / contratos afectados

Invitación BETA, estado de revocación y evento de auditoría administrativa; conserva cuentas activas y sus credenciales.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-005, EL-TK-044, EL-TK-046.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos de EL-EP-013 y EL-EP-014 solo mediante interfaces acordadas; no requiere ejecución paralela.

## Pruebas requeridas

Los escenarios de aceptación, autorización pertinente, errores y no enumeración aplicable.

## Observabilidad / auditoría

Registrar actor cuando aplique, fecha y resultado sin contraseñas, tokens ni secretos.

## Prioridad

P0

## Estimación

S

## Traceability

Q-024; DEC-040; EL-TK-001; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** La aprobación de 2026-10-07 permanece histórica; este ajuste fue aprobado por el dictamen final de 2026-10-08.

- Requiere `ActorContext` administrativo de EL-TK-044 y coordinación con la revisión/reconciliación de EL-TK-046.
- La revocación es transaccional e idempotente: una carrera con activación no deja una invitación revocada que active una cuenta ni altera una cuenta activa existente.
- API REST/JSON/OpenAPI expresa permiso, estado inválido y resultado sin filtrar datos públicos; auditoría registra motivo/actor/resultado sin secretos.
- Pruebas: integración PostgreSQL real para revocar versus activar y rollback; API de autorización/conflicto; PITR conserva la revocación. Reuse RevokeInviteDialog sólo como referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Autenticación administrativa técnica de EL-TK-044 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
