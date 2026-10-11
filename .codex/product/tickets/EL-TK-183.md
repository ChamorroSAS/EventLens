# EL-TK-183 — Generar el informe final reproducible de evaluación Beta

## Parent epic
EL-EP-016

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Generación reproducible del informe final de evaluación Beta a partir de snapshots inmutables de evidencia (DEC-057). UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** responsable de producto, **quiero** generar un informe con muestra, métricas, incidentes y clasificación, **para** tomar una decisión sustentada y repetir el análisis si cambian datos autorizados.

## Alcance funcional
Construir informe reproducible con periodo, cobertura, numeradores/denominadores, objetivos, resultados, incidentes relevantes, clasificación, acciones y limitaciones.

## Fuera de alcance
Dashboard producto, datos personales detallados, marketing o go-live automático.

## Criterios de aceptación
### Escenario 1
**Dado** evaluación tiene evidencia suficiente, **cuando** se genera, **entonces** incluye todas las métricas/objetivos y clasificación.

### Escenario 2
**Dado** hay muestra insuficiente o gaps, **cuando** se genera, **entonces** los declara explícitamente.

### Escenario 3
**Dado** se vuelve a generar con mismo snapshot, **cuando** se ejecuta, **entonces** produce resultados consistentes.

## Reglas de negocio
Críticos no pueden quedar ocultos por agregados. Informe separa objetivos de garantías.

## Validaciones y permisos
Producto/operación autorizados; distribución controlada.

## Casos de error y estados vacíos
Snapshot incompleto, métrica no reproducible, referencia de evidencia perdida y fallo de generación.

## Datos / contratos afectados
BetaEvaluationReport, immutable evidence snapshot/reference.

## Dependencias técnicas y funcionales
EL-TK-177..182.

## Dependencias de tickets
- **depends_on:** EL-TK-177, EL-TK-178, EL-TK-179, EL-TK-180, EL-TK-181, EL-TK-182
- **blocks:** decisión operativa posterior a la Beta

## Pruebas requeridas
Reproducibilidad, completitud, clasificación, gaps y minimización.

## Observabilidad / auditoría
Artefacto final sin PII innecesaria ni IDs guest.

## Prioridad / estimación
P1 / M

## Traceability
Q-028; DEC-050..057; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
