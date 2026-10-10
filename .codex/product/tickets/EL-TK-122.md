# EL-TK-122 — Integrar cola y resolución de casos en la consola administrativa

## Parent epic
EL-EP-009

## Status
READY

## User story
**Como** administración autorizada, **quiero** revisar y resolver casos desde una interfaz restringida, **para** aplicar intervención justificada con trazabilidad.

## Alcance funcional
Integrar AdminModerationPanel, ReportQueue, ReportDetail, ReportSeverityBadge y AdministrativeActionReason con clasificación, acceso justificado, ocultamiento y resolución.

## Fuera de alcance
Nueva consola paralela, impersonación, acceso a media sin motivo o funciones fuera del contrato.

## Criterios de aceptación
### Escenario 1
**Dado** admin abre cola, **cuando** navega, **entonces** ve casos sanitizados y prioridad.

### Escenario 2
**Dado** necesita inspeccionar media, **cuando** solicita acceso, **entonces** se exige motivo antes del preview.

### Escenario 3
**Dado** resuelve/oculta, **cuando** confirma, **entonces** la UI muestra resultado real y no afirma purga antes de completarse.

## Reglas de negocio
Sin preview sensible en listado. Acciones usan capacidades server-side.

## Validaciones y permisos
Sesión admin vigente y capabilities por acción.

## Casos de error y estados vacíos
Permiso vencido, caso resuelto concurrentemente, media no disponible, action failure y reauth si aplica.

## Datos / contratos afectados
Clientes EL-TK-116..120 y componentes admin existentes.

## Dependencias técnicas y funcionales
Consola EL-EP-012 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-117, EL-TK-118, EL-TK-119, EL-TK-120; contrato EL-EP-012
- **blocks:** EL-TK-123

## Pruebas requeridas
Cola/detalle, motivo, accesibilidad, actor ajeno, conflicto y resultado parcial.

## Observabilidad / auditoría
Acciones delegan auditoría a backend; UI no persiste media.

## Prioridad / estimación
P0 / M

## Traceability
DEC-019, DEC-088; EL-EP-009, EL-EP-012, EL-EP-014; ui-mvp-epic-review.md#el-ep-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
