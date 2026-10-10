# EL-EP-007 — Visualizar recuerdos en una galería privada móvil

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-005, Q-016; DEC-003, DEC-018, DEC-032, DEC-033. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-004

## Objective / outcome

Invitados y organizador visualizan recuerdos autorizados de forma sencilla desde navegador.

## Problem solved

Recopilar sin una visualización usable reduce valor y participación.

## Actors

Invitado; organizador propietario.

## Scope

Galería responsive de fotos/videos; información de evento; reproducción de derivados; estado de procesamiento para organizador; panel con visibilidad según permiso; flags de galería/carga independientes.

## Out of scope

Comentarios/reacciones/chat, slideshow, favoritos, álbumes, descargas de invitados.

## Business rules

CONFIRMED: invitados solo PUBLISHED si guest_gallery_enabled y estado permite acceso. Ocultos, rechazados, eliminados, pendientes y bloqueados preventivamente no se muestran; organizador ve cuando corresponda; acceso media privado.

## Main scenarios

Galería de fotos/videos publicada; modo solo carga sin media ajena; modo solo galería; organizador revisa estados de sus originales/derivados.

## Edge cases

Galería vacía; video en procesamiento; derivados fallidos; contenido retirado mientras se visualiza; enlace inválido; acceso entre eventos.

## Data

Contenido publicado, derivados autorizados, configuración y estado del evento.

## Permissions

Invitado no ve media no publicada ni recibe función de descargar; organizador únicamente sus eventos; acceso administrativo separado y justificado.

## Integrations

Media, control de publicación y acceso; sin proveedor externo de galería definido.

## Dependencies

EL-EP-004, EL-EP-006 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Mobile first, WCAG AA, dos versiones principales de navegadores confirmados, URLs privadas/firmadas. DEC-063/CR-002: entrega autorizada desde storage externo privado; no mezclar media entre eventos.

## Success criteria

No exposición de estados no publicados; reproducción móvil de derivados; flags producen las cuatro combinaciones previstas.

## Risks

Caching de contenido retirado; interpretación de no descarga como protección absoluta frente a copiar.

CONFIRMED — CR-002/DEC-061..064: ObjectStorage externo compatible S3 privado, autorización app/URLs temporales equivalentes; sin URL permanente pública/listado público. Caching y revocación según contratos propietarios.

Dependencia de entrega: invalidación temporal de acceso y retiro se ejecutan según EL-EP-004/EL-EP-009; esta épica no define un plazo de revocación adicional.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Galeria/viewer y biblioteca autorizada, responsive y disponibilidad vigente.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-007). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Acceso004 y derivados006; reportes009 por variante autorizada.

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

Sin preguntas BLOCKER de producto en este límite; tickets EL-TK-096..102 revisados y promovidos a READY por requirements_reviewer con alineación UI/UX completada (2026-10-10).

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: requirements_reviewer y revisión UI/UX aprueban EL-TK-096..102 a READY; se integran dependencias canónicas (EL-TK-074, EL-TK-075, EL-TK-072, EL-TK-037), especificaciones del catálogo de componentes de galería guest (§5.20..24) y biblioteca del organizador (§8.1..4), contratos de storage privado (DEC-063), revalidación server-side y readiness de implementación sin alterar arquitectura.
- 2026-10-10: ticket_writer crea EL-TK-096..102 como DRAFT para galería guest PUBLISHED, entrega temporal de derivados, biblioteca owner, integración UI guest/organizador, revalidación de visibilidad y validación integrada.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 explicita entrega privada local y riesgos; conserva READY y permisos.

- 2026-10-07: creación por product_planner con trazabilidad Q-005, Q-016; DEC-003, DEC-018, DEC-032, DEC-033; estado inicial READY; sin tickets.

