# EL-TK-182 — Clasificar el resultado de la Beta con prevalencia de incidentes críticos

## Parent epic
EL-EP-016

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Clasificación PASS, PASS_WITH_ACTIONS, EXTEND_BETA y FAIL_CRITICAL con prevalencia absoluta de incidentes críticos de seguridad y pérdida de datos (DEC-050..057). UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** responsable de producto, **quiero** clasificar la evaluación con evidencia completa, **para** decidir continuar, corregir, extender o detener sin ocultar riesgos críticos.

## Alcance funcional
Aplicar clasificación PASS, PASS_WITH_ACTIONS, EXTEND_BETA o FAIL_CRITICAL usando métricas, muestra y evidencia de seguridad/recuperación.

## Fuera de alcance
Decidir precio/lanzamiento automáticamente o convertir umbrales en contrato comercial.

## Criterios de aceptación
### Escenario 1
**Dado** métricas cumplen y no hay crítico, **cuando** se clasifica, **entonces** puede resultar PASS con evidencia.

### Escenario 2
**Dado** hay objetivos cercanos/no alcanzados pero riesgo controlado, **cuando** se evalúa, **entonces** puede quedar PASS_WITH_ACTIONS según decisión documentada.

### Escenario 3
**Dado** existe incidente grave de seguridad o pérdida sistemática, **cuando** se clasifica, **entonces** FAIL_CRITICAL prevalece aunque promedios sean favorables.

## Reglas de negocio
Seguridad grave/pérdida sistemática prevalece. No inventar regla automática para 'cerca'; requiere juicio documentado.

## Validaciones y permisos
Responsable autorizado.

## Casos de error y estados vacíos
Muestra insuficiente, evidencia contradictoria, gate de recovery no evaluado y datos faltantes.

## Datos / contratos afectados
BetaClassification, evidence refs, actions/gaps, rationale.

## Dependencias técnicas y funcionales
EL-TK-178..181 y evidencia EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-178, EL-TK-179, EL-TK-180, EL-TK-181; contrato EL-EP-014
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
