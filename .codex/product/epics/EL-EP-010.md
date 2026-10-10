# EL-EP-010 — Recuperar originales individualmente y por exportación

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-027; DEC-046, DEC-047, DEC-048, DEC-049. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-005

## Objective / outcome

El organizador recupera sus recuerdos originales sin depender de versiones optimizadas.

## Problem solved

El producto no entrega valor completo si contenido recopilado no puede recuperarse con calidad.

## Actors

Organizador; sistema.

## Scope

Descarga individual segura; descarga total asíncrona; Solicitud/Preparando/Disponible/Fallido/Expirado; aviso panel/correo; paquetes ZIP numerados ~5GB configurables, disponibles 48h.

## Out of scope

Descargas de invitados; exportación avanzada por categorías; originales en cuarentena.

## Business rules

CONFIRMED: exportación por defecto solo PUBLISHED/HIDDEN; excluye UPLOADED, PROCESSING, PROCESSING_FAILED, PENDING_REVIEW, REJECTED, TRASHED, QUARANTINED, DELETED. Fallidos seguros descargables individualmente. Enlaces temporales protegidos, regenerar tras expirar.

**CONFIRMED — [DEC-090](../DECISIONS.md):** selección fijada al solicitar; permisos revalidados al preparar/descargar; paquetes afectados por retiro de privacidad/seguridad o revocación de acceso se invalidan. No se promete recuperar bytes entregados ni revocar universalmente URLs emitidas.

## Main scenarios

Descargar original; solicitar paquetes; recibir aviso; descargar varias partes; regenerar tras 48h; informar fallo.

## Edge cases

Estado cambia al preparar; retiro posterior a empaquetado; cuenta/evento suspendido/eliminado; archivo duplicado por nombre; exportación simultánea; cuota de paquetes temporales.

## Data

Solicitud, selección/manifiesto, estado, partes/tamaños, caducidad, permisos y originales.

## Permissions

Organizador propietario según estado/seguridad; invitado sin descarga; revisar autorización al servir paquete.

## Integrations

ObjectStorage externo privado, empaquetado Workers/JobQueue PostgreSQL, comunicaciones async (DEC-063/064).

## Dependencies

EL-EP-006, EL-EP-008, EL-EP-013 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Originales exactos, links privados, tolerancia a fallo de preparación, interfaz accesible.

## Success criteria

ZIPs incluyen estados autorizados y preservan originales; 48h y múltiples partes visibles; no descarga entre eventos.

- Dada solicitud, su selección queda fijada; cambios posteriores no amplían silenciosamente el snapshot.
- Dado retiro de privacidad/seguridad o revocación de acceso, paquetes afectados se invalidan y no obtienen nuevas autorizaciones. Antes de preparar/descargar se revalidan permisos actuales.

## Risks

Paquetes conservan contenido retirado o acceso ya revocado.

CONFIRMED — CR-002/DEC-061..064: ZIP async Workers/JobQueue PostgreSQL, ObjectStorage exports separados, ~5GB/48h conservados. Reintentos/idempotencia/cleanup; recursos worker/temporales a dimensionar; PL-010 respondida en DEC-090. PL-011 respondida en [DEC-079](../DECISIONS.md): ZIP consume almacenamiento operacional separado de cuota comercial.

## Open questions

PL-010 respondida en DEC-090; gate localizado aprobado, sin bloqueantes propios. Tamaño exacto operativo de paquete y ejecución son detalles técnicos por validar, sin seleccionar herramientas DEFERRED ni inventar reglas sobre cambios de estado no cubiertos.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Descarga individual y export async, partes, expiracion e invalidacion.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-010). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Elegibilidad006/008, avisos013; grants y disponibilidad por contrato vigente.

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

Requisitos aprobados por requirements_reviewer y frontera arquitect?nica compatible; [dictamen actual](../sessions/2026-10-08-cierre-reglas-mvp.md). Gate UI completo pendiente; no generar tickets frontend.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: ticket_writer crea EL-TK-124..133 como DRAFT para descarga individual, export snapshot/async/multipart, disponibilidad/expiración/invalidation, grants, retry, estado, UI owner y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-08: gate localizado aprueba READY de requisitos; implementaci?n/UI conservan sus puertas pendientes.

- 2026-10-08: DEC-090 resuelve snapshot/revalidación/invalidation; gate pendiente sin tickets ni código.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 actualiza integración local y riesgos de recursos; conserva NOT_READY y PL-010.

- 2026-10-07: creación por product_planner con trazabilidad Q-027; DEC-046, DEC-047, DEC-048, DEC-049; estado inicial NOT_READY; sin tickets.

