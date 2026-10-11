# EL-TK-178 — Medir confiabilidad de cargas y procesamiento multimedia

## Parent epic
EL-EP-016

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** calcular éxito y latencias de carga/procesamiento, **para** comparar la Beta contra objetivos de confiabilidad.

## Alcance funcional
Calcular cargas válidas exitosas, éxito de fotos/videos sin intervención y latencias mediana/p95 con exclusiones definidas.

## Fuera de alcance
Optimizar pipeline, cambiar thresholds operativos o medir transcodificaciones internas como objetivo de usuario.

## Criterios de aceptación
### Escenario 1
**Dado** cohorte tiene cargas válidas, **cuando** se agrega, **entonces** se calcula tasa de éxito con cancelaciones voluntarias excluidas.

### Escenario 2
**Dado** fotos/videos procesados, **cuando** se evalúa, **entonces** se calculan tasas separadas sin intervención.

### Escenario 3
**Dado** hay suficientes latencias, **cuando** se agrega, **entonces** se reportan mediana y p95 por tipo.

## Reglas de negocio
Objetivos: cargas válidas ≥95%; fotos ≥98%; video ≥95%; foto mediana/p95 ≤15/60s; video ≤2/5min.

## Validaciones y permisos
Producto/operación autorizados.

## Casos de error y estados vacíos
Muestra insuficiente, latencia faltante, outlier inválido y dato duplicado.

## Datos / contratos afectados
ReliabilityMetrics, latency distributions, sample sizes.

## Dependencias técnicas y funcionales
EL-TK-177 y señales EL-EP-005/006.

## Dependencias de tickets
- **depends_on:** EL-TK-177; contratos EL-EP-005/006
- **blocks:** EL-TK-182, EL-TK-183

## Pruebas requeridas
Tasas, percentiles, exclusiones, muestras pequeñas y duplicados.

## Observabilidad / auditoría
Métricas agregadas sin object keys ni nombres de invitados.

## Prioridad / estimación
P1 / M

## Traceability
DEC-050, DEC-051, DEC-052; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
