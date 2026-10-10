# EL-TK-071 — Consultar lifecycle y capacidades vigentes de un evento

## Parent epic
EL-EP-003

## Status
READY

## User story
**Como** organizador, administrador o invitado autorizado, **quiero** consultar el estado temporal efectivo del evento, **para** saber qué acciones están realmente permitidas.

## Alcance funcional
Exponer snapshot autorizado con estado, fechas relevantes y capacidades derivadas por actor sin duplicar reglas en frontend.

## Fuera de alcance
Ejecutar transiciones o exponer datos administrativos a invitados.

## Criterios de aceptación
### Escenario 1
**Dado** un actor autorizado, **cuando** consulta lifecycle, **entonces** recibe estado efectivo, timestamps permitidos y acciones/capacidades vigentes.

### Escenario 2
**Dado** un invitado, **cuando** consulta disponibilidad, **entonces** recibe solo información necesaria para explicar acceso/cierre/gracia sin filtrar datos privados.

### Escenario 3
**Dado** una transición automática concurrente, **cuando** consulta, **entonces** el snapshot refleja la revisión vigente y no una mezcla de estados.

## Reglas de negocio
El servidor es autoridad de capacidades. No existe EXPIRED.

## Validaciones y permisos
Respuesta diferenciada por organizador/admin/invitado.

## Casos de error y estados vacíos
Evento no accesible devuelve respuesta acorde a política sin enumeración indebida.

## Datos / contratos afectados
LifecycleSnapshot/capabilities, status, scheduledAt, expiresAt, graceEndsAt, timezone.

## Dependencias técnicas y funcionales
Consume las reglas de lifecycle y contratos de acceso de MOD-002/MOD-003.

## Dependencias de tickets
- **depends_on:** EL-TK-063, EL-TK-064, EL-TK-065, EL-TK-066, EL-TK-067, EL-TK-068, EL-TK-069, EL-TK-070.
- **blocks:** EL-TK-072, EL-TK-073.

## Pruebas requeridas
Snapshots por actor/estado, no enumeración, carrera con transición y esquema API/OpenAPI.

## Observabilidad / auditoría
Lecturas ordinarias sin auditoría sensible; denegaciones administrativas según política.

## Prioridad / estimación
P0 / M

## Traceability
Q-015; DEC-017, DEC-077, DEC-078, DEC-081, DEC-082; EL-EP-003.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el endpoint y contrato API de LifecycleSnapshot y capabilities que alimenta EventLifecyclePanel y EventAccessStatus en el organizador y pantallas de invitado según el handoff UI/UX de EL-EP-003.
