# EL-TK-180 — Medir participación indicativa por evento

## Parent epic
EL-EP-016

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** calcular cuántos eventos alcanzan participación mínima, **para** tener una señal secundaria de uso real sin perfilar invitados.

## Alcance funcional
Calcular porcentaje de eventos con al menos tres sesiones guest válidas dentro de la cohorte Beta.

## Fuera de alcance
Perfiles de comportamiento, estadísticas para clientes, tracking cross-event o decisiones automáticas.

## Criterios de aceptación
### Escenario 1
**Dado** evento alcanza tres sesiones válidas, **cuando** se agrega, **entonces** cuenta como evento con participación indicativa.

### Escenario 2
**Dado** evento tiene sesiones revocadas/duplicadas, **cuando** se procesa, **entonces** solo se cuentan sesiones válidas según contrato.

### Escenario 3
**Dado** la métrica no alcanza objetivo, **cuando** se reporta, **entonces** se trata como señal indicativa y no oculta incidentes críticos.

## Reglas de negocio
Objetivo indicativo ≥60% de eventos con ≥3 sesiones; no prevalece sobre seguridad/pérdida.

## Validaciones y permisos
Producto/operación; identidad guest no se expone.

## Casos de error y estados vacíos
Sesión duplicada, evento interno, cohorte fuera de periodo y muestra insuficiente.

## Datos / contratos afectados
ParticipationMetric, event cohort/session count.

## Dependencias técnicas y funcionales
EL-TK-177 y EL-EP-004.

## Dependencias de tickets
- **depends_on:** EL-TK-177; contrato EL-EP-004
- **blocks:** EL-TK-182, EL-TK-183

## Pruebas requeridas
Conteo por evento, revocaciones, duplicados y privacidad.

## Observabilidad / auditoría
Solo conteos agregados; no session IDs en informes.

## Prioridad / estimación
P1 / M

## Traceability
DEC-055; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
