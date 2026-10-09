# EL-TK-017 — Cerrar todas mis otras sesiones

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** organizador autenticado, **quiero** cerrar todas mis otras sesiones, **para** retirar accesos conservando la sesión actual.

## Alcance funcional

Una única responsabilidad: cerrar todas mis otras sesiones.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado varias sesiones propias, cuando cierra todas las demás, entonces solo estas dejan de autorizar y la actual se conserva.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Exigir sesión autenticada vigente. Si no hay sesiones adicionales, el cierre no altera la actual ni falla; solo sesiones propias distintas de la actual se revocan.

## Validaciones y permisos

Exigir sesión autenticada vigente. Revocar únicamente sesiones propias distintas de la actual; no afectar cuentas ajenas. Sin sesiones adicionales, conservar la actual.

## Casos de error y estados vacíos

Si no hay sesiones adicionales, el cierre no altera la actual ni falla.

## Datos / contratos afectados

Sesiones propias distintas de la actual y su revocación; preserva la actual.

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

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Depende de contrato de sesión PENDING y EL-TK-046.

- Revoca atómicamente las otras sesiones propias, preservando la actual; revisión/epoch durable evita que PITR las reviva y una carrera no cierra otra cuenta.
- Contrato REST/JSON/OpenAPI expresa resultado confirmado y vacío sin datos ajenos. Pruebas: Vitest, PostgreSQL real de alcance/rollback, API ownership y PITR; SignOutOtherSessionsAction sólo referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de sesiones de EL-TK-013 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
