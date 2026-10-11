# EL-TK-013 — Iniciar sesión como organizador verificado

## Parent epic

EL-EP-001

## Status

DONE (2026-10-11)

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** Implementado y validado el 2026-10-11. 89/89 pruebas automáticas superadas (61 unitarias + 28 de integración contra PostgreSQL 16 real). Suite de validación en Docker tools: PASS.

## User story

**Como** organizador con cuenta activa y verificada, **quiero** iniciar sesión, **para** obtener una sesión autenticada.

## Alcance funcional

Una única responsabilidad: iniciar sesión.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado credenciales válidas de una cuenta activa y verificada, cuando inicia sesión, entonces crea sesión autenticada.

### Escenario 2
Dado cuenta pendiente/no activa o credenciales inválidas, cuando intenta iniciar, entonces no obtiene sesión; intentos repetidos se limitan sin enumerar.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

La sesión creada usa TLS y tokens impredecibles según plataforma. Cuenta pendiente/no activa no obtiene sesión; respuesta neutra y rate limit no enumeran.

## Validaciones y permisos

Solo credenciales válidas de cuenta activa y verificada crean sesión de organizador. Credenciales inválidas y cuentas pendientes/no activas no obtienen sesión. Respuestas y rate limiting no enumeran cuentas.

## Datos / contratos afectados

Cuenta activa/verificada, credencial y sesión: titular, estado, creación, último uso y revocación. Proveedor, duración y formato de sesión son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-011, EL-TK-046.
- **blocks:** EL-TK-014, EL-TK-015, EL-TK-017, EL-TK-019, EL-TK-020.
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

Q-014, Q-024; DEC-030, DEC-040; EL-TK-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por mecanismo/duración de sesión y política de credencial PENDING; este ticket no autentica al principal administrativo de EL-TK-044.

- La emisión valida credential/auth revision y recovery epoch mediante EL-TK-046; snapshot/restauración no revive sesiones o hashes antiguos.
- Contrato REST/JSON/OpenAPI expresa credenciales inválidas y rate limit de forma neutra; no expone modelos Prisma/DTOs internos.
- Pruebas: Vitest; PostgreSQL real de sesión/revisión; API sin enumeración; PITR antes de login/reset; LoginForm es referencia de UX sin frontend bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de credencial/sesión PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.

## Resultado de implementación — 2026-10-11

- **Migración de base de datos**: Creada tabla `organizer_session` e índice `(account_id, revoked_at)` mediante migración `202610110020_organizer_session`.
- **Servicio y contratos**: `OrganizerAuthenticationService` (`login`, `validateSession`) implementado en `@eventlens/identity` con verificación en tiempo constante (`timingSafeEqual`, dummy digest para cuentas inexistentes) y respuesta neutra `UNAUTHENTICATED`.
- **Protección contra enumeración y rate limiting**: Cuentas en estado `PENDING_VERIFICATION` son rechazadas de manera uniforme sin revelar su existencia o estado; umbral de intentos fallidos dispara `RATE_LIMITED`.
- **Gestión de sesiones**: Emisión de tokens de 256 bits (`__Host-el_session`), persistiendo únicamente su digest SHA-256 en PostgreSQL, con expiración absoluta a 8 horas y timeout por inactividad de 30 minutos con extensión monótona.
- **Integración RecoveryAuthority (AQR-001)**: Verificación estricta de revisión de credenciales y epoch post-PITR, fallando cerrado si el estado de la base de datos es anterior a la autoridad externa.
- **Validación automatizada**:
  - 6 pruebas unitarias (`packages/identity/test/organizer-auth.unit.test.ts`).
  - 4 pruebas de integración contra PostgreSQL 16 real (`packages/identity/test/organizer-auth.integration.test.ts`).
  - Suite de identidad completa: 89/89 pruebas PASS en Docker `tools` (evidencia en `infra/validation/identity/evidence/result.json`).
  - Monorepo typecheck y test suites limpios (`node scripts/workspace.mjs typecheck`, `node scripts/workspace.mjs test`).
