# EL-TK-012 — Reenviar la verificación de correo

## Parent epic

EL-EP-001

## Status

DONE

**IMPLEMENTADO Y VERIFICADO (2026-10-12):** Implementado `EmailVerificationService.resendVerificationEmail` en `@eventlens/identity`. Cumple con validación RFC 5322, rate-limiting, respuesta neutra anti-enumeración (`RESEND_ACCEPTED`), reemplazo como `SUPERSEDED` de intents previos, emisión de token 256-bit unguessable, despacho a `EmailVerificationNotificationPort` y auditoría append-only sin tokens (`ORGANIZER_EMAIL_VERIFICATION_RESENT`). Verificado con pruebas unitarias y de integración en PostgreSQL 16.

## User story

**Como** organizador con registro pendiente, **quiero** solicitar el reenvío de mi verificación, **para** poder completar el registro.

## Alcance funcional

Una única responsabilidad: solicitar el reenvío de mi verificación.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un registro pendiente, cuando solicita reenvío, entonces se procesa con rate limiting y sin enumeración.

### Escenario 2
Dado que excede el límite, cuando solicita reenvío, entonces no modifica credenciales ni activa cuenta.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

- El reenvío aplica solo al registro pendiente correspondiente y no revela cuentas ni cambia credenciales.
- El fallo de entrega conserva un reintento controlado y neutro.

## Validaciones y permisos

El reenvío solo corresponde al registro pendiente del correo, se limita y no revela cuentas, no cambia credenciales ni activa cuenta. El fallo de entrega permite reintento controlado y neutro.

## Casos de error y estados vacíos

Al alcanzar el límite, no cambiar credenciales ni activar cuenta. Un fallo de entrega permite reintento controlado y neutro.

## Datos / contratos afectados

Registro pendiente y emisión de verificación mediante el contrato de EL-TK-011 y correo de EL-EP-013; no sustituye credenciales. Mecanismo y expiración del token son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-011.
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

Q-024, Q-032; DEC-040, DEC-067; EL-TK-002; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por el contrato técnico del token/reenvío PENDING; no se fija aquí su duración o almacenamiento.

- Límite, cambio e intención durable de comunicación se coordinan transaccionalmente; aceptación no promete entrega. Retry no revela existencia ni emite secretos en auditoría.
- Contrato REST/JSON/OpenAPI conserva error/rate limit neutros. Pruebas: Vitest, API, PostgreSQL real de límite/repetición/rollback y evidencia de intención; `EmailVerificationState` sólo referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Política de token y reenvío PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
