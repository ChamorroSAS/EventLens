# EL-TK-016 — Cerrar una sesión propia seleccionada

## Parent epic

EL-EP-001

## Status

DONE

**IMPLEMENTADO Y VERIFICADO (2026-10-12):** Implementado `OrganizerAuthenticationService.revokeSpecificSession` en `@eventlens/identity`. Revoca atómicamente una sesión propia seleccionada (`REVOKED_BY_USER`), preserva la sesión actual intacta si no fue la elegida, garantiza anti-enumeración estricta y aislamiento fallando cerrado con `SESSION_NOT_FOUND` ante sesiones inexistentes o pertenecientes a otros organizadores, es idempotente ante sesiones ya revocadas (`ALREADY_REVOKED`), y audita el evento (`ORGANIZER_SESSION_REVOKED`). Verificado con tests unitarios y de integración PostgreSQL 16 real.

## User story

**Como** organizador autenticado, **quiero** cerrar una de mis sesiones activas, **para** retirar un acceso específico que ya no controlo.

## Alcance funcional

Una única responsabilidad: cerrar una de mis sesiones activas.

## Fuera de alcance

Comportamientos asignados a otros tickets de EL-EP-001 y los límites del épico.

## Criterios de aceptación

### Escenario 1
Dado una sesión propia seleccionada, cuando la cierra, entonces solo esa sesión deja de autorizar.

### Escenario 2
Dado sesión ajena, inexistente, vencida o revocada, cuando intenta cerrarla, entonces no modifica ni expone información.

## Reglas de negocio

Se aplican exclusivamente las reglas confirmadas del épico y la trazabilidad indicada; no se resuelven decisiones técnicas PENDING.

Exigir sesión autenticada vigente y propiedad de la sesión objetivo; sesión ajena/ausente/vencida/revocada no cambia datos.

## Validaciones y permisos

Exigir sesión autenticada vigente y propiedad de la sesión objetivo. Una sesión ajena, inexistente, vencida o revocada no se modifica ni revela datos. La sesión actual se conserva si no fue seleccionada.

## Casos de error y estados vacíos

Una sesión ajena, inexistente, vencida o revocada no se modifica ni expone información.

## Datos / contratos afectados

Sesión propia seleccionada y su revocación; consume listado de EL-TK-014.

## Dependencias técnicas y funcionales

Requiere los tickets de depends_on. EL-EP-013 y EL-EP-014 aportan comunicación y auditoría mediante contratos acordados, sin predecesora dura completa. Hereda los requisitos aplicables de EL-EP-001: TLS, rate limiting, tokens impredecibles, no enumeración, WCAG 2.2 AA y auditoría mínima. Las decisiones técnicas PENDING no se presentan como confirmadas.

## Dependencias de tickets

- **depends_on:** EL-TK-014, EL-TK-046.
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

Q-014; DEC-040; EL-TK-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Re-evaluación aprobada — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Depende de contrato de sesión PENDING y EL-TK-046.

- Revoca exclusivamente una sesión propia seleccionada, idempotente y con revisión durable; una carrera o sesión ya revocada no afecta otras sesiones.
- Contrato REST/JSON/OpenAPI cubre ownership, ausencia/expiración y conflicto sin filtrar terceros. Pruebas: API, PostgreSQL real de carrera/rollback y PITR previo al cierre; confirmación UX bajo gate PARTIAL.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de sesiones de EL-TK-013 PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
