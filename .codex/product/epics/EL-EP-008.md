# EL-EP-008 — Moderar, ocultar y recuperar contenido del evento

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-006, Q-019, Q-023; DEC-005, DEC-022, DEC-023, DEC-039. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

## Module

MOD-004

## Objective / outcome

El organizador controla qué se publica y corrige eliminaciones normales durante siete días.

## Problem solved

La galería necesita control sin confundir ocultamiento con destrucción del recuerdo.

## Actors

Organizador; sistema; administración en intervención justificada.

## Scope

Aprobar/rechazar pendientes; ocultar/restaurar publicación; eliminar normal a TRASHED, restaurar y purgar tras siete días; visualizar estados de contenido propio.

## Out of scope

Resolución de denuncias graves (EL-EP-009); retención jurídica; moderación IA.

## Business rules

**CONFIRMED — [DEC-096](../DECISIONS.md):** organizador puede enviar a papelera publicados, ocultos, pendientes de revisión y rechazados; fallos técnicos solo con inspección de seguridad aprobada. Cargas/procesamientos en curso y cuarentena quedan excluidos. Restauración conserva estado previo y respeta bloqueos vigentes.

CONFIRMED: auto-publicación predeterminada o revisión previa; HIDDEN conserva original/consumo y vuelve a PUBLISHED; TRASHED no aparece ni se exporta, restaurable siete días; consume cuota hasta borrado físico.

**CONFIRMED — [DEC-086/087](../DECISIONS.md):** restauración conserva estado previo sin evadir moderación/cuarentena/bloqueos. Cambio de modo mantiene pendientes existentes en revisión, aplica modo vigente a trabajos que finalizan y no altera automáticamente publicados. No se infiere una lista de estados habilitados para papelera.

## Main scenarios

Aprobar pendiente; rechazar; ocultar y publicar de nuevo; enviar a papelera; restaurar antes de siete días; purga vencida.

## Edge cases

Restaurar rechazado/pendiente; cambio de modo con cola pendiente; contenido denunciado/bloqueado; evento en gracia; contenido ya purgado.

## Data

Estado de publicación, estado previo a papelera, decisión/actor/motivo, fechas de papelera/purga.

## Permissions

Propietario modera su evento; invitado no administra archivos ajenos; admin solo por motivo; cuarentena no liberable por organizador.

## Integrations

Auditoría, consumo y purga principal; exportación respeta estados.

## Dependencies

EL-EP-006, EL-EP-007 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Operaciones auditables; cambios efectivos de visibilidad; acciones destructivas comprensibles.

## Success criteria

- Un estado fuera de la lista DEC-096 no admite papelera del organizador; fallo técnico exige inspección aprobada. Restauración no evade restricciones vigentes.

Ocultar reversible sin reducir cuota; trash no visible/exportable; restauración no publica indebidamente.

- Dado contenido elegible en papelera, al restaurar se recupera el estado previo solo respetando bloqueos vigentes; no se publica ni libera cuarentena por restauración.
- Dado un cambio de moderación, los pendientes existentes siguen pendientes; un trabajo finaliza bajo el modo vigente, sin evadir seguridad/retiro; lo ya publicado no se altera automáticamente.

## Risks

Restauración evade aprobación o bloqueo preventivo.

## Open questions

Ningún BLOCKER de requisitos propio: PL-006/007 respondidas en DEC-086/087/096 y re-review aprobado en [precisiones finales](../sessions/2026-10-08-precisiones-finales-mvp.md). Implementación/UI requieren sus gates.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Moderacion, ocultar/rechazar/papelera/restaurar en biblioteca compartida.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-008). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Biblioteca007 y hechos de seguridad006; purga015 por contrato.

UX_OPEN_QUESTIONS: ninguna funcional nueva; gates tecnicos aplicables en el handoff.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

DoR de requisitos aprobada; no generar tickets frontend antes del gate UI completo.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: ticket_writer crea EL-TK-103..112 como DRAFT para moderación cotidiana, visibilidad, papelera/restauración, vencimiento, cambio de modo, UI owner y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-08: requirements_reviewer aprueba READY de requisitos sin hallazgos; implementacion/UI conservan gates aplicables. [Dictamen](../sessions/2026-10-08-precisiones-finales-mvp.md).

- 2026-10-08: DEC-086/087 registran aprobaciones; PL-006 conserva precisión de estados permitidos. Sin regeneración ni tickets.

- 2026-10-07: creación por product_planner con trazabilidad Q-006, Q-019, Q-023; DEC-005, DEC-022, DEC-023, DEC-039; estado inicial NOT_READY; sin tickets.

