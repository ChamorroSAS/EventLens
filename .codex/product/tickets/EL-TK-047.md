# EL-TK-047 — Consultar mis eventos y su configuración autorizada

## Parent epic

EL-EP-002

## Status

READY

## User story

**Como** organizador autenticado, **quiero** consultar mis eventos y la configuración autorizada del seleccionado, **para** acceder a su preparación desde el dashboard.

## Alcance funcional

Lectura backend/API de proyección mínima de eventos propios y configuración autorizada del seleccionado para OrganizerDashboard/EventList/EventCard y formularios. Una responsabilidad de consulta; sin frontend, filtros, métricas, reglas nuevas de paginación, escritura ni publicación.

## Criterios de aceptación

**Dado** cuenta activa y sesión vigente, **cuando** consulta sus eventos, **entonces** devuelve únicamente eventos propios y datos mínimos de identidad/nombre/estado para entrar a su configuración. Cero eventos es un vacío real, no loading ni fallo.

**Dado** evento propio seleccionado, **cuando** consulta configuración, **entonces** recibe campos/capacidades/revisión autorizados por EventSnapshot/EventConfigurationPolicy sin PIN, secretos ni grants permanentes; seleccionar no autoriza mutación. **Dado** evento ajeno/inexistente o sesión inválida, **cuando** consulta, **entonces** no revela datos ajenos y retorna error estable. Fallo DB retorna error, no lista vacía ficticia. Preview031 conserva policy DRAFT sin acceso público.

## Datos / contratos afectados

Proyección read-only MOD-002 con owner de ActorContext validado en servidor; cache privada. REST/JSON/OpenAPI y cliente Angular generado, sin DTO Nest internos ni entidades Prisma.

## Pruebas requeridas

Vitest policy/proyección; PostgreSQL real con dos propietarios y colección vacía; API 401/no revelación/schema/revisión y fallo de consulta.

## Dependencias técnicas y funcionales

Handoff EL-EP-002/contrato común ui-mvp-epic-review y catálogo ui-components; domain-map/api-conventions y cliente Angular OpenAPI, EL-TD-001..007.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** EL-TK-048.
- **can_parallelize_with:** configuración/consulta independiente sobre contratos acordados; se respetan predecesoras y conflictos serializados.

## Observabilidad / auditoría

Actor/resource/operationId/revisión/resultado pertinentes sin PIN, contenido, firmas o secretos.

## Prioridad / estimación

P0 / S

## Traceability

GAP-EL-EP-002-01; EL-EP-002; handoff UI002; EL-TD-001..007.

## Definition of Ready

- [x] Comportamiento/criterios delimitados por contratos aprobados
- [x] Dependencias, permisos y errores identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
