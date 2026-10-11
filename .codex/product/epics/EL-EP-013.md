# EL-EP-013 — Informar al organizador sobre su cuenta y sus recuerdos

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-018; DEC-021. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-009

## Objective / outcome

El organizador conoce hitos, riesgos y disponibilidad de descargas con correo y avisos útiles.

## Problem solved

Vencimiento o cuota inesperados pueden impedir recuperar recuerdos.

## Actors

Organizador; sistema; administración cuando atiende denuncias.

## Scope

Correo y avisos panel: cuenta/seguridad, evento próximo ~24h, cambios/suspensión/reactivación; consumo80/100%; avisos vencimiento7/3/1d cuando posible, gracia, próxima eliminación y eliminación completa; exportación disponible; denuncias según severidad.

## Out of scope

SMS, WhatsApp, push; marketing; determinar severidad o lifecycle.

## Business rules

CONFIRMED: deduplicación de consumo y vigencias cortas; avisar intervención salvo razón legal/seguridad; descarga informa expiración. Disparos usan fechas/señales confirmadas del dominio.

## Main scenarios

Recuperación de cuenta; un aviso por umbral; evento corto sin duplicados; descarga preparada; intervención con excepción justificada de comunicación.

## Edge cases

Fallo proveedor; repetición señal; TZ cambia antes de inicio; extensión cancela avisos obsoletos; organizador solicita eliminación.

## Data

Destinatario, tipo, recurso, evento disparador, estado/envío, fechas TZ y motivo de supresión.

## Permissions

Organizador recibe avisos propios; administración alerta sobre casos autorizados; no exponer reportante o multimedia innecesaria.

## Integrations

Proveedor de correo PENDING técnico; señales de épicas propietarias; correo de cuenta independiente.

## Dependencies

Sin predecesora funcional dura; integra señales/servicios comunes cuando corresponda. Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

No duplicados, reintentos con trazabilidad, minimización, español/i18n-ready.

## Success criteria

Eventos confirmados generan avisos correctos; duplicados y avisos obsoletos evitados; no texto técnico sensible.

## Risks

CONFIRMED — CR-002/DEC-061..064: Correo y notificaciones programadas async JobQueue durable PostgreSQL/Workers/Scheduler. Hasta3 intentos automáticos/DEAD/intervención, deduplicación; backoff progresivo recomendado, esperas pendientes.

Correo no entregado, spam y advertencias tardías.

PENDING técnico: proveedor, plantillas y política de reintento. Dependencia de entrega: calendario exacto de EL-EP-003/EL-EP-015; respetar señales de dominio y avisos confirmados.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Avisos contextuales y correo accesible; sin bandeja adicional obligatoria.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-013). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Avisos de hechos de cada owner; destinos001/003/010/011/015 revalidan permisos.

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

DoR de requisitos y UI aprobada; tickets EL-TK-156..165 validados como READY. READY_FOR_FRONTEND_PLANNING: YES; READY_FOR_IMPLEMENTATION: YES conforme a dependencias técnicas y baseline EL-TD-001..007.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: requirements_reviewer y revisión UI/UX aprueban el paso de EL-TK-156..165 de DRAFT a READY (REQUIREMENTS_READY: YES, READY_FOR_FRONTEND_PLANNING: YES, READY_FOR_IMPLEMENTATION: YES propio). Reutilización estricta del catálogo UI/UX (ui-mvp-epic-review.md §EL-EP-013) sin nuevos componentes ni NotificationCenter obligatorio.
- 2026-10-10: ticket_writer crea EL-TK-156..165 como DRAFT para intents de notificación, email async, avisos contextuales de lifecycle/capacidad/export/seguridad/casos, UI y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: creación por product_planner con trazabilidad Q-018; DEC-021; estado inicial READY; sin tickets.

