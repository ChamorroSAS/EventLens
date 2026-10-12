# EL-TK-072 — Aplicar restricciones de acceso según el lifecycle vigente

## Parent epic
EL-EP-003

## Status
DONE (2026-10-11)

## User story
**Como** sistema, **quiero** aplicar una política única de acceso basada en el lifecycle vigente, **para** impedir cargas o acceso general cuando el evento no lo permite.

## Alcance funcional
Resolver permisos generales por DRAFT/SCHEDULED/ACTIVE/CLOSED/GRACE_PERIOD/PENDING_DELETION/SUSPENDED/DELETED y preservar la excepción aprobada de Mis aportes/solicitudes propias de DEC-084.

## Fuera de alcance
Reglas particulares de moderación, retiro o purga física.

## Criterios de aceptación
### Escenario 1
**Dado** SCHEDULED, **cuando** un invitado entra, **entonces** puede recibir aviso autorizado pero no cargar.

### Escenario 2
**Dado** CLOSED/GRACE_PERIOD, **cuando** se evalúa carga o galería general, **entonces** se aplican las restricciones vigentes sin bloquear la excepción de Mis aportes/solicitudes propias con sesión válida.

### Escenario 3
**Dado** SUSPENDED/PENDING_DELETION/DELETED, **cuando** se evalúa acceso general, **entonces** falla cerrado según política y DELETED es terminal.

## Reglas de negocio
No deducir autorización desde estado visual del cliente.

## Validaciones y permisos
Policy central consumida por endpoints/handlers propietarios.

## Casos de error y estados vacíos
Estado desconocido o snapshot inconsistente falla cerrado.

## Datos / contratos afectados
LifecyclePolicy/capabilities; no crea nuevas credenciales.

## Dependencias técnicas y funcionales
Contratos de EL-EP-004/005/007/010 y excepción DEC-084.

## Dependencias de tickets
- **depends_on:** EL-TK-064, EL-TK-065, EL-TK-067, EL-TK-068, EL-TK-069, EL-TK-071.
- **blocks:** consumidores guest/upload/gallery/export según sus propias épicas.

## Pruebas requeridas
Matriz estado×capacidad, excepción Mis aportes, fallos cerrados y regresiones de acceso.

## Observabilidad / auditoría
Métricas/denegaciones sanitizadas sin datos privados innecesarios.

## Prioridad / estimación
P0 / M

## Traceability
Q-015; DEC-017, DEC-018, DEC-078, DEC-084; EL-EP-003, EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la policy central de autorización fail-closed que aplica permisos según lifecycle y preserva la excepción de Mis aportes de DEC-084, alineada con las capacidades expuestas en los componentes UI de EL-EP-003.

## Implementación y Verificación — 2026-10-11
- Implementado `EventAccessPolicy.evaluate(params: EvaluateAccessParams): AccessDecision` unificado en `@eventlens/event-management`.
- Cubre todos los estados del lifecycle: `DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`, `GRACE_PERIOD`, `PENDING_DELETION`, `SUSPENDED`, `ARCHIVED`, `DELETED`.
- Reglas comprobadas:
  - Escenario 1 (`SCHEDULED`): invitado puede ver landing page / notice (`GUEST_VIEW_LANDING: ALLOWED`), pero cargas y galería abierta bloqueadas (`UPLOADS_DISABLED`, `GALLERY_DISABLED`).
  - Escenario 2 (`CLOSED` / `GRACE_PERIOD`): cargas bloqueadas, galería general permitida solo si está habilitada, y preservación estricta de la excepción DEC-084 para ver propios aportes (`GUEST_VIEW_OWN_CONTRIBUTIONS`) o solicitar retiro (`GUEST_REQUEST_OWN_REMOVAL`) con sesión de invitado válida.
  - Escenario 3 (`SUSPENDED` / `PENDING_DELETION` / `DELETED`): falla cerrado estricto (`EVENT_SUSPENDED`, `EVENT_TERMINAL`).
  - Casos de error: Estados no reconocidos o eventos nulos retornan `FAIL_CLOSED`. No-enumeración de `DRAFT` para invitados (`EVENT_NOT_FOUND`).
- Validación en Docker oficial (`infra/validation/event-management/run.mjs`) con PostgreSQL 16: 106 tests PASS.

