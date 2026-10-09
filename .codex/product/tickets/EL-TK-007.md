# EL-TK-007 — Consultar invitaciones BETA

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador autorizado, **quiero** consultar el estado de las invitaciones BETA, **para** controlar el acceso sin modificar invitaciones.

## Alcance funcional

Una única responsabilidad: consultar el estado de las invitaciones BETA.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un administrador autorizado, cuando consulta invitaciones, entonces ve sus estados administrativos.

### Escenario 2
Dado que no hay invitaciones o no es administrador, cuando consulta, entonces recibe estado vacío o rechazo sin datos.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

## Validaciones y permisos

Solo administradores autorizados consultan correos y estados administrativos de las invitaciones. Una consulta sin autorización no revela datos. La no enumeración se exige en los flujos públicos, sin impedir esta consulta administrativa.

## Casos de error y estados vacíos

Si no hay invitaciones, mostrar estado vacío administrativo. Sin autorización, rechazar sin datos.

## Datos / contratos afectados

Lectura del correo y estado de invitaciones BETA; sin mutaciones.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-005, EL-TK-044.
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

Q-024; DEC-040; EL-TK-001; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Requiere `ActorContext` administrativo de EL-TK-044; la aprobación previa es histórica.

- Contrato REST/JSON/OpenAPI de lectura sólo para administración, con vacío y denegación sin revelar invitaciones a actores públicos; no expone DTOs internos/Prisma.
- Pruebas: API de autorización/lista vacía, Vitest de elegibilidad de lectura y PostgreSQL real donde la proyección de invitaciones lo requiera; auditoría de consulta según EL-EP-014.
- BetaInviteList y sus estados/reponsive/WCAG 2.2 AA siguen el handoff aprobado, sin generar frontend hasta cerrar el gate local.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Autenticación administrativa técnica de EL-TK-044 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
