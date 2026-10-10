# EL-TK-107 — Mover una media elegible a papelera conservando su estado previo

## Parent epic
EL-EP-008

## Status
READY

## User story
**Como** organizador propietario, **quiero** mover una media elegible a papelera, **para** retirarla temporalmente con opción de restauración durante siete días.

## Alcance funcional
Enviar a TRASHED media elegible según DEC-096, registrar previous_state y trash_started_at/deadline, retirarla de visibilidad/exportación y mantener consumo hasta borrado físico.

## Fuera de alcance
Contenido en procesamiento/carga, cuarentena, purga inmediata, casos graves de EL-EP-009 o retención jurídica.

## Criterios de aceptación
### Escenario 1
**Dado** media PUBLISHED, HIDDEN, PENDING_REVIEW o REJECTED, **cuando** el owner confirma papelera, **entonces** pasa a TRASHED y guarda el estado previo.

### Escenario 2
**Dado** PROCESSING/UPLOADED en curso o QUARANTINED, **cuando** el owner intenta papelera, **entonces** la acción no se ofrece ni se autoriza.

### Escenario 3
**Dado** PROCESSING_FAILED con inspección aprobada, **cuando** se solicita papelera, **entonces** solo se permite si el contrato de seguridad confirma elegibilidad.

## Reglas de negocio
TRASHED no es visible ni exportable; restaurable por siete días; continúa consumiendo almacenamiento hasta borrado físico.

## Validaciones y permisos
Solo propietario. Seguridad prevalece sobre papelera.

## Casos de error y estados vacíos
No elegible, inspección inconclusa, ya trashed, conflicto y actor ajeno.

## Datos / contratos afectados
TrashMedia command, previousState, trashedAt, restoreDeadline, purge eligibility.

## Dependencias técnicas y funcionales
Estado técnico EL-EP-006, biblioteca EL-EP-007 y purga coordinada con EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-053; contrato de seguridad EL-EP-006
- **blocks:** EL-TK-108, EL-TK-109, EL-TK-111, EL-TK-112

## Pruebas requeridas
Cada estado elegible/no elegible, fallo técnico seguro, cálculo de ventana, consumo y concurrencia.

## Observabilidad / auditoría
Auditar actor, estado previo, deadline y resultado.

## Prioridad / estimación
P0 / M

## Traceability
Q-019, Q-023; DEC-022, DEC-039, DEC-096; EL-EP-008, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-086/087/096 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §8.5..9; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
