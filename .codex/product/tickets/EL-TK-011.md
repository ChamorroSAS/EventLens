# EL-TK-011 — Verificar el correo y activar una cuenta pendiente

## Parent epic

EL-EP-001

## Status

DONE (2026-10-11)

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** Implementado y validado el 2026-10-11. 79/79 pruebas automáticas superadas (55 unitarias + 24 de integración contra PostgreSQL 16 real). Suite de validación en Docker tools: PASS.

## User story

**Como** organizador con registro pendiente, **quiero** verificar mi correo, **para** activar mi cuenta organizadora.

## Alcance funcional

Una única responsabilidad: verificar mi correo.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Activar tras verificar
**Dado** una cuenta pendiente, verificación válida de su correo e invitación todavía utilizable dentro de siete días,
**Cuando** confirma el correo,
**Entonces** activa la cuenta y consume la invitación como usada.

### Bloquear antes de verificar
**Dado** una cuenta pendiente sin correo verificado,
**Cuando** intenta acceder como organizador u operar eventos,
**Entonces** no obtiene esas capacidades.

### Rechazar verificación no utilizable
**Dado** token inválido o expirado, o invitación revocada, inválida, expirada o usada,
**Cuando** intenta completar activación,
**Entonces** no activa cuenta ni altera credenciales, y conserva el registro pendiente cuando corresponda.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

- La invitación debe seguir utilizable dentro de sus siete días al completar activación; revocada, expirada o usada no activa una cuenta.
- Solo quien controla el correo correspondiente completa la verificación.
- Antes de verificar no accede ni opera eventos.
- Token inválido o expirado conserva el pendiente; el fallo de entrega permite reintento controlado y neutro.
- Duración, formato y almacenamiento del token siguen PENDING técnico.

## Validaciones y permisos

Solo quien controla el correo correspondiente completa una verificación válida. La invitación debe continuar utilizable dentro de sus siete días al completar activación. Una cuenta pendiente no obtiene acceso ni opera eventos.

## Casos de error y estados vacíos

Token inválido o expirado conserva el registro pendiente y permite reenvío controlado de EL-TK-012. Invitación no utilizable no activa cuenta. Fallos de correo permiten reintento cuando proceda sin revelar estados.

## Datos / contratos afectados

Cuenta, correo verificado y activación; invitación consumida como usada y evidencia de verificación. Duración, formato y almacenamiento del token siguen PENDING técnico, distintos de la vigencia de invitación.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-010, EL-TK-046.
- **blocks:** EL-TK-012, EL-TK-013, EL-TK-018.
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

Q-024; DEC-040; EL-TK-002; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por duración, almacenamiento y revisión/epoch del token de verificación, aún PENDING técnico.

- Activación y consumo único se ejecutan atómicamente; carreras, token revocado/expirado y rollback no activan ni consumen dos veces.
- Expone contrato REST/JSON/OpenAPI con error de token sin filtrar cuentas; no expone DTOs internos/Prisma. RecoveryAuthority de EL-TK-046 preserva la revisión/epoch post-PITR.
- Pruebas: Vitest; PostgreSQL real de consumo único/concurrencia; API de token inválido; PITR antes de verificación. EmailVerificationState queda referenciado, sin frontend mientras gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** TTL y almacenamiento de token de verificación PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.

## Resultado de implementación — 2026-10-11

- **Migración de esquema**: Añadida columna `verified_at TIMESTAMPTZ` a `organizer_account` mediante migración `202610110019_organizer_account_activation`.
- **Servicio y contratos**: `EmailVerificationService` (`verifyEmailAndActivate`, `assertOrganizerActive`) en `@eventlens/identity`, consumiendo atómicamente la invitación BETA y el token de verificación, y actualizando la cuenta a `ACTIVE`.
- **Guarda de acceso**: Implementada la comprobación estricta `assertOrganizerActive` para bloquear capacidades de organizador en cuentas no verificadas.
- **Idempotencia**: Verificación de cuentas ya activas devuelve de forma segura `ALREADY_ACTIVE` sin mutaciones colaterales.
- **Validación automatizada**:
  - 6 pruebas unitarias (`packages/identity/test/verification.unit.test.ts`).
  - 4 pruebas de integración contra PostgreSQL 16 real en contenedor Docker (`packages/identity/test/verification.integration.test.ts`).
  - Suite completa de identidad: 79/79 pruebas PASS en Docker `tools` (evidencia en `infra/validation/identity/evidence/result.json`).
  - Typecheck y build limpios en todo el monorepo (`node scripts/workspace.mjs typecheck`).
