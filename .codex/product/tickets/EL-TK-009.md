# EL-TK-009 — Revisar solicitudes de acceso BETA

## Parent epic

EL-EP-001

## Status

READY

**HISTÓRICO — revisión de remediación:** el snapshot de 2026-10-08 permaneció DRAFT hasta el dictamen final; la aprobación de 2026-10-07 se conserva.

**CONFIRMED:** requirements_reviewer aprobó este conjunto el 2026-10-07, sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** administrador autorizado, **quiero** inspeccionar las solicitudes de acceso BETA, **para** revisar el listado y una solicitud identificada sin conceder acceso.

## Alcance funcional

Inspección administrativa del listado y detalle de solicitudes. No introduce aprobación ni transición de estado.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado un administrador y una solicitud registrada, cuando la consulta o revisa, entonces puede verla sin crear invitación ni activar cuenta.

### Escenario 2
Dado lista vacía o solicitud inexistente, cuando consulta o revisa, entonces no modifica datos.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

La responsabilidad es inspección administrativa del listado/detalle, sin transición nueva. Solo admin autorizado; muestra vacío administrativo y una solicitud inexistente no modifica datos.

## Validaciones y permisos

Solo administradores autorizados inspeccionan el listado y el detalle de una solicitud identificada. La revisión es lectura, sin aprobación, invitación ni activación. Una consulta sin autorización no revela datos; la no enumeración se aplica a los flujos públicos.

## Casos de error y estados vacíos

Mostrar estado vacío administrativo si no hay solicitudes. Una solicitud inexistente no modifica datos ni concede acceso.

## Datos / contratos afectados

Listado y detalle de solicitudes de acceso, y auditoría de la revisión administrativa; sin transición adicional.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-008, EL-TK-044.
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

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Requiere `ActorContext` administrativo de EL-TK-044; mantiene lectura sin aprobación ni activación.

- El contrato REST/JSON/OpenAPI deniega actores no administrativos y expone vacío/error sin datos ajenos; auditoría de consulta sin información sensible.
- Pruebas: API de permiso/lista vacía y PostgreSQL real de consulta; `AccessRequestList/Detail` son referencia UX read-only bajo gate PARTIAL, sin UI nueva.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Autenticación administrativa técnica de EL-TK-044 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
