# EL-TK-100 — Integrar la biblioteca de media en la interfaz del organizador

## Parent epic
EL-EP-007

## Status
DONE

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES

## User story
**Como** organizador, **quiero** revisar la media de mi evento y sus estados desde una biblioteca responsive, **para** entender su disponibilidad y acceder a las acciones que correspondan a cada módulo.

## Alcance funcional
Integrar OrganizerMediaLibrary, OrganizerMediaCard, OrganizerMediaTable opcional, MediaStatusFilter y estados compartidos de procesamiento consumiendo contratos existentes de EL-EP-006 (EL-TK-053/054) y catálogo de organizador (§8.1..4).

## Fuera de alcance
Implementar acciones de moderación de EL-EP-008, descargas de EL-EP-010, reportes/admin o crear una segunda biblioteca específica por módulo.

## Criterios de aceptación
### Escenario 1
**Dado** media del evento, **cuando** el organizador abre la biblioteca, **entonces** ve sus estados autorizados y puede filtrar sin perder aislamiento del evento.

### Escenario 2
**Dado** PROCESSING_FAILED o estado técnico elegible, **cuando** se renderiza, **entonces** reutiliza los componentes/acciones definidos por EL-TK-054 (`ProcessingFailedPanel`, `RetryProcessingAction`) sin duplicar reglas de retry.

### Escenario 3
**Dado** biblioteca vacía o filtro sin coincidencias, **cuando** se muestra, **entonces** ambos estados se distinguen de forma accesible (`EMPTY_LIBRARY` vs `EMPTY_FILTER_RESULTS`).

## Reglas de negocio
EL-EP-007 presenta la biblioteca compartida del organizador; cada acción conserva ownership en su épica propietaria (retry técnico en EL-EP-006, moderación en EL-EP-008, descarga en EL-EP-010).

## Validaciones y permisos
Solo organizador propietario autenticado; capacidades del servidor determinan controles visibles y habilitados.

## Casos de error y estados vacíos
Vacío total (`EMPTY_LIBRARY`), filtro vacío (`EMPTY_FILTER_RESULTS`), error parcial de estado, media retirada, permiso vencido y conflicto de actualización.

## Datos / contratos afectados
Cliente OpenAPI de OrganizerMediaLibrarySnapshot y MediaStatus/capabilities.

## Dependencias técnicas y funcionales
EL-TK-098 y contratos UI/estado de EL-TK-053/054.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-053, EL-TK-054.
- **blocks:** EL-TK-102.

## Pruebas requeridas
Component/unit, filtros, estados, actor ajeno, responsive, teclado/foco y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin auditoría adicional de render; acciones delegan auditoría al comando propietario.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016; DEC-003, DEC-018, DEC-032, DEC-033, DEC-037, DEC-076; EL-EP-007, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Integración UI/UX y Readiness — 2026-10-10

- **Handoff canónico:** Conforme a `.codex/context/ui-mvp-epic-review.md#el-ep-007` y catálogo de componentes (§8.1..4).
- **Componentes reutilizados (sin componentes huérfanos):**
  - `OrganizerMediaLibrary`: Contenedor principal de la biblioteca del organizador con barra de herramientas y filtros.
  - `OrganizerMediaCard`: Tarjeta para vista de grid móvil con thumbnail, badge de estado (`UPLOADED`, `PROCESSING`, `READY`, `FAILED`, `QUARANTINED`), fecha y metadatos básicos.
  - `OrganizerMediaTable`: Vista tabular accesible opcional para desktop/pantallas anchas.
  - `MediaStatusFilter`: Barra o desplegable accesible para filtrar por estado (`Todos`, `Publicados`, `En procesamiento`, `Con fallos`, `En cuarentena`).
  - `ProcessingFailedPanel` / `RetryProcessingAction`: Componentes de EL-TK-054 incrustados contextualmente para ítems en fallo técnico procesable.
- **Diferenciación de estados:**
  - Sin medios: `"Aún no hay fotos ni videos subidos en este evento."`
  - Filtro sin resultados: `"No hay medios que coincidan con el filtro seleccionado."` con acción directa para limpiar filtros.
- **Accesibilidad y Responsive (WCAG 2.2 AA):**
  - Diseño apilado en móvil y flexible en tablet/desktop.
  - Cambio de filtros accesible sin recarga abrupta de página ni salto destructivo de foco.
  - Contrastes conformes a tokens de diseño y controles interactivos ≥ 44×44px.

