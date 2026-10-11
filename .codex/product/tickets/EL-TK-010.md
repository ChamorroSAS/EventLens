# EL-TK-010 — Iniciar el registro de un organizador invitado

## Parent epic

EL-EP-001

## Status

DONE

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** adulto con una invitación BETA válida, **quiero** iniciar mi registro como organizador, **para** dejar una cuenta pendiente de verificación.

## Alcance funcional

Una única responsabilidad: iniciar mi registro como organizador.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Registro pendiente
**Dado** una invitación utilizable del mismo correo y declaración de adultez,
**Cuando** completa el registro,
**Entonces** crea una cuenta pendiente y emite la verificación inicial mediante EL-EP-013, sin permitir operar eventos.

### Rechazar registro no autorizado
**Dado** falta de declaración de adultez, correo distinto o invitación revocada, inválida, expirada o usada,
**Cuando** intenta registrarse,
**Entonces** se rechaza el registro sin crear cuenta pendiente ni activa; se informa la declaración requerida cuando corresponda sin revelar otras cuentas.

### Conservar registro pendiente
**Dado** un registro pendiente del mismo correo,
**Cuando** repite el registro,
**Entonces** devuelve la invitación existente y conserva registro y credenciales sin crear otra cuenta ni reenviar automáticamente la verificación.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

- Al aceptar el registro pendiente se emite la verificación inicial mediante el contrato de correo de EL-EP-013; EL-TK-012 cubre solo reenvíos posteriores.
- La falta de declaración de adultez rechaza el registro y no crea cuenta pendiente.
- La repetición devuelve explícitamente la invitación existente y no sustituye credenciales ni emite verificación.
- La cuenta pendiente no puede operar eventos.

## Validaciones y permisos

Exigir invitación válida y no usada que corresponda al correo del registro, dentro de siete días desde generación, y declaración obligatoria de adultez. No permitir registro público ni capacidades de organizador antes de verificar. Mensajes públicos neutros.

## Casos de error y estados vacíos

Sin invitación se muestra mensaje neutro de BETA privada y la solicitud opcional de EL-TK-008. Fallo de envío permite reintento controlado cuando proceda sin revelar estados.

## Datos / contratos afectados

Cuenta pendiente, correo, credenciales, invitación y evidencia mínima de declaración de adultez. Emisión inicial de verificación por EL-EP-013; proveedor, formato, almacenamiento y duración del token son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-005.
- **blocks:** EL-TK-011.
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

Q-021, Q-024, Q-032, Q-033; DEC-030, DEC-040, DEC-067, DEC-068; CR-003; EL-TK-002; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Bloqueado por el contrato técnico PENDING de contraseña y token de verificación; no se decide aquí.

- Cuenta pendiente, credencial, uso de invitación e intención durable de verificación se aceptan/revierten en una transacción; repetición y carrera no reemplazan credenciales ni duplican cuenta o correo.
- Contrato REST/JSON/OpenAPI conserva errores neutrales y validación; no expone DTOs internos/Prisma. La evidencia de adultez no incluye requisitos nuevos.
- Pruebas: Vitest de reglas; PostgreSQL real para repetición/concurrencia/rollback; API de no enumeración; recovery post-PITR no permite credencial restaurada antigua.
- OrganizerRegistrationForm y sus estados WCAG/responsive son referencia del handoff; no hay trabajo frontend hasta que el gate sea YES.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.** Implementación completada y verificada de registro de organizador con cuenta pendiente, credencial protegida e intención durable de verificación.

## Resultado de implementación — 2026-10-11

**CONFIRMED:** implementación completada y validada cumpliendo todos los criterios de aceptación de EL-TK-010, reglas de negocio y restricciones modulares de MOD-001.

- **Modelo de persistencia Prisma**: Implementados modelos `OrganizerAccount`, `OrganizerCredential` y `EmailVerificationIntent` en `packages/identity/prisma/schema.prisma` con migración `202610110018_organizer_registration`.
- **Servicio `OrganizerRegistrationService`**:
  - Declaración obligatoria de adultez: exige explícitamente `declaredAdult: true`; rechaza con `ADULT_DECLARATION_REQUIRED` sin tocar la base de datos si falta la declaración.
  - Validación de seguridad pública: previene cualquier inyección de campos administrativos o roles mediante `assertPublicRegistrationSafe`.
  - Validación de invitación utilizable: comprueba el token contra `beta_invitation` bajo `SELECT ... FOR UPDATE`, verificando coincidencia de correo, no expirada (7 días), no revocada y no consumida.
  - Escenario 1: Crea la cuenta con estado `PENDING_VERIFICATION`, genera la credencial protegida con separación de dominio (`computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password)`), persiste la intención durable de verificación en `email_verification_intent` y emite la notificación al puerto de EL-EP-013 (`EmailVerificationNotificationPort`), sin conceder permisos de acceso ni operación de eventos antes de la verificación.
  - Escenario 2: Rechazo neutral de intentos no autorizados, contraseñas débiles, correos mal formateados o invitaciones caducadas sin filtrar existencia de cuentas.
  - Escenario 3: Idempotencia y conservación: ante registro repetido con cuenta pendiente, devuelve la existente (`ALREADY_REGISTERED_PENDING`), conservando la cuenta y credencial original intactas y sin reenviar automáticamente la verificación.
  - Concurrencia y rollback: transacciones atómicas bajo PostgreSQL 16 con bloqueos de fila (`SELECT ... FOR UPDATE`) impidiendo condiciones de carrera y duplicados.
  - Auditoría append-only: registra eventos de auditoría sin exponer contraseñas ni tokens en texto plano.
- **Validación ejecutada**:
  - 10 pruebas automatizadas nuevas (7 unitarias + 3 de integración real contra PostgreSQL 16).
  - Suite de `@eventlens/identity` pasando al 100% (69/69 tests).
  - Workspace global: `typecheck`, `build` y suite de pruebas (`database`, `api`, `web`) pasando en verde.

