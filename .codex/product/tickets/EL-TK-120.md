# EL-TK-120 — Consultar la cola y detalle de casos para revisión administrativa

## Parent epic
EL-EP-009

## Status
DRAFT

## User story
**Como** administración autorizada, **quiero** consultar reportes y solicitudes pendientes, **para** priorizar y revisar casos sin exponer media en la lista.

## Alcance funcional
Exponer ReportQueue/ReportDetail con filtros, severidad, estado, referencias sanitizadas, historial y capacidades; el preview de media requiere EL-TK-117.

## Fuera de alcance
Mostrar media sensible en la cola, ejecutar acciones destructivas desde la consulta sin autorización o seguimiento público.

## Criterios de aceptación
### Escenario 1
**Dado** existen casos abiertos, **cuando** admin consulta la cola, **entonces** recibe items sanitizados ordenables/priorizables.

### Escenario 2
**Dado** abre un detalle, **cuando** consulta, **entonces** ve historial, datos permitidos y acciones autorizadas sin preview automático.

### Escenario 3
**Dado** no hay casos/filtro sin resultados, **cuando** consulta, **entonces** se distinguen ambos estados.

## Reglas de negocio
La lista nunca necesita mostrar el recuerdo. Datos del reportante se minimizan según función.

## Validaciones y permisos
Solo admin autorizado.

## Casos de error y estados vacíos
Cola vacía, filtro vacío, caso ya resuelto, permiso vencido y error parcial.

## Datos / contratos afectados
ReportQueueSnapshot, ReportCaseDetail, filters, severity/status, capability map.

## Dependencias técnicas y funcionales
Clasificación EL-TK-116, resolución EL-TK-119 y auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-113, EL-TK-115, EL-TK-116
- **blocks:** EL-TK-122, EL-TK-123

## Pruebas requeridas
Filtros, prioridad, sanitización, cola vacía, actor ajeno y detalle.

## Observabilidad / auditoría
No loggear datos sensibles del reportante más allá de lo necesario.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-016, DEC-088, DEC-103; EL-EP-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
