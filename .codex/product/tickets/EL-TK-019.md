# EL-TK-019 — Completar una recuperación de contraseña

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** organizador con una recuperación válida, **quiero** establecer una nueva contraseña, **para** recuperar acceso sin conservar sesiones comprometidas.

## Alcance funcional

Una única responsabilidad: establecer una nueva contraseña.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado una recuperación válida, cuando establece nueva contraseña, entonces se modifica y las sesiones anteriores de esa cuenta dejan de autorizar.

### Escenario 2
Dado token inválido, expirado, usado o revocado, cuando intenta restablecer, entonces no modifica contraseña ni sesiones.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

- Solo una recuperación de una cuenta activa y verificada puede completarse.
- El token es impredecible, temporal y de un solo uso; su duración, almacenamiento y política de contraseña permanecen PENDING técnico.
- Un token inválido, expirado, usado o revocado no modifica contraseña ni sesiones.
- La invalidación afecta únicamente las sesiones de la misma cuenta.
- Si no existen sesiones previas, una recuperación válida no falla.
- No se requiere sesión para completar una recuperación válida.

Los intentos de completar recuperación se limitan. Validar la nueva contraseña según política técnica PENDING. Auditar el número de sesiones revocadas sin exponer secretos.

## Validaciones y permisos

No se necesita sesión para completar una recuperación válida. Validar token y nueva contraseña según política técnica PENDING; limitar intentos. Revocar exclusivamente sesiones de la misma cuenta, sin alterar cuentas ajenas.

## Casos de error y estados vacíos

Token inválido, expirado, usado o revocado no modifica contraseña ni sesiones. Si no existen sesiones previas, una recuperación válida no falla; puede solicitar otra recuperación bajo los controles aplicables.

## Datos / contratos afectados

Token de recuperación, credencial y sesiones anteriores revocadas; evidencia mínima y evento de notificación. Política de contraseña y formato/almacenamiento/expiración del token son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-013, EL-TK-018, EL-TK-046.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos de EL-EP-013 y EL-EP-014 solo mediante interfaces acordadas; no requiere ejecución paralela.

## Pruebas requeridas

Los escenarios de aceptación, autorización pertinente, errores y no enumeración aplicable.

## Observabilidad / auditoría

Registrar resultado de recuperación y número de sesiones revocadas sin contraseñas, tokens ni secretos; emitir el evento de notificación correspondiente.

## Prioridad

P0

## Estimación

S

## Traceability

Q-014, Q-024; DEC-040; EL-TK-004; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por política de contraseña/token PENDING y por EL-TK-046.

- Consumo único del token, cambio de credencial, revocación de sesiones e intención de comunicación/auditoría se aceptan/revierten coordinadamente; carreras no consumen dos veces ni conservan sesiones comprometidas.
- Revisión/epoch en RecoveryAuthority impide recuperar hash, token o sesión antiguos tras PITR; falla cerrada ante reconciliación incompleta.
- Contrato REST/JSON/OpenAPI distingue token inválido/expirado/usado/revocado sin filtrar cuentas; no expone DTOs internos/Prisma.
- Pruebas: Vitest; PostgreSQL real de consumo concurrente/rollback; API; ejercicio PITR antes de reset; ResetPasswordForm sólo referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Política de contraseña y token de recuperación PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
