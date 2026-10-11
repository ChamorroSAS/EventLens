# EL-EP-011 — Aplicar planes BETA y ampliaciones controladas

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

Requisitos, frontera arquitectónica y handoff UX aprobados en [dictamen final](../sessions/2026-10-08-precisiones-finales-mvp.md). Restricciones técnicas y contratos concretos se validan al planificar; ninguna tecnología diferida elegida.

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-011, Q-020, Q-023; DEC-010, DEC-011, DEC-020, DEC-026, DEC-027, DEC-039. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-006

## Objective / outcome

Cada evento tiene capacidad conocida y ampliable sin alterar las condiciones base del plan.

## Problem solved

Consumo sin límites y excepciones sin trazabilidad impedirían una beta controlada.

## Actors

Organizador; administración; sistema.

## Scope

Plan BETA automático para cuentas invitadas; límites por evento; consumo; overrides separados; solicitud de ampliación, aprobación/rechazo/información; old/new/actor/motivo.

## Out of scope

Checkout, precios, impuestos, factura, renovación y reembolsos.

## Business rules

**CONFIRMED — [DEC-100..102](../DECISIONS.md):** organizador solicita GB/días adicionales; administración configura límites efectivos y vigencia total. Responder información devuelve misma solicitud a pendiente de revisión, con historial y una sola abierta/evento. Después de ACTIVE se bloquean reducciones o retornos al plan base que dejen vencimiento pasado; no se provoca purga inmediata por esa operación.

CONFIRMED: BETA 1500 archivos/10GB, foto 25MB, video 500MB/5min, vigencia 7/30/90 días default 30; sin límite por invitado. Original existente cuenta en todos los estados no purgados. No perder finalizados al límite; bloquear nuevas cargas y avisar 80/100% sin spam.

**CONFIRMED — 2026-10-08:** [DEC-079/080](../DECISIONS.md) definen categorías de cuota comercial frente a consumo operacional, unidades decimales, reservas por autorización y protección ante reducción de cuota. La reserva de capacidad no sustituye los permisos actuales de carga: PL-005 sigue perteneciendo a EL-EP-005. No se fija aquí TTL ni tecnología de reservas.

[DEC-093..095](../DECISIONS.md) definen tipo/cantidades/motivo de solicitud, una solicitud abierta por evento y respuesta textual en su historial, campos administrativos/vigencia total desde ancla y retorno al plan base con consecuencias. No fijan rangos de valores, transición posterior a responder o efecto temporal de reducción que no esté ya aprobado. PL-005 respondida en DEC-085 no convierte una reserva en permiso de carga.

## Main scenarios

Asignar plan; consultar uso; alcanzar cuota; solicitar extensión/almacenamiento; admin aprueba override; rechazo no altera capacidad.

## Edge cases

Concurrentes al borde; quota reducida bajo consumo actual; trash/quarantine ocupando; purga libera capacidad; derivados o ZIP exceden consumo original.

## Data

Plan, asignación, límites efectivos, consumo, override, solicitud, decisión y auditoría.

## Permissions

Organizador solicita, no modifica límites; admin autorizado modifica con razón; sistema aplica límites efectivos.

## Integrations

Recepción media, lifecycle, comunicaciones y consola.

## Dependencies

EL-EP-001 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Consumo consistente, parametrización sin cambio de lógica, auditabilidad.

## Success criteria

- Solicitud distingue incrementos solicitados de totales efectivos; respuesta pasa a revisión en misma solicitud sin duplicación. Reducción/retorno después de ACTIVE con vencimiento pasado se deniega y conserva valores vigentes.

Plan base intacto ante override; límites aplicados sin perder confirmados; solicitudes trazables.

Escenarios verificables derivados de DEC-079/080:

