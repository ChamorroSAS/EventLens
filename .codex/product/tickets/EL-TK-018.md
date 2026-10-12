# EL-TK-018 — Solicitar recuperación de contraseña

## Parent epic

EL-EP-001

## Status

DONE

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución. Implementado y validado en 2026-10-12 con PasswordResetService.requestPasswordReset, respuesta neutra anti-enumeración, token impredecible de 256 bits y pruebas unitarias/integración en PostgreSQL 16 real.

## User story

**Como** organizador con cuenta activa y verificada, **quiero** solicitar recuperación de contraseña por correo, **para** recibir una oportunidad de recuperar acceso sin enumerar cuentas.

## Alcance funcional

Una única responsabilidad: solicitar recuperación de contraseña por correo.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un correo de cuenta activa o sin cuenta activa, cuando solicita recuperación, entonces recibe resultado neutro equivalente.

### Escenario 2
Dado solicitudes repetidas, cuando alcanzan límite, entonces se limitan sin revelar si existe cuenta.

### Entregar recuperación válida
**Dado** una cuenta activa y verificada,
**Cuando** solicita recuperación por correo sin necesitar sesión,
**Entonces** emite y envía el token temporal impredecible de un solo uso, sin cambiar contraseña ni sesiones; la respuesta pública es neutra.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Solo para cuenta activa y verificada: emitir/envíar el token de recuperación mediante EL-EP-013. Fallo de entrega no revela existencia; no hay recuperación automática si se pierde el correo.

No se requiere sesión para solicitar recuperación.

## Validaciones y permisos

No se necesita sesión para solicitar recuperación. Solo una cuenta activa y verificada recibe el correo de recuperación; mensajes equivalentes y límites no revelan si existe cuenta. Un fallo de entrega no revela existencia.

## Casos de error y estados vacíos

Correo desconocido o sin cuenta activa recibe resultado neutro equivalente. Fallo de entrega no expone existencia; límite indica reintento posterior. No hay recuperación automática al perder el correo.

## Datos / contratos afectados

Solicitud y emisión/envío de token de recuperación mediante EL-EP-013. Token impredecible, temporal y de un solo uso; formato, almacenamiento y expiración PENDING técnico.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-011, EL-TK-046.
- **blocks:** EL-TK-019.
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

Q-014, Q-024; DEC-040; EL-TK-004; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por formato, almacenamiento y duración de token PENDING; no se decide aquí.

- Solicitud, límite e intención durable de correo se coordinan sin enumeración; aceptación no garantiza entrega y no registra token/secretos.
- Contrato REST/JSON/OpenAPI conserva respuesta pública neutra. Pruebas: Vitest, API rate-limit/no enumeración, PostgreSQL real de repetición/rollback y recovery que no revive grants/tokens viejos.
- ForgotPasswordForm y sus estados son referencia del handoff; no se crea frontend mientras gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Formato, almacenamiento y TTL de token de recuperación PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
