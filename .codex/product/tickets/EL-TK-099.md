# EL-TK-099 — Integrar la galería y viewer privados en la experiencia guest

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** invitado desde móvil, **quiero** recorrer la galería y abrir fotos o videos autorizados, **para** disfrutar los recuerdos del evento desde el navegador.

## Alcance funcional
Integrar Gallery, GalleryMediaCard, GalleryViewer, GalleryEmptyState, GalleryDisabledState, Image/VideoPlayer, MediaViewer y ReportContentAction usando los contratos autorizados del servidor.

## Fuera de alcance
Descarga guest, comentarios/reacciones, favoritos, slideshow, moderación o implementación del flujo de reportes de EL-EP-009.

## Criterios de aceptación
### Escenario 1
**Dado** una galería habilitada con publicaciones, **cuando** el invitado navega, **entonces** ve el grid autorizado y puede abrir un viewer dentro del viewport.

### Escenario 2
**Dado** una galería vacía, **cuando** entra, **entonces** ve un estado vacío distinto del estado de galería deshabilitada.

### Escenario 3
**Dado** un bloque incremental que falla, **cuando** ocurre el error, **entonces** conserva resultados previos y permite retry autorizado sin borrar el grid.

### Escenario 4
**Dado** media retirada o acceso revocado mientras el viewer está abierto, **cuando** se revalida, **entonces** deja de mostrar nuevas autorizaciones y presenta un estado comprensible.

## Reglas de negocio
No existe botón de descarga guest. ReportContentAction solo deriva al contrato propietario de EL-EP-009 cuando esté disponible.

## Validaciones y permisos
La UI consume capacidades del servidor y no infiere visibilidad privada localmente.

## Casos de error y estados vacíos
Vacío, deshabilitado, media no disponible, derivado fallido, acceso revocado, error incremental y sesión expirada.

## Datos / contratos afectados
Cliente OpenAPI de GuestGallerySnapshot y MediaViewGrant; integración contractual con ReportContentAction.

## Dependencias técnicas y funcionales
Handoff UI/UX de EL-EP-007.

## Dependencias de tickets
- **depends_on:** EL-TK-096, EL-TK-097, contrato de reportes de EL-EP-009.
- **blocks:** EL-TK-101 y UI downstream que consuma galería.

## Pruebas requeridas
Component/unit, E2E móvil, grid/viewer, teclado/Escape/anterior/siguiente, foco, carga incremental, revocación y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin telemetría invasiva ni logging de URLs temporales.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016; DEC-003, DEC-007, DEC-018, DEC-032, DEC-033; EL-EP-007; ui-mvp-epic-review.md#el-ep-007.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
