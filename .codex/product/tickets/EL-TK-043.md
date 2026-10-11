# EL-TK-043 — Provisionar un principal administrativo mediante alta controlada

## Parent epic

EL-EP-001

## Status

DONE

**CONFIRMED:** implementación aprobada; `REQUIREMENTS_READY: YES` y `READY_FOR_IMPLEMENTATION: YES` eran las puertas previas a ejecución. Se conservan la prioridad P0, el alcance y las dependencias históricas. Resultado y validación documentados al final del ticket.

## User story

**Como** operador autorizado, **quiero** provisionar un principal administrativo mediante un procedimiento controlado, **para** habilitar la administración BETA sin registro público ni autoelevación.

## Alcance funcional

Una responsabilidad: provisionar principales administrativos mediante altas controladas y auditadas según ARCH-013. El bootstrap inicial es una variante de un solo uso que queda deshabilitada; las altas posteriores emplean un procedimiento autorizado separado del bootstrap consumido.

## Fuera de alcance

Autenticación ordinaria del administrador (EL-TK-044), sus grants de intervención (MOD-007), múltiples roles internos, MFA obligatorio, proveedor de identidad, UI o secretos en frontend/repositorio.

## Criterios de aceptación

### Bootstrap controlado
**Dado** el procedimiento inicial habilitado y una identidad autorizada,
**Cuando** provisiona el principal administrativo,
**Entonces** se crea exactamente un principal auditable y el mecanismo inicial queda deshabilitado.

### Alta posterior controlada
**Dado** el bootstrap consumido y una identidad autorizada por el procedimiento de alta administrativa,
**Cuando** se solicita una alta posterior mediante ese procedimiento controlado,
**Entonces** se provisiona un principal administrativo auditable sin reabrir el bootstrap ni permitir autoelevación pública.

### Alta no autorizada
**Dado** un actor sin autorización de provisión,
**Cuando** intenta una alta administrativa posterior,
**Entonces** no se crea ni se eleva un principal y se registra el resultado sin secretos.

### Reintento o entrada pública
**Dado** bootstrap ya consumido o una entrada BETA pública,
**Cuando** intenta provisionar o enviar un campo de rol/administrador,
**Entonces** no obtiene privilegio administrativo ni se expone secreto alguno.

## Reglas de negocio

- No existe autoelevación desde registro BETA.
- Toda alta posterior exige identidad autorizada y procedimiento controlado/auditado; no reutiliza el bootstrap inicial ni introduce roles nuevos.
- Secretos bootstrap no aparecen en frontend, logs ni repositorio.

## Datos / contratos afectados

Principal administrativo de MOD-001, evidencia de procedimiento y evento de auditoría. No convierte modelos Prisma en contratos públicos.

## Dependencias técnicas y funcionales

ARCH-013, AQR-003, domain-map MOD-001/MOD-007 y testing-strategy AQR-003. La mecánica concreta de secreto/proveedor permanece neutral; no seleccionar tecnología DEFERRED.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-044.
- **can_parallelize_with:** EL-TK-005..019 mientras no requieran actor administrativo ejecutable.

## Pruebas requeridas

Vitest de elegibilidad para bootstrap y altas posteriores; integración PostgreSQL real de uso único/rollback y alta posterior autorizada; rechazo de alta posterior sin autorización y de autoelevación pública; auditoría de ambas variantes sin secretos. El ensayo post-PITR se cubre con EL-TK-046.

## Observabilidad / auditoría

Registrar procedimiento, actor autorizado, instante y resultado sin secreto ni grant.

## Prioridad

P0

## Estimación

S

## Traceability

GAP-EL-EP-001-02; ARCH-013; AQR-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-007/MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.** YES limitado a provisión operativa neutral. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.

## Resultado de implementación — 2026-10-11

**CONFIRMED:** implementación completada y validada de forma independiente contra PostgreSQL 16 real. Procedimiento de bootstrap inicial de un solo uso que crea exactamente un principal administrativo auditable y queda permanentemente deshabilitado; procedimiento de alta posterior autorizado y separado del bootstrap; prevención de autoelevación desde registro público; auditoría completa append-only con cero secretos en logs, repositorio y base de datos conforme a ARCH-013 y AQR-003.

Paquete e interfaces: [identity](../../../packages/identity/README.md). La validación independiente ejecutó 18/18 pruebas (12 unitarias de elegibilidad y guardas + 6 de integración PostgreSQL 16 real para atomicidad, concurrencia, rollback y auditoría); resultados: [registro](../../../infra/validation/identity/evidence/result.json) y [pruebas](../../../infra/validation/identity/evidence/tests.json). No implementa autenticación ordinaria (EL-TK-044), grants de intervención (MOD-007), interfaces de usuario ni proveedores externos de identidad.
