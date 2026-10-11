# EL-TK-179 — Medir soporte funcional y recuperación de recuerdos

## Parent epic
EL-EP-016

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Medición de soporte funcional y recuperación de recuerdos (DEC-053, DEC-054). Soporte comercial excluido de falla; eventos sin contenido excluidos del denominador de descarga. UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** equipo de producto, **quiero** calcular eventos sin soporte funcional y organizadores que descargan contenido, **para** evaluar autonomía y recuperación de valor.

## Alcance funcional
Medir proporción de eventos sin soporte funcional (identificado de forma reproducible a través de incidentes operacionales de EL-TK-173 o intervenciones administrativas de EL-EP-012 con tipificación `category: FUNCTIONAL`, excluyendo consultas comerciales o dudas no técnicas) y proporción de organizadores con contenido que realizan al menos una descarga elegible de recuerdos.

## Fuera de alcance
Medir soporte comercial/no técnico como fallo, crear un módulo completo de ticketing/helpdesk, o exigir descarga a eventos sin contenido.

## Criterios de aceptación
### Escenario 1
**Dado** evento no registra incidentes con categoría `FUNCTIONAL`, **cuando** se agrega, **entonces** se computa determinísticamente como evento sin soporte funcional.

### Escenario 2
**Dado** evento registra consultas comerciales o dudas de configuración no catalogadas como falla funcional del sistema, **cuando** se agrega, **entonces** se excluye de la penalización de soporte funcional.

### Escenario 3
**Dado** organizador tiene contenido y descarga, **cuando** se agrega, **entonces** cuenta como recuperación de recuerdos; si no tiene contenido, se excluye del denominador.

## Reglas de negocio
Objetivos: ≥80% eventos sin soporte funcional; ≥70% organizadores con contenido descargan (DEC-054, DEC-055). Clasificación de soporte exige tipificación explícita `category: FUNCTIONAL | COMMERCIAL_OR_NON_TECHNICAL`.

## Validaciones y permisos
Producto/operación autorizados.

## Casos de error y estados vacíos
Clasificación soporte ambigua (se clasifica como no funcional por defecto si no hay evidencia), evento duplicado, contenido inexistente y descarga anulada/inválida.

## Datos / contratos afectados
SupportMetric (required_functional_support: boolean, incident_refs), RetrievalMetric, eligibility/denominator rules.

## Dependencias técnicas y funcionales
EL-TK-177; contratos EL-EP-010/012 e incidentes operacionales EL-TK-173.

## Dependencias de tickets
- **depends_on:** EL-TK-177; contratos EL-EP-010/012, EL-TK-173
- **blocks:** EL-TK-182, EL-TK-183

## Pruebas requeridas
Soporte funcional vs comercial, denominadores, descargas y dedupe.

## Observabilidad / auditoría
No conservar texto de soporte ni contenido multimedia en métricas.

## Prioridad / estimación
P1 / M

## Traceability
DEC-053, DEC-054; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
