# EL-TK-045 — Revocar un principal administrativo

## Parent epic

EL-EP-001

## Status

READY

## User story

**Como** procedimiento administrativo autorizado, **quiero** revocar un principal administrativo, **para** retirar su identidad, sesiones y grants sin reactivar privilegios tras recuperación.

## Alcance funcional

Una responsabilidad: revocar el principal administrativo y propagar la invalidación de identidad, sesiones y grants mediante los contratos propietarios.

## Fuera de alcance

Conceder, modificar o evaluar grants de MOD-007; eliminar evidencia; gestión UI; proveedor de identidad; recuperación de contraseñas de organizadores.

## Criterios de aceptación

### Revocación válida
**Dado** un procedimiento autorizado y principal administrativo vigente,
**Cuando** lo revoca,
**Entonces** su identidad, sesiones y grants dejan de autorizar y la revisión se registra para reconciliación.

### Reintento y restauración
**Dado** una revocación ya aplicada o un snapshot anterior a ella,
**Cuando** se reintenta o se recupera la base,
**Entonces** el principal no recupera privilegios y el resultado se conserva idempotente.

## Reglas de negocio

- La revocación no otorga grants ni modifica recursos de otros módulos directamente.
- MOD-007 conserva ownership de grants y expone la invalidación por contrato.
- Si RecoveryAuthority no confirma la restricción pertinente, el scope permanece cerrado.

## Datos / contratos afectados

Estado/revisión de principal administrativo, sesiones, referencia de invalidación de grants y facts de RecoveryAuthority. REST/JSON/OpenAPI con errores de permiso/estado sin secretos ni DTOs internos.

## Dependencias técnicas y funcionales

ARCH-010, ARCH-013, AQR-001/003; contrato MOD-007 y EL-TK-044/046. No crea un segundo mecanismo de recovery.

## Dependencias de tickets

- **depends_on:** EL-TK-044, EL-TK-046.
- **blocks:** ninguno.
- **can_parallelize_with:** EL-TK-005..019 que no consuman contexto administrativo revocable.

## Pruebas requeridas

Vitest de idempotencia; PostgreSQL real de invalidación coordinada/rollback; API de permiso; ejercicio PITR previo a revocación que niegue identidad/sesiones/grants; auditoría sin secretos.

## Observabilidad / auditoría

Registrar procedimiento, motivo/referencia autorizada, principal y resultado sin secreto o grant completo.

## Prioridad

P0

## Estimación

S

## Traceability

GAP-EL-EP-001-04; ARCH-010, ARCH-013; AQR-001, AQR-003; EL-EP-001.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Consume autenticación administrativa de EL-TK-044, cuyo contrato técnico sigue PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.
