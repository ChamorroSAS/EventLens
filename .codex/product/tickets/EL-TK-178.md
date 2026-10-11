# EL-TK-178 — Medir confiabilidad de cargas y procesamiento multimedia

## Parent epic
EL-EP-016

## Status
DONE

**CONFIRMED — 2026-10-11:** Métricas de confiabilidad de cargas y procesamiento multimedia para Beta implementadas al 100% mediante `BetaReliabilityService` (`packages/observability/src/beta-reliability-service.ts`), contratos correspondientes en `packages/observability/src/contracts.ts` y tests unitarios en `packages/observability/test/beta-reliability-service.unit.test.ts`.
- **Escenario 1 (Cargas válidas con cancelaciones voluntarias excluidas):** Agregación determinística de hechos de carga de cohorte excluyendo cancelaciones voluntarias (`voluntarilyCancelled: true`, DEC-050) y cargas de pruebas internas (`isInternalTest: true`). Se evalúa el objetivo $\ge$ 95% con cálculo preciso de tasa de éxito.
- **Escenario 2 (Tasas separadas para fotos y videos sin intervención manual):** Evaluación diferenciada de procesamiento para fotos y videos verificando no intervención manual (`manualInterventionRequired: false`, DEC-051). Se comparan contra los umbrales de objetivo de foto $\ge$ 98% y video $\ge$ 95%.
- **Escenario 3 (Distribución de latencias mediana y p95 por tipo de medio):** Cálculo exacto de percentiles (mediana y p95) sobre latencias válidas para fotos y videos (DEC-052). Validación de objetivos: foto mediana $\le$ 15s y p95 $\le$ 60s; video mediana $\le$ 120s (2 min) y p95 $\le$ 300s (5 min).
- **Manejo de bordes, duplicados y privacidad:** Deduplicación determinística por ID de hecho, descarte de latencias faltantes/negativas/outliers corruptos, manejo seguro de muestras insuficientes con banderas informativas, y reporte estrictamente numérico/agregado libre de object keys y nombres de invitados. Suite completa PASS (105/105 tests en 23 archivos en `@eventlens/observability`).
**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Métricas de confiabilidad de cargas y proceso multimedia con exclusión de cancelaciones voluntarias (DEC-050, DEC-051, DEC-052). UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

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
