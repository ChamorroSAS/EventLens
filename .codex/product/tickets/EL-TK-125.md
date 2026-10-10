# EL-TK-125 — Crear una solicitud de exportación con snapshot fijo de elegibles

## Parent epic
EL-EP-010

## Status
READY

## User story
**Como** organizador propietario, **quiero** solicitar una exportación total de mis recuerdos elegibles, **para** preparar una descarga consistente aunque el evento siga cambiando.

## Alcance funcional
Crear ExportRequest con snapshot fijo de media PUBLISHED/HIDDEN elegible al instante de solicitud, registrar exclusiones y evitar ampliación silenciosa posterior.

## Fuera de alcance
Empaquetar inmediatamente, incluir estados excluidos, exportación por categorías o entregar URLs.

## Criterios de aceptación
### Escenario 1
**Dado** evento con PUBLISHED/HIDDEN elegibles, **cuando** owner solicita exportación, **entonces** se fija el manifiesto y queda REQUESTED/PENDING.

### Escenario 2
**Dado** no hay media elegible, **cuando** solicita, **entonces** se informa sin crear una exportación vacía engañosa.

### Escenario 3
**Dado** aparece nueva media después, **cuando** se prepara, **entonces** no se incorpora al snapshot original.

## Reglas de negocio
DEC-046/090: snapshot al solicitar; por defecto solo PUBLISHED/HIDDEN.

## Validaciones y permisos
Owner del evento; acceso vigente al momento de solicitar.

## Casos de error y estados vacíos
Sin elegibles, actor ajeno, request duplicado idempotente y conflicto.

## Datos / contratos afectados
ExportRequest, manifest snapshot, selectedMediaIds/versions, exclusions, requestedAt.

## Dependencias técnicas y funcionales
Biblioteca/moderación EL-EP-007/008.

## Dependencias de tickets
- **depends_on:** EL-TK-098; contrato EL-EP-008
- **blocks:** EL-TK-126, EL-TK-128, EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
Snapshot, exclusiones, nueva media posterior, vacío, cross-event e idempotencia.

## Observabilidad / auditoría
Auditar solicitud y conteos, no contenido.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-046, DEC-090; EL-EP-010, EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-009/013/046..049/063/064/075/079/090 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §9.1..8; sin componentes nuevos ni centros de exportación paralelos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
