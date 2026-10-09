# EL-TK-008 — Solicitar acceso a la BETA

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** persona sin invitación válida, **quiero** solicitar acceso a la BETA, **para** dejar una solicitud para revisión sin obtener una cuenta.

## Alcance funcional

Una única responsabilidad: solicitar acceso a la BETA.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado una persona sin invitación válida, cuando solicita acceso, entonces puede dejar la solicitud sin obtener cuenta activa ni información sobre cuentas, invitaciones o solicitudes previas.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Validar formato de correo sin revelar si existe cuenta, invitación o solicitud; la solicitud no activa cuenta.

## Validaciones y permisos

El flujo público permite dejar una solicitud opcional sin sesión ni cuenta activa. Validar formato de correo; un correo inválido no crea registros. No revelar existencia de cuentas, invitaciones ni solicitudes previas.

## Casos de error y estados vacíos

Un correo inválido no crea solicitud. El resultado público no informa si existen cuenta, invitación o solicitud previa.

## Datos / contratos afectados

Solicitud de acceso para revisión administrativa; no crea invitación ni cuenta.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-009.
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

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el backend independiente.** La UI de `AccessRequestForm` queda fuera de ejecución mientras el gate frontend de EL-EP-001 sea PARTIAL; la aprobación previa es histórica hasta nuevo dictamen.

- Contrato REST/JSON/OpenAPI público conserva respuesta neutra, validación y rate limit sin enumeración; no usa DTOs internos/Prisma como contrato.
- Persistencia y auditoría de la solicitud son atómicas; no requiere autenticación ni depende de políticas de contraseña/tokens/sesiones.
- Pruebas: Vitest de validación/no enumeración, API de rate limit/error y PostgreSQL real para persistencia/deduplicación si se aplica. El handoff define loading/error/success, accesibilidad y responsive, sin crear ticket frontend.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.** YES limitado al backend público; frontend permanece bajo UI PARTIAL. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