- Dado el plan de 10 GB, cuando se calcula consumo comercial, entonces se cuentan originales de aportes físicamente existentes, incluidos ocultos/papelera/cuarentena, y se usa 10.000.000.000 bytes; portadas/derivados/ZIP se contabilizan separadamente.
- Dadas autorizaciones concurrentes cerca del límite, cuando se admiten nuevas cargas, entonces cada una reserva bytes y un cupo por archivo sin conceder capacidad nueva que exceda lo disponible.
- Dada una reserva cancelada o vencida, cuando se libera, entonces recupera su capacidad sin disminuir el consumo de originales existentes ni liberarla dos veces.
- Dada una reducción de cuota bajo consumo o reservas existentes, cuando se aplica, entonces conserva archivos y reservas vigentes y bloquea nuevas autorizaciones mientras no haya capacidad. Respetar la reserva no autoriza cargas que la política de acceso deniegue.
- Solicitar ampliación exige tipo almacenamiento/extensión/ambos, cantidad correspondiente y motivo; no requiere adjuntos inicialmente.
- Una solicitud abierta impide crear otra abierta para el mismo evento; información adicional se responde textualmente en la solicitud original con historial.
- Override administrativo modifica solo campos aprobados con motivo; volver al plan muestra consecuencias y conserva las reglas de reducción de DEC-080.

## Risks

Coste oculto de derivados/exportaciones; sobreasignación por cargas concurrentes.

CONFIRMED — CR-002/DEC-061..064: Beta20–200 invitados/evento, objetivo100usuarios conectados/cargando, no100procesamientos simultáneos. Cuotas1500archivos/10GB/foto25MB/video500MB/5min configurables. Capacidad/coste global a validar; PL-011/012 respondidas en DEC-079/080.

## Open questions

Ningún BLOCKER de requisitos/UX propio: PL-011/012/021..023 respondidas en DEC-079/080/093..095/100..102 y gates aprobados. Fuente UX: [handoff de capacidad](../../context/ui-capacity-lifecycle.md); dictamen en [precisiones finales](../sessions/2026-10-08-precisiones-finales-mvp.md).

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Consumo/reservas, ampliacion y overrides; reutiliza handoff de capacidad.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-011). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Handoff capacidad vigente; admin012 reutiliza sin duplicar politica.

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

DoR de requisitos y UI aprobada; tickets EL-TK-134..145 validados como READY. READY_FOR_FRONTEND_PLANNING: YES; READY_FOR_IMPLEMENTATION: YES conforme a dependencias técnicas y baseline EL-TD-001..007.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: requirements_reviewer y revisión UI/UX aprueban el paso de EL-TK-134..145 de DRAFT a READY (REQUIREMENTS_READY: YES, READY_FOR_FRONTEND_PLANNING: YES, READY_FOR_IMPLEMENTATION: YES propio). Reutilización estricta del catálogo UI/UX (ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011) sin nuevos componentes.
- 2026-10-10: ticket_writer crea EL-TK-134..145 como DRAFT para plan/límites efectivos, cuota/reservas, consumo, umbrales, solicitudes de ampliación, overrides, UI owner/admin y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-08: requirements_reviewer aprueba READY de requisitos sin hallazgos; implementacion/UI conservan gates aplicables. [Dictamen](../sessions/2026-10-08-precisiones-finales-mvp.md).

- 2026-10-08, gate anterior: alcance ampliado NOT_READY; capacidad/consumo/reservas mantenían REQUIREMENTS_READY YES. Precisiones en sesión de cierre MVP; sustituido por dictamen final.

- 2026-10-08: DEC-093..095 concretan campos/interacción/overrides aprobados; rangos/precisiones por revisar, frontend PARTIAL. No regeneración ni tickets.

- 2026-10-08: PL-011/012 respondidas mediante DEC-079/080; reglas y escenarios actualizados sin regenerar la épica. requirements_reviewer aprueba REQUIREMENTS_READY: YES y estado READY de requisitos; implementación PARTIAL por gates pendientes. Sin tickets ni implementación.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 registra riesgo de capacidad global local; conserva NOT_READY y límites/PL existentes.

- 2026-10-07: creación por product_planner con trazabilidad Q-011, Q-020, Q-023; DEC-010, DEC-011, DEC-020, DEC-026, DEC-027, DEC-039; estado inicial NOT_READY; sin tickets.

