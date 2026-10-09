# EL-TK-014 — Consultar mis sesiones activas

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** organizador autenticado, **quiero** consultar mis sesiones activas, **para** conocer los accesos que controlo.

## Alcance funcional

Una única responsabilidad: consultar mis sesiones activas.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un organizador autenticado, cuando consulta sesiones, entonces ve solo las propias.

### Escenario 2
Dado que no hay sesiones adicionales, cuando consulta, entonces ve estado vacío.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Exigir sesión autenticada vigente; sesiones ausentes, vencidas o revocadas no autorizan ni exponen información.

## Validaciones y permisos

Exigir sesión autenticada vigente y mostrar exclusivamente sesiones del organizador. Sesiones ausentes, vencidas o revocadas no autorizan la consulta ni exponen información de terceros.

## Casos de error y estados vacíos

Sin sesiones adicionales, mostrar estado vacío. Sesiones ausentes, vencidas, revocadas o ajenas no autorizan ni exponen datos.

## Datos / contratos afectados

Lectura de sesiones propias activas: titular, estado, creación, último uso y revocación; sin prescribir UI.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-013, EL-TK-046.
- **blocks:** EL-TK-016.
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

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Depende de la sesión/revisión/epoch pendiente de EL-TK-013 y EL-TK-046.

- Consulta sólo sesiones propias vigentes según ActorContext; contrato REST/JSON/OpenAPI cubre vacío, expiración y denegación sin filtrar terceros.
- Pruebas: API de ownership/vacío, integración PostgreSQL para consulta consistente y PITR que no muestra sesión revocada. SessionList/SessionItem son referencia UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de sesiones de EL-TK-013 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
