# EL-TK-116 — Clasificar severidad y priorizar denuncias para revisión administrativa

## Parent epic
EL-EP-009

## Status
DRAFT

## User story
**Como** administración autorizada, **quiero** clasificar un caso y su severidad, **para** priorizar atención sin ocultar automáticamente por la sola denuncia.

## Alcance funcional
Permitir clasificación administrativa de reportes y solicitudes, aplicar prioridad operativa y emitir alerta prioritaria para casos graves.

## Fuera de alcance
Ocultar automáticamente por categoría declarada, resolver legalmente el caso o definir SLA contractual.

## Criterios de aceptación
### Escenario 1
**Dado** un caso recibido, **cuando** admin clasifica severidad, **entonces** queda priorizado y auditable.

### Escenario 2
**Dado** se clasifica grave, **cuando** se guarda, **entonces** se emite la señal prioritaria sin cambiar visibilidad por ese solo hecho.

### Escenario 3
**Dado** se cambia clasificación, **cuando** se confirma, **entonces** se conserva historial del actor y motivo.

## Reglas de negocio
DEC-088: la denuncia grave alerta; ocultamiento requiere decisión separada. 24/72h son objetivos internos.

## Validaciones y permisos
Solo principal administrativo autorizado.

## Casos de error y estados vacíos
Caso cerrado/no editable, actor sin permiso, conflicto y clasificación inválida.

## Datos / contratos afectados
CaseClassification, severity, priority, actor, reason, timestamps, alert event.

## Dependencias técnicas y funcionales
Auth admin EL-TK-044 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-113, EL-TK-044; contrato EL-EP-014
- **blocks:** EL-TK-117, EL-TK-118, EL-TK-119, EL-TK-120, EL-TK-122, EL-TK-123

## Pruebas requeridas
Normal/grave, no auto-hide, historial, actor ajeno y concurrencia.

## Observabilidad / auditoría
Auditar clasificación/motivo; alerta sin contenido sensible innecesario.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-016, DEC-088; EL-EP-009, EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
