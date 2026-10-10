# EL-TK-072 — Aplicar restricciones de acceso según el lifecycle vigente

## Parent epic
EL-EP-003

## Status
READY

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
