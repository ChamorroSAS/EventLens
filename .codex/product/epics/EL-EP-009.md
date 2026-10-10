# EL-EP-009 — Atender denuncias y solicitudes de retiro sin cuenta

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-012, Q-013, Q-019; DEC-016, DEC-023, DEC-029, DEC-031. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - gate final intake aprobado.

## Module

MOD-004

## Objective / outcome

Personas afectadas reportan y reciben intervención proporcional sin registrarse.

## Problem solved

Contenido no consentido, sensible o ilegal necesita retiro rápido y gestión responsable.

## Actors

Invitado/reportante; organizador; administración.

## Scope

Reporte con motivos confirmados; solicitud propia desde Mis aportes; solicitud sin token con identificación mínima; severidad, avisos, revisión y ocultamiento preventivo; eliminación no restaurable por casos válidos graves.

## Out of scope

IA avanzada; política jurídica definitivamente aprobada; garantía contractual de atención.

## Business rules

**CONFIRMED - DEC-103..105:** campos y precisiones del retiro sin sesion aprobados; correo solo contacto, sin recuperacion/titularidad de sesion ni seguimiento publico. [Handoff](../../context/ui-mvp-epic-review.md#el-ep-009).

**CONFIRMED — [DEC-097](../DECISIONS.md):** retiro propio confirmado es irreversible, sin papelera ni ventana cancelable; fija purge_started_at al confirmar y aplica máximos DEC-092/098. No puede restaurarse ni requiere veto/aprobación del organizador. Solicitudes sin sesión mantienen revisión.

CONFIRMED: propiedad del uploader; organizador modera cotidiano, admin graves; alta severidad revisión inicial <24h, normal <72h, objetivos internos. Puede omitir papelera por privacidad/ilegalidad/intimidad/requerimiento legal; auditoría mínima sin media innecesaria.

**CONFIRMED — [DEC-088/089](../DECISIONS.md):** administración clasifica y decide ocultamiento; denuncias graves alertan sin ocultamiento automático por denuncia sola. Sesión válida permite retirar aporte propio inmediatamente de visibilidad y tramitar eliminación sin aprobación del organizador; solicitudes sin sesión se revisan. DEC-097 completa el contrato de eliminación individual.

## Main scenarios

Reportar aparecer en foto; perder token y solicitar retiro; reportar intimidad; admin justifica acceso y oculta; revisión resuelve solicitud.

## Edge cases

Denuncia abusiva; pruebas insuficientes; menor expuesto; organizador involucrado; evento cerrado; original ya exportado; razón legal para no avisar.

## Data

Contenido identificado, motivo, severidad, información mínima del reportante, estado/caso, intervenciones y comunicaciones.

## Permissions

Invitado solicita, no elimina ajenos; propietario no revierte bloqueo de seguridad unilateralmente; admin accede media con justificación.

## Integrations

Comunicaciones, auditoría, privacidad y purga.

## Dependencies

EL-EP-004, EL-EP-007, EL-EP-014 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Confidencialidad, minimización, trazabilidad y objetivos de atención 24/72h.

## Success criteria

- Retiro propio confirmado retira visibilidad, inicia ruta irreversible con ancla de confirmación y no ofrece restauración/cancelación; cumple deadlines DEC-092/097/098.

Registro inmediato; ruta grave alertada; retiro válido no restaurable por organizador; acceso administrativo justificado.

- Recibir denuncia no oculta contenido por sí solo; administración clasifica/decide y los casos graves tienen alerta prioritaria.
- Solicitud propia con sesión válida oculta inmediatamente su aporte y tramita eliminación sin veto del organizador; identidad anónima no concede permiso sobre contenido ajeno.
- Solicitud sin sesión se recibe para revisión, sin eliminación automática por mera recepción; estados/plazos físicos dependen del contrato de eliminación.

## Risks

Abuso de denuncia, revictimización y filtración de reportante.

## Open questions

Gate actual: PL-024..026 respondidas en DEC-103..105; requisitos y UX aprobados sin hallazgos en [sesion intake](../sessions/2026-10-08-removal-intake.md). Texto juridico final y apertura publica conservan Q-029.

PL-008/009/018 aprobadas en [precisiones finales](../sessions/2026-10-08-precisiones-finales-mvp.md); PL-024..026 completadas en DEC-103..105. Sin preguntas funcionales/UX actuales del intake; Q-029 conserva revisión jurídica previa a apertura pública.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Reportar, retiro propio irreversible, intake sin sesion y revision admin; DEC-103..105 define intake.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-009). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Sesion propia004; intake DEC-103..105; admin012/auditoria014/purga015.

UX_OPEN_QUESTIONS: ninguna funcional tras DEC-103..105 y gates aprobados.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

DoR de requisitos y UX aprobados. READY no certifica implementacion ni apertura publica; no se generan tickets en esta actualizacion.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: ticket_writer crea EL-TK-113..123 como DRAFT para reportes, retiro propio irreversible, intake sin sesión, clasificación/revisión admin, ocultamiento, resolución, UI pública/admin y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-08: requirements_reviewer y ui_designer aprueban gate final DEC-103..105; epica READY, UX READY, frontend planning YES. Sin tickets/codigo; texto juridico final pendiente.

- 2026-10-08: PL-024 respondida en DEC-103; intake permanece PARTIAL solo por PL-025/026, sin cambios a reglas previas ni tickets/codigo.

- 2026-10-08: reevaluación UI descubre PL-024 compartida; épica completa NOT_READY/PRODUCT_READINESS PARTIAL, retiro/denuncias aprobados conservados.

- 2026-10-08: requirements_reviewer aprueba READY de requisitos sin hallazgos; implementacion/UI conservan gates aplicables. [Dictamen](../sessions/2026-10-08-precisiones-finales-mvp.md).

- 2026-10-08: DEC-088/089 concretan denuncias y retiro propio; gate pendiente, sin tickets ni implementación.

- 2026-10-07: creación por product_planner con trazabilidad Q-012, Q-013, Q-019; DEC-016, DEC-023, DEC-029, DEC-031; estado inicial NOT_READY; sin tickets.

