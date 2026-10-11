# EL-TK-183 — Generar el informe final reproducible de evaluación Beta

## Parent epic
EL-EP-016

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Generación reproducible del informe final de evaluación Beta a partir de snapshots inmutables de evidencia (DEC-057). UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** responsable de producto, **quiero** generar un informe con muestra, métricas, incidentes y clasificación, **para** tomar una decisión sustentada y repetir el análisis si cambian datos autorizados.

## Alcance funcional
Construir el informe final reproducible `BetaEvaluationReport` consumiendo el `BetaEvidenceSnapshot` inmutable y la clasificación generada en EL-TK-182, detallando periodo, cobertura real, numeradores/denominadores, comparación contra objetivos, incidentes operacionales, clasificación oficial, acciones correctivas y limitaciones declaradas (DEC-057).

## Fuera de alcance
Dashboard de producto, datos personales detallados, marketing o decisión automática de lanzamiento comercial.

## Criterios de aceptación
### Escenario 1
**Dado** un `BetaEvidenceSnapshot` y una clasificación de EL-TK-182, **cuando** se genera el informe, **entonces** consolida todas las métricas, cobertura y clasificación sin discordancias.

### Escenario 2
**Dado** existen limitaciones de muestra o gaps documentados, **cuando** se genera el informe, **entonces** los declara explícitamente sin ocultarlos tras promedios agregados.

### Escenario 3
**Dado** se vuelve a ejecutar la generación sobre el mismo `BetaEvidenceSnapshot`, **cuando** se procesa, **entonces** produce un informe byte-a-byte idéntico y reproducible con el mismo identificador de evidencia.

## Reglas de negocio
Críticos no pueden quedar ocultos por agregados (DEC-056). El informe consume estrictamente el `BetaEvidenceSnapshot` inmutable congelado por EL-TK-182. Separa objetivos de evaluación de garantías comerciales.

## Validaciones y permisos
Producto/operación autorizados; distribución controlada.

## Casos de error y estados vacíos
Snapshot incompleto, referencia de evidencia inválida, discrepancia entre snapshot y clasificación, fallo de renderizado.

## Datos / contratos afectados
BetaEvaluationReport, evidence snapshot consumption contract.

## Dependencias técnicas y funcionales
EL-TK-177..182 (especialmente el snapshot inmutable y clasificación de EL-TK-182).

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
