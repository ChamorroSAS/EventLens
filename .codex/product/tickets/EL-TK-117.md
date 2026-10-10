# EL-TK-117 — Autorizar acceso administrativo justificado a la media de un caso

## Parent epic
EL-EP-009

## Status
READY

## User story
**Como** administración autorizada, **quiero** justificar y abrir la media estrictamente necesaria de un caso, **para** investigar sin acceso indiscriminado a recuerdos privados.

## Alcance funcional
Exigir motivo y autorización vigente antes de emitir preview/grant temporal administrativo de la media asociada al caso.

## Fuera de alcance
Impersonación, navegación libre por galería privada, descarga de original no autorizada o acceso sin justificación.

## Criterios de aceptación
### Escenario 1
**Dado** un caso requiere inspección, **cuando** admin registra motivo válido, **entonces** se emite acceso temporal al recurso estrictamente necesario.

### Escenario 2
**Dado** no hay motivo/permisos, **cuando** se solicita preview, **entonces** se deniega.

### Escenario 3
**Dado** el permiso o caso cambia antes del grant, **cuando** se revalida, **entonces** no se emite nueva autorización.

## Reglas de negocio
Acceso administrativo a media siempre justificado/auditado; storage permanece privado.

## Validaciones y permisos
Admin autorizado con capability específica y revalidación server-side.

## Casos de error y estados vacíos
Sin permiso, motivo ausente, media no disponible, caso cerrado/restringido y URL expirada.

## Datos / contratos afectados
AdministrativeMediaAccessGrant, reason, caseId, mediaId, expiresAt.

## Dependencias técnicas y funcionales
Auth admin EL-TK-044, MediaViewGrant/Storage y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-044, EL-TK-097; contrato EL-EP-014
- **blocks:** EL-TK-118, EL-TK-119, EL-TK-122, EL-TK-123

## Pruebas requeridas
Motivo obligatorio, grant temporal, actor ajeno, revalidación y auditoría.

## Observabilidad / auditoría
Auditar quién, por qué, qué recurso y resultado; nunca URL completa.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-019, DEC-088; EL-EP-009, EL-EP-012, EL-EP-014.

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
