# EL-TK-100 — Integrar la biblioteca de media en la interfaz del organizador

## Parent epic
EL-EP-007

## Status
READY

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
