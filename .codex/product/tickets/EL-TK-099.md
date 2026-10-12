# EL-TK-099 — Integrar la galería y viewer privados en la experiencia guest

## Parent epic
EL-EP-007

## Status
DONE

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES

## User story
**Como** invitado desde móvil, **quiero** recorrer la galería y abrir fotos o videos autorizados, **para** disfrutar los recuerdos del evento desde el navegador.

## Alcance funcional
Integrar Gallery, GalleryMediaCard, GalleryViewer, GalleryEmptyState, GalleryDisabledState, ImagePlayer, VideoPlayer, MediaViewer y ReportContentAction usando los contratos autorizados del servidor y el catálogo existente (§5.20..24).

## Fuera de alcance
Descarga guest, comentarios/reacciones, favoritos, slideshow, moderación o implementación del flujo de reportes de EL-EP-009.

## Criterios de aceptación
### Escenario 1
**Dado** una galería habilitada con publicaciones, **cuando** el invitado navega, **entonces** ve el grid autorizado y puede abrir un viewer modal dentro del viewport con controles visibles.

### Escenario 2
**Dado** una galería vacía, **cuando** entra, **entonces** ve un estado vacío (`GalleryEmptyState`) claramente distinguible del estado de galería deshabilitada (`GalleryDisabledState`).

### Escenario 3
**Dado** un bloque incremental que falla por red, **cuando** ocurre el error, **entonces** conserva los resultados previos y permite un retry accesible sin reiniciar ni borrar el grid.

### Escenario 4
**Dado** media retirada o acceso revocado mientras el viewer está abierto, **cuando** se solicita siguiente o se revalida, **entonces** deja de emitir autorizaciones y presenta un mensaje neutro comprensible.

## Reglas de negocio
No existe botón de descarga guest. ReportContentAction solo deriva al contrato de recepción de reportes de EL-EP-009. Cero inferencia local de visibilidad: toda autorización proviene del servidor.

## Validaciones y permisos
La UI consume capacidades del servidor (`GuestGallerySnapshot`, `MediaViewGrant`) y no infiere visibilidad privada localmente.

## Casos de error y estados vacíos
Vacío (`GalleryEmptyState`), deshabilitado (`GalleryDisabledState`), media no disponible, derivado fallido, acceso revocado, error incremental y sesión expirada.

## Datos / contratos afectados
Cliente OpenAPI de GuestGallerySnapshot y MediaViewGrant; integración contractual con ReportContentAction.

## Dependencias técnicas y funcionales
Handoff UI/UX de EL-EP-007 (.codex/context/ui-mvp-epic-review.md#el-ep-007).

## Dependencias de tickets
- **depends_on:** EL-TK-096, EL-TK-097, EL-TK-101.
- **blocks:** EL-TK-102.

## Pruebas requeridas
Component/unit, E2E móvil, grid/viewer, teclado/Escape/anterior/siguiente, retorno de foco, carga incremental, revocación y WCAG 2.2 AA.

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

## Integración UI/UX y Readiness — 2026-10-10

- **Handoff canónico:** Conforme a `.codex/context/ui-mvp-epic-review.md#el-ep-007` y catálogo de componentes (§5.20..24).
- **Componentes reutilizados (sin inventar nuevos):**
  - `Gallery`: Contenedor principal de la galería.
  - `GalleryMediaCard`: Tarjeta individual en el grid con thumbnail, badge de video/duración y evento de apertura.
  - `GalleryViewer`: Visualizador overlay dentro del viewport con controles accesibles.
  - `GalleryEmptyState`: Mensaje cuando el evento permite galería pero aún no hay publicaciones (`"Aún no hay recuerdos publicados en este evento."`).
  - `GalleryDisabledState`: Mensaje cuando la galería está desactivada (`"La galería de recuerdos no está habilitada para invitados en este momento."`).
  - Shell / Header / `EventAccessStatus`: Cabecera guest y estado de acceso.
  - `ImagePlayer` / `VideoPlayer` / `MediaViewer`: Renderizador del derivado con controles nativos/accesibles.
  - `ReportContentAction`: Botón para abrir el diálogo de reporte de EL-EP-009.
- **Extensiones de componentes (DESIGNED):**
  - Viewer: Manejo de derivado no listo o fallido con opción de reintento.
  - Navegación: Botones anterior/siguiente visibles además de flechas de teclado; no se exige gesto de swipe táctil exclusivo.
  - Gestión de foco: Atrapamiento de foco en el viewer y retorno estricto a la `GalleryMediaCard` al cerrar (Escape o botón de cierre).
- **Accesibilidad y Responsive (WCAG 2.2 AA):**
  - Mobile-first: Grid adaptativo de 2 columnas en móvil a 3-4 en tablet/desktop conservando el orden de lectura.
  - Touch targets ≥ 44×44px en controles de reproducción, navegación y cierre.
  - Anuncios con `aria-live="polite"` para carga de nuevos bloques y errores. Controles de video con subtítulos/pausa sin autoplay forzado.

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:** Implementación completa en `@eventlens/web` (`apps/web/src/app/gallery/`) de `Gallery`, `GalleryMediaCard`, `GalleryViewer`, `GalleryEmptyState`, `GalleryDisabledState`, `ImagePlayer`, `VideoPlayer`, `MediaViewer` y `ReportContentAction`.
- **Criterios de aceptación verificados:**
  - Escenario 1: Grid autorizado adaptable (2 columnas móvil, 3-4 columnas desktop) y viewer modal dentro del viewport con controles completos de anterior, siguiente, cerrar y reportar.
  - Escenario 2: `GalleryEmptyState` claramente distinguible visual y semánticamente de `GalleryDisabledState`.
  - Escenario 3: Paginación y carga incremental por cursor: ante un fallo de red o error de bloque, se conservan los recuerdos previos intactos y se ofrece un botón de reintento accesible sin reiniciar ni borrar el grid.
  - Escenario 4: Si la media es retirada o el acceso/sesión es revocado mientras el visor está abierto, se bloquea la emisión de autorizaciones y se presenta un mensaje neutro respetuoso de la seguridad server-side sin filtrar información sensible (DEC-018, DEC-063, DEC-084).
- **Accesibilidad (WCAG 2.2 AA):**
  - Botones y tarjetas con touch targets ≥ 44×44px.
  - Gestión de foco estricta: foco en el modal al abrir y retorno de foco al cerrar a la tarjeta `GalleryMediaCard` activadora.
  - Navegación por teclado: Escape para cerrar, Flecha izquierda para anterior, Flecha derecha para siguiente.
  - `VideoPlayer` con controles nativos y sin autoplay forzado.
  - Ausencia absoluta de botones de descarga para invitados en la interfaz (DEC-063).
- **Pruebas:** 7 pruebas exhaustivas en `apps/web/src/app/gallery/gallery.component.spec.ts` (68/68 pruebas web PASS). Typecheck y build completados con 0 errores.
