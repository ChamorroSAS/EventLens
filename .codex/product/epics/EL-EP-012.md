# EL-EP-012 — Operar y dar soporte con intervención administrativa justificada

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-017; DEC-019, DEC-020, DEC-027, DEC-038. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-007

## Objective / outcome

Administración diagnostica y ejecuta operaciones permitidas sin acceso indiscriminado a recuerdos.

## Problem solved

Una beta necesita soporte y respuesta a incidentes sin convertir admin en acceso ilimitado.

## Actors

Administrador autorizado; organizador solicitante.

## Scope

Consola mínima: búsqueda/info/propietario/estado/fechas/plan/consumo/límites/reportes/procesamiento; invitaciones; revisión ampliaciones; ejecutar acciones de dominio auditadas; acceso media solo por denuncia/soporte/investigación/moderación/incidente.

## Out of scope

Roles internos múltiples; impersonación; acceso libre a media; redefinir políticas de lifecycle, retiro o planes.

## Business rules

CONFIRMED: acciones relevantes auditadas; acceso multimedia requiere razón operativa. Solo admin suspende/reactiva y libera cuarentena; ampliación conserva old/new/fecha/actor/motivo. Cada acción respeta contrato de su dominio.

## Main scenarios

Localizar evento y revisar fallos; procesar solicitud; investigar reporte con justificación; ejecutar intervención autorizada y consultar auditoría.

## Edge cases

Admin sin permiso; recurso eliminado; intervención fallida; acceso sin motivo; acción permitida por consola pero inválida en dominio.

## Data

Identidad administrativa, consulta, contexto/motivo, solicitud e intervención auditada; sin media en logs.

## Permissions

Admin autorizado; acceso media justificado; organizador no tiene consola; no acceso a datos ajenos como usuario normal.

## Integrations

Interfaces de cuentas, eventos, media, moderación, planes y borrado; cada acción se habilita con su épica propietaria.

## Dependencies

EL-EP-001, EL-EP-014 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Seguridad, mínimo privilegio, trazabilidad; estados/error comprensibles; WCAG AA.

## Success criteria

Consultas sin abrir media; acceso injustificado rechazado; toda intervención rastreable y autorizada por dominio.

## Risks

CONFIRMED — CR-002/DEC-061..064: Administración autorizada inspecciona/reintenta/cancela/marca no repetir jobs con auditoría. Estados PENDING/PROCESSING/COMPLETED/RETRYING/FAILED/DEAD; errores sanitizados/referencias sin payloads grandes. Respeta permisos/estado del dominio; riesgos de carreras/repetición.

Consola evade validaciones; privilegios administrativos excesivos.

Dependencia de entrega: operaciones con políticas no resueltas permanecen bloqueadas por sus épicas propietarias; la consola no redefine esas políticas.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Busqueda/detalle admin, acceso justificado, intervenciones y jobs; gates por propietario.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-012). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Invitaciones001, lifecycle003, casos009, overrides011, auditoria014 y borrado015; gates por accion.

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

DoR de requisitos y UI aprobada; tickets EL-TK-146..155 validados como READY. READY_FOR_FRONTEND_PLANNING: YES; READY_FOR_IMPLEMENTATION: YES conforme a dependencias técnicas y baseline EL-TD-001..007.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: requirements_reviewer y revisión UI/UX aprueban el paso de EL-TK-146..155 de DRAFT a READY (REQUIREMENTS_READY: YES, READY_FOR_FRONTEND_PLANNING: YES, READY_FOR_IMPLEMENTATION: YES propio). Reutilización estricta del catálogo UI/UX (ui-mvp-epic-review.md §EL-EP-012) sin nuevos componentes ni bypass de justificación operativa.
- 2026-10-10: ticket_writer crea EL-TK-146..155 como DRAFT para búsqueda/detalle administrativo, diagnóstico/operación de jobs, acceso media justificado, orquestación de acciones, UI y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: creación por product_planner con trazabilidad Q-017; DEC-019, DEC-020, DEC-027, DEC-038; estado inicial READY; sin tickets.

