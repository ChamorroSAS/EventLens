# EL-TK-015 — Cerrar mi sesión actual

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** organizador autenticado, **quiero** cerrar mi sesión actual, **para** retirar el acceso de este dispositivo.

## Alcance funcional

Una única responsabilidad: cerrar mi sesión actual.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un organizador autenticado, cuando cierra su sesión actual, entonces esa sesión deja de autorizar solicitudes posteriores.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Exigir sesión autenticada vigente; sesión ausente, vencida o revocada no puede cerrarse de nuevo.

## Validaciones y permisos

Exigir sesión autenticada vigente y cerrar exclusivamente la sesión actual propia. Una sesión ausente, vencida o revocada no autoriza operaciones; el cierre no altera sesiones de otros organizadores.

## Casos de error y estados vacíos

Una sesión ausente, vencida o revocada no autoriza solicitudes posteriores ni modifica sesiones ajenas.

## Datos / contratos afectados

Sesión actual propia y su estado de revocación; eventos mínimos de cierre.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-013, EL-TK-046.
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

Q-014; DEC-040; EL-TK-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Depende de contrato de sesión PENDING y de la reconciliación de EL-TK-046.

- La revocación de la sesión actual es idempotente y durable; registra la revisión en RecoveryAuthority antes de ACK y falla cerrada si no puede reconciliarse post-PITR.
- Contrato REST/JSON/OpenAPI expresa sesión ausente/expirada sin afectar terceros; no expone DTOs internos/Prisma.
- Pruebas: Vitest; PostgreSQL real de revocación/rollback; API de ownership; PITR previo al cierre. La confirmación de alcance y `SessionItem` son referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de sesiones de EL-TK-013 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
