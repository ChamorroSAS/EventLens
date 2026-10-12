# EL-EP-001 — Incorporar y proteger organizadores de la beta privada

## Status

DONE

**CONFIRMED:** Los 19 tickets atómicos de EL-EP-001 (EL-TK-005..019, EL-TK-043..046) han sido implementados y verificados con 152 pruebas unitarias y de integración en PostgreSQL 16 real (100% pasando, 0 errores de tipos). Épica completada.

## Gate localizado de verifier — 2026-10-12

DEC-108 / ARCH-018: [contrato aceptado](../../context/organizer-password-verifier.md) tras auditoría de fuente y revisión de seguridad/crítica. REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES para verifier/migración, authority/sesiones/grants correctivos y challenge/consumidores definidos. No regenera login/admin ni declara código corregido. Gates de EL-TK-018/019 sobre token/política permanecen; no se certifica globalmente toda identidad, recovery ni Beta.

## Module

MOD-001

## Objective / outcome

Un adulto invitado obtiene una cuenta verificada y conserva control seguro de sus sesiones.

## Problem solved

Un registro abierto o una recuperación insegura expondrían eventos privados.

## Actors

Organizador; administrador autorizado.

## Scope

Invitar correos específicos, consultar/revocar invitaciones no usadas; registro, verificación, login, recuperación de contraseña y cierre de sesiones. Mensaje neutro de beta privada para no invitados; solicitud de acceso opcional.

## Out of scope

Registro público; MFA obligatorio; recuperación automática al perder el correo; eliminación de cuenta (EL-EP-015).

## Business rules

CONFIRMED: invitación → registro → verificación → cuenta activa. Solo organizadores adultos. Recuperación por correo, con invalidación de sesiones anteriores cuando corresponda; soporte excepcional si se pierde el correo.

CONFIRMED — DEC-065..068: si un administrador invita un correo con invitación vigente, se le indica que ya está pendiente y se conserva esa invitación. Si el correo ya tiene cuenta activa, se devuelve la invitación existente sin reactivarla ni cambiar la cuenta. Repetir un registro pendiente devuelve la invitación existente y conserva el registro y sus credenciales. La invitación BETA vence siete días después de generarse; tras expirar puede generarse otra, con un nuevo plazo de siete días.

## Main scenarios

Invitado verifica correo y accede; persona no invitada ve mensaje privado; organizador recupera contraseña y cierra sesiones; admin revoca invitación sin usar.

## Edge cases

Correo sin verificar; invitación revocada; token inválido/expirado; reenvíos; intentos repetidos; no revelar existencia de cuentas.

## Data

Cuenta, correo verificado, invitación, sesión, solicitud de acceso opcional, eventos de autenticación.

## Permissions

Admin gestiona invitaciones; organizador administra exclusivamente su cuenta; no invitados no obtienen cuenta activa.

## Integrations

Correo de cuenta (EL-EP-013); proveedor de autenticación PENDING de diseño técnico.

## Dependencies

Sin predecesora funcional dura; integra señales/servicios comunes cuando corresponda. Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

TLS, rate limiting, tokens impredecibles, mensajes sin enumeración; WCAG 2.2 AA; auditoría mínima.

## Success criteria

Registro sin invitación o correo no verificado no permite operar eventos; recuperación segura y cierre de sesiones verificables.

## Risks

Entrega de correo; toma de cuenta; soporte sin prueba de identidad.

PENDING técnico: expiración de tokens de verificación y mecanismo de autenticación; preservar invitación, correo verificado y recuperación segura. La vigencia de la invitación BETA es una regla confirmada de producto (DEC-068), no una decisión técnica pendiente.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: PARTIAL
READY_FOR_TICKET_WRITING: PARTIAL

UX_SCOPE: Invitaciones, registro/verificacion, login/recuperacion y sesiones; forms sensibles dependen de politica tecnica.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-001). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Politica tecnica de contrasena/tokens y comunicaciones013.

UX_OPEN_QUESTIONS: ninguna funcional nueva; gates tecnicos aplicables en el handoff.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

Sin preguntas BLOCKER de producto en este límite; las decisiones técnicas pendientes no se presentan como decisiones confirmadas.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-07: creación por product_planner con trazabilidad Q-014, Q-024; DEC-030, DEC-040; estado inicial READY; sin tickets.
- 2026-10-07: ticket_writer creó EL-TK-001 a EL-TK-004; pendientes de requirements_reviewer.
- 2026-10-07: CR-003 incorporó DEC-065..068 y Q-030..033 para aclarar duplicados y vigencia; EL-TK-001/002 requieren revisión de requirements_reviewer antes de cambiar su estado DRAFT.
- 2026-10-07: requirements_reviewer aprobó EL-TK-001..004 sin hallazgos pendientes; tickets actualizados a READY. [Dictamen](../sessions/2026-10-07-el-ep-001-ticket-review.md). Fin de planificación, sin implementación.

- 2026-10-07: EL-TK-001..004 pasan a SUPERSEDED sin implementación registrada; EL-TK-005..019 los reemplazan como DRAFT bajo estrategia atómica y requieren nuevo requirements_reviewer.
- 2026-10-07: requirements_reviewer aprobó el rediseño atómico EL-TK-005..019 sin hallazgos pendientes; nuevos tickets READY, EL-TK-001..004 SUPERSEDED. [Dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). Sin implementación ni avance a otra épica.
- 2026-10-12: Implementación y cierre de los 19 tickets de EL-EP-001 en `@eventlens/identity` mediante 3 rutas modulares (Ruta 1: EL-TK-006..009; Ruta 2: EL-TK-012, 014..017; Ruta 3: EL-TK-018, 019, 045). 152 pruebas unitarias y de integración en PostgreSQL 16 real (100% pasando). Épica formalmente en estado DONE.