## Evidencia de implementación y verificación — 2026-10-12

- **Contratos y Tipos (`apps/web/src/app/media/media.types.ts`):**
  - Añadido `MediaStatusFilter` (`ALL`, `PUBLISHED`, `PROCESSING`, `PROCESSING_FAILED`, `QUARANTINED`, `PENDING_REVIEW`, `HIDDEN`, `REJECTED`, `TRASHED`).
  - Añadido `EmptyReason` (`EMPTY_LIBRARY`, `EMPTY_FILTER_RESULTS`).
  - Añadido modelo `OrganizerMediaLibrarySnapshotModel`.
  - Extendido `MediaCardModel` con atributos opcionales de metadatos (`mimeType`, `sizeBytes`, `createdAt`).
- **Servicio (`apps/web/src/app/media/media-library.service.ts`):**
  - Implementado `MediaLibraryService` con método `getOrganizerMediaLibrary(...)` que consulta con aislamiento por `eventRef` y serialización de filtros/paginación, manejando errores `ACCESS_DENIED` (403), `EVENT_NOT_FOUND` (404) y `COMMUNICATION_ERROR`.
- **Componentes (`apps/web/src/app/media/`):**
  - `MediaStatusFilterComponent`: Toolbar accesible con `role="toolbar"` y botones con estado `aria-pressed`, altura mínima de 44px, indicación visual de foco y opción activa sin depender exclusivamente del color.
  - `OrganizerMediaTableComponent`: Vista tabular accesible opcional para desktop/pantallas anchas con `caption`, `th scope="col"`, badges legibles de estado y seguridad, e integración contextual de acciones de reintento (`RetryProcessingActionComponent`) y descarga (`DownloadOriginalActionComponent`).
  - `OrganizerMediaLibraryComponent`: Contenedor principal con header, contador de ítems, conmutador de vista cuadrícula/tabla, botón de actualización, filtrado sin recarga de página, diferenciación accesible de estados vacíos (`EMPTY_LIBRARY` vs `EMPTY_FILTER_RESULTS` con botón "Limpiar filtros"), y manejo de carga y error con botón de reintento.
  - `index.ts`: Barrel export unificado de tipos, servicios y componentes multimedia.
- **Integración en Navegación del Organizador (`apps/web/src/app/organizer/`):**
  - Incorporada sección `'media'` en `EventSettingsSection` y `EventSettingsNavComponent`.
  - Integrado renderizado de `OrganizerMediaLibraryComponent` dentro de `OrganizerDashboardComponent` en el workspace del evento seleccionado.
- **Pruebas y Verificación Automatizada:**
  - Suite unitaria dedicada `apps/web/src/app/media/organizer-media-library.component.spec.ts` (6/6 PASS):
    - Escenario 1: Renderizado con estados autorizados y filtrado preservando aislamiento estricto de `eventRef`.
    - Escenario 2: Reutilización de componentes `ProcessingFailedPanel` y `RetryProcessingAction` de EL-TK-054 para ítems en `PROCESSING_FAILED`.
    - Escenario 3A: Discriminación y renderizado accesible de `EMPTY_LIBRARY` ("Aún no hay fotos ni videos subidos en este evento.").
    - Escenario 3B: Discriminación y renderizado de `EMPTY_FILTER_RESULTS` ("No hay medios que coincidan con el filtro seleccionado.") con acción interactiva de "Limpiar filtros".
    - Escenario 4: Conmutación fluida entre vista de cuadrícula y vista de tabla accesible (`OrganizerMediaTable`).
    - Escenario 5: Manejo de errores de conexión y autorización (`ACCESS_DENIED`) con recuperación vía botón de reintento.
    - Escenario 6: Cumplimiento de accesibilidad WCAG 2.2 AA (roles, etiquetas aria, áreas táctiles ≥ 44×44px, contraste).
  - Suite completa `@eventlens/web`: 72/72 pruebas PASS en 14 suites.
  - Verificación de tipos (`node scripts/workspace.mjs typecheck`): Clean (`ngc --noEmit` exit 0 across workspace).
  - Verificación de build (`node scripts/workspace.mjs build`): Clean (bundle Angular generado exitosamente, 114.77 kB).

