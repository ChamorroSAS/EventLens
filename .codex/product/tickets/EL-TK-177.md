# EL-TK-177 — Definir el contrato de métricas agregadas de la Beta

## Parent epic
EL-EP-016

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado el contrato de métricas agregadas de la Beta (`BetaMetricFact`, `MetricAggregate`, `BetaEvaluationSummary`, `BetaMetricsAggregator`) en `@eventlens/observability` conforme a DEC-050..057 y Q-028:
- Denominadores explícitos con exclusión formal de cancelaciones voluntarias en cargas válidas (`VALID_UPLOADS`), preservando la precisión del gate del 95%.
- Aislamiento de eventos sin contenido (`hasContent: false`), previniendo la contaminación de denominadores en soporte funcional (`EVENTS_WITHOUT_FUNCTIONAL_SUPPORT`) y descargas de organizadores (`ORGANIZER_CONTENT_DOWNLOADS`).
- Discriminador determinista de cohorte `CohortInclusion` (`ELIGIBLE_REAL`, `EXCLUDED_INTERNAL_TEST`, `EXCLUDED_OUT_OF_WINDOW`), asegurando que las pruebas internas nunca afecten la evaluación de la cohorte real.
- Métricas con numerador, denominador, tasa/percentiles (p50/p95 para fotos/videos), periodo explícito y verificación de gates de evaluación objetivos (no SLA).
- Suite de pruebas unitarias verificada: `beta-metrics.unit.test.ts` (6/6). Suite de observability en 66/66 pruebas verdes.

## User story
**Como** responsable de producto y operación, **quiero** contar eventos, sesiones, cargas, procesamiento, descargas y soporte con denominadores explícitos, **para** evaluar la Beta con métricas reproducibles y minimizadas.

## Alcance funcional
Definir dimensiones, numeradores/denominadores y exclusiones para cargas válidas, éxito foto/video, latencias, soporte funcional, descargas de organizadores y participación indicativa.

## Fuera de alcance
Tracking publicitario, perfiles sociales, dashboard de cliente o decisiones automáticas de lanzamiento.

## Criterios de aceptación
### Escenario 1
**Dado** se registra una carga cancelada voluntariamente, **cuando** se agrega la métrica, **entonces** no se cuenta como fallo de carga válida.

### Escenario 2
**Dado** un evento no tiene contenido, **cuando** se evalúan métricas dependientes de contenido, **entonces** no contamina denominadores no aplicables.

### Escenario 3
**Dado** se calcula una tasa, **cuando** se publica evidencia, **entonces** incluye numerador, denominador y periodo.

## Reglas de negocio
Métricas son agregadas/minimizadas. Objetivos son gates de evaluación, no SLA ni garantías contractuales.

## Validaciones y permisos
Solo producto/operación autorizados acceden a evidencia detallada; reportes finales minimizados.

## Casos de error y estados vacíos
Denominador cero, dato incompleto, doble conteo, evento de prueba interna y reloj inválido.

## Datos / contratos afectados
BetaMetricFact, MetricAggregate, denominator policy, cohort/period; BetaEvaluationCohort con discriminador determinista cohort_inclusion (ELIGIBLE_REAL | EXCLUDED_INTERNAL_TEST | EXCLUDED_OUT_OF_WINDOW).

## Dependencias técnicas y funcionales
Consume señales existentes de cargas/proceso/descarga/soporte y contrato de telemetría/métricas EL-TK-168 (dejando la evidencia operacional completa de EL-EP-014 para la clasificación EL-TK-182/183).

## Dependencias de tickets
- **depends_on:** contratos de dominios propietarios; contrato de telemetría EL-TK-168
- **blocks:** EL-TK-178, EL-TK-179, EL-TK-180, EL-TK-181, EL-TK-182, EL-TK-183

## Pruebas requeridas
Denominadores, cancelaciones, eventos vacíos, dedupe, cohortes y minimización.

## Observabilidad / auditoría
Registrar calidad/cobertura de datos sin identidad anónima innecesaria.

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
