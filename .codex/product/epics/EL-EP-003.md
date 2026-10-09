# EL-EP-003 — Abrir y cerrar el evento según su vigencia

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

READY expresa DoR de requisitos aprobada en re-review de requirements_reviewer el 2026-10-08. Arquitectura habilita entrada a UI sin nueva decisión tecnológica; gates frontend en la [sesión de revisión](../sessions/2026-10-08-vigencia-cuotas.md).

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-010, Q-015, Q-022; DEC-012, DEC-017, DEC-035, DEC-058. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-002

## Objective / outcome

El acceso y la recuperación de recuerdos siguen un ciclo temporal comprensible y controlado.

## Problem solved

Sin reglas temporales coherentes se puede abrir, reactivar o eliminar fuera del periodo permitido.

## Actors

Organizador; sistema; administración.

## Scope

DRAFT, SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD, PENDING_DELETION, SUSPENDED, DELETED; activación automática/manual, cierre/reapertura, vencimiento/gracia, extensión y suspensión con previous_status.

## Out of scope

Purga efectiva (EL-EP-015); decisiones jurídicas; checkout.

## Business rules

CONFIRMED: no EXPIRED. Programado muestra aviso sin cargas. ACTIVE/CLOSED vencen a GRACE_PERIOD de 7 días; CLOSED no pausa vigencia. Solo admin suspende/reactiva. DELETED terminal. Vigencias 7/30/90 días, default 30 posteriores a fecha del evento.

**CONFIRMED — 2026-10-08:** [DEC-077/078](../DECISIONS.md) definen el ancla de vencimiento, activación anticipada, edición previa a ACTIVE, continuidad de vigencia/gracia en SUSPENDED y recálculo temporal al reactivar. La purga durante investigación y sus restantes plazos se coordinan con EL-EP-015; esta épica no define purga efectiva.

[DEC-081/082](../DECISIONS.md) concretan el mapping de reactivación y las duraciones exactas de 24 horas por día. No se suman días calendario ni se restaura previous_status sin evaluar plazos.

## Main scenarios

Publicar y activar al inicio; activar antes; cerrar y reabrir antes de vencer; entrar a gracia; extender desde gracia; suspender y revisar reactivación.

## Edge cases

Suspensión atraviesa vencimiento/gracia; activación anticipada; evento de varios días; cambio de fecha/TZ; extensión simultánea con eliminación; previo estado ya vencido.

## Data

Estado, previous_status, inicio, finalización, TZ, expiración, gracia, plan/override e historial.

## Permissions

Organizador DRAFT→SCHEDULED, SCHEDULED→ACTIVE, ACTIVE↔CLOSED antes de vencer; sistema transiciones temporales; admin suspensión/reactivación/extensión.

## Integrations

Planes, comunicaciones y borrado; reloj funcional por TZ y timestamps UTC.

## Dependencies

EL-EP-002, EL-EP-011 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Cambios auditables; temporizadores recuperables; consistencia de acceso frente a transiciones.

## Success criteria

Matriz de estado/actor/acción verificable; bloqueo de cargas y acceso general conforme cierre/vencimiento; no reactivación inválida. La consulta de Mis aportes y solicitudes propias con sesión válida conservan la excepción aprobada en [DEC-084](../DECISIONS.md), sin habilitar galería general ni carga por esa consulta.

Escenarios verificables derivados de DEC-077/078:

- Dado un evento con fecha/hora programada y vigencia asignada, cuando se activa anticipadamente, entonces conserva el vencimiento anclado al instante programado en su TZ.
- Dado un evento que aún no alcanzó ACTIVE, cuando se cambia su fecha mediante una operación permitida, entonces se recalcula el vencimiento con la nueva fecha/hora y la misma vigencia; no concede permiso nuevo de editar después de ACTIVE.
- Dado un evento SUSPENDED, cuando transcurre su vigencia o gracia, entonces los plazos siguen avanzando; levantar suspensión recalcula el estado temporal y no restaura un previous_status ya vencido.
- Dada una investigación ordinaria, cuando se coordina purga, entonces no puede ampliar máximos de DEC-092. Fin de gracia y purga se rigen por contrato EL-EP-015; un hold excepcional es distinto y mantiene revisión jurídica pendiente.
- Dado un evento suspendido antes de vencer, cuando administración levanta suspensión, entonces aplica el mapping de DEC-081: conserva DRAFT/CLOSED/ACTIVE según estado previo y, para SCHEDULED, compara inicio con instante actual; vencimiento/gracia prevalecen y DELETED no se reactiva.
- Dado el instante programado resuelto conforme DEC-070, cuando se calcula vencimiento/gracia, entonces se suman N×24h y 7×24h respectivamente; atravesar DST no modifica la duración y la presentación usa la TZ del evento.

## Risks

CONFIRMED — CR-002/DEC-061..064: Lifecycle/expiración programada async mediante Scheduler/Workers y JobQueue PostgreSQL; recuperación/idempotencia. PL-001/002 respondidas en DEC-077/078; dependencias y gates de implementación permanecen.

Resucitar un evento vencido desde previous_status; eliminar durante una suspensión/investigación.

## Open questions

Ninguna pregunta bloqueante de requisitos propios: PL-001/002/015/016 respondidas y re-review aprobado. [Dictamen histórico](../sessions/2026-10-08-vigencia-cuotas.md). UX de lifecycle e integración ahora READY en [reevaluación MVP](../../context/ui-mvp-epic-review.md#el-ep-003); gates de acciones sensibles conservan su propietario. PL-024 no bloquea consulta/transiciones propias.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Lifecycle, fechas/TZ, acciones autorizadas y feedback publico; integra acciones por propietario.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-003). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Acciones011/010/015 por propietario; no delega intake009 al lifecycle.

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

DoR de requisitos aprobada tras resolver PL-015/016. READY no implica dependencias implementadas ni gate frontend completo. No se generan tickets en esta actualización.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-08: usuario aprueba mapping de reactivación y duraciones N×24h en DEC-081/082; PL-015/016 respondidas, re-review aprobado sin hallazgos y estado READY de requisitos. Arquitectura habilita UI; implementación PARTIAL.

- 2026-10-08: PL-001/002 respondidas mediante DEC-077/078; reglas y escenarios actualizados sin regenerar la épica. requirements_reviewer conserva NOT_READY por PL-015 y señala PL-016; sin tickets ni implementación.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: creación por product_planner con trazabilidad Q-010, Q-015, Q-022; DEC-012, DEC-017, DEC-035, DEC-058; estado inicial NOT_READY; sin tickets.

