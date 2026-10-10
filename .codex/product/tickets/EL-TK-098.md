# EL-TK-098 — Consultar la biblioteca de media del organizador

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** consultar la media de mi evento con sus estados relevantes, **para** entender qué recuerdos están disponibles, procesándose o requieren atención.

## Alcance funcional
Exponer una consulta paginada y filtrable de media del evento propio para la biblioteca del organizador, incluyendo referencias de estado y capacidades autorizadas sin inventar estados nuevos.

## Fuera de alcance
Moderación/aprobar/rechazar/ocultar/papelera de EL-EP-008, descargas de originales de EL-EP-010 o administración global.

## Criterios de aceptación
### Escenario 1
**Dado** un organizador propietario, **cuando** consulta su biblioteca, **entonces** recibe solo media de ese evento con estados autorizados.

### Escenario 2
**Dado** media en procesamiento o fallo técnico, **cuando** aparece en la biblioteca, **entonces** consume el estado/capacidades de EL-TK-053/054 sin exponer jobs internos.

### Escenario 3
**Dado** filtros o paginación, **cuando** se aplican, **entonces** los resultados permanecen aislados al evento y no convierten ausencia de resultados en ausencia de media total.

## Reglas de negocio
La biblioteca owner puede mostrar estados que la galería guest nunca expone, pero las acciones pertenecen a sus épicas propietarias.

## Validaciones y permisos
Solo propietario autenticado del evento; autorización server-side.

## Casos de error y estados vacíos
Biblioteca vacía, filtro sin resultados, media retirada, datos parciales de estado y error temporal.

## Datos / contratos afectados
OrganizerMediaLibrarySnapshot, MediaSummary, status/capabilities references, pagination/filter contract.

## Dependencias técnicas y funcionales
Evento propio y contratos de estado/capacidades de EL-TK-053/054.

## Dependencias de tickets
- **depends_on:** EL-TK-047, EL-TK-053.
- **blocks:** EL-TK-100, EL-TK-101.

## Pruebas requeridas
Aislamiento owner/evento, estados, filtros, paginación, vacíos y actor ajeno.

## Observabilidad / auditoría
Lectura normal sin secretos ni detalles internos de jobs.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016; DEC-003, DEC-018, DEC-032, DEC-033, DEC-037; EL-EP-007, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
