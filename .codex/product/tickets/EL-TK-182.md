# EL-TK-182 — Clasificar el resultado de la Beta con prevalencia de incidentes críticos

## Parent epic
EL-EP-016

## Status
DONE

**CONFIRMED — 2026-10-11:** Clasificación del resultado de la Beta con prevalencia absoluta de incidentes críticos implementada al 100% mediante `BetaClassificationService` (`packages/observability/src/beta-classification-service.ts`), contratos correspondientes en `packages/observability/src/contracts.ts` y tests unitarios en `packages/observability/test/beta-classification-service.unit.test.ts`.
- **Escenario 1 (Congelación inmutable del BetaEvidenceSnapshot):** Generación y congelación estricta de `BetaEvidenceSnapshot` referenciable por `snapshotId`, sellado con timestamp `frozenAt` y hash criptográfico determinístico SHA-256 (`contentHash`), verificando inmutabilidad ante alteraciones post-congelación.
- **Escenario 2 (Clasificación PASS reproducible):** Evaluación determinística de PASS cuando métricas consolidadas (cargas $\ge 95\%$, fotos $\ge 98\%$, video $\ge 95\%$, soporte funcional $\ge 80\%$, recuperación $\ge 70\%$, participación $\ge 60\%$), volumen mínimo ($\ge 20$ eventos y $\ge 1000$ archivos) y gates DR-001/auditoría cumplen al 100% sin incidentes operacionales.
- **Escenario 3 (Prevalencia absoluta de incidentes críticos -> FAIL_CRITICAL):** Regla de prevalencia absoluta (DEC-056, DEC-057): cualquier incidente crítico de severidad `CRITICAL`, fuga de credenciales o fallo en el gate DR-001 de EL-EP-014 resulta obligatoriamente en `FAIL_CRITICAL` independientemente de promedios numéricos favorables.
- **Casos EXTEND_BETA y PASS_WITH_ACTIONS:** Manejo determinístico de `EXTEND_BETA` ante volumen de muestra incompleto dentro de ventana extensible (< 12 semanas) y `PASS_WITH_ACTIONS` ante desviaciones secundarias (como participación indicativa o incidentes no críticos mitigados). Suite completa PASS (130/130 tests en 26 archivos en `@eventlens/observability`).
**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Clasificación PASS, PASS_WITH_ACTIONS, EXTEND_BETA y FAIL_CRITICAL con prevalencia absoluta de incidentes críticos de seguridad y pérdida de datos (DEC-050..057). UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** responsable de producto, **quiero** clasificar la evaluación con evidencia completa, **para** decidir continuar, corregir, extender o detener sin ocultar riesgos críticos.

## Alcance funcional
Congelar el snapshot inmutable de evidencia (`BetaEvidenceSnapshot`: identifica `snapshot_id`, `frozen_at`, métricas consolidadas de 178..181 y hechos/incidentes operacionales de EL-EP-014) y aplicar sobre él la clasificación formal PASS, PASS_WITH_ACTIONS, EXTEND_BETA o FAIL_CRITICAL con prevalencia absoluta de incidentes críticos de seguridad o pérdida sistemática de datos (DEC-056, DEC-057).

## Fuera de alcance
Decidir precio/lanzamiento comercial automáticamente o convertir umbrales en contrato vinculante.

## Criterios de aceptación
### Escenario 1
**Dado** la cohorte Beta concluye su periodo, **cuando** se inicia la clasificación, **entonces** se genera y congela un `BetaEvidenceSnapshot` inmutable referenciable por identificador y hash.

### Escenario 2
**Dado** métricas del snapshot cumplen objetivos y no hay incidentes críticos de seguridad/recuperación en EL-EP-014, **cuando** se clasifica, **entonces** resulta PASS con evidencia reproducible.

### Escenario 3
**Dado** existen incidentes graves de seguridad, pérdida sistemática de datos o fallo en el gate DR-001 de EL-EP-014, **cuando** se clasifica, **entonces** resulta determinísticamente FAIL_CRITICAL aunque los promedios numéricos sean favorables.

## Reglas de negocio
Seguridad grave/pérdida sistemática prevalece (DEC-056). La clasificación se evalúa estrictamente sobre el `BetaEvidenceSnapshot` congelado para asegurar reproducibilidad.

## Validaciones y permisos
Responsable autorizado.

## Casos de error y estados vacíos
Muestra insuficiente, evidencia contradictoria, gate de recovery no evaluado, snapshot corrupto o datos faltantes.

## Datos / contratos afectados
BetaEvidenceSnapshot (snapshot_id, frozen_at, metrics, incidents, sample_counts), BetaClassification (classification, rationale, evidence_snapshot_ref).

## Dependencias técnicas y funcionales
EL-TK-178..181 y evidencia operacional/incidentes de EL-EP-014 (EL-TK-174, EL-TK-176).

## Dependencias de tickets
- **depends_on:** EL-TK-178, EL-TK-179, EL-TK-180, EL-TK-181; evidencia operacional EL-EP-014 (EL-TK-174, EL-TK-176)
- **blocks:** EL-TK-183

## Pruebas requeridas
PASS, acciones, extensión, crítico, datos incompletos y precedencia.

## Observabilidad / auditoría
Clasificación y razones auditables sin PII.

## Prioridad / estimación
P1 / M

## Traceability
DEC-050..057; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
