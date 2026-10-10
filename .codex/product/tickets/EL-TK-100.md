# EL-TK-100 — Integrar la biblioteca de media en la interfaz del organizador

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** organizador, **quiero** revisar la media de mi evento y sus estados desde una biblioteca responsive, **para** entender su disponibilidad y acceder a las acciones que correspondan a cada módulo.

## Alcance funcional
Integrar OrganizerMediaLibrary, OrganizerMediaCard, OrganizerMediaTable opcional, MediaStatusFilter y estados compartidos de procesamiento consumiendo contratos existentes de EL-EP-006.

## Fuera de alcance
Implementar acciones de moderación de EL-EP-008, descargas de EL-EP-010, reportes/admin o crear una segunda biblioteca específica por módulo.

## Criterios de aceptación
### Escenario 1
**Dado** media del evento, **cuando** el organizador abre la biblioteca, **entonces** ve sus estados autorizados y puede filtrar sin perder aislamiento del evento.

### Escenario 2
**Dado** PROCESSING_FAILED o estado técnico elegible, **cuando** se renderiza, **entonces** reutiliza los componentes/acciones definidos por EL-TK-054 sin duplicar reglas de retry.

### Escenario 3
**Dado** biblioteca vacía o filtro sin coincidencias, **cuando** se muestra, **entonces** ambos estados se distinguen de forma accesible.

## Reglas de negocio
EL-EP-007 presenta la biblioteca compartida; cada acción conserva ownership en su épica propietaria.

## Validaciones y permisos
Solo organizador propietario; capacidades del servidor determinan controles visibles/habilitados.

## Casos de error y estados vacíos
Vacío total, filtro vacío, error parcial de estado, media retirada, permiso vencido y conflicto de actualización.

## Datos / contratos afectados
Cliente OpenAPI de OrganizerMediaLibrarySnapshot y MediaStatus/capabilities.

## Dependencias técnicas y funcionales
EL-TK-098 y contratos UI/estado de EL-TK-053/054.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-053, EL-TK-054.
- **blocks:** EL-TK-101 y superficies downstream de moderación/descarga.

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
