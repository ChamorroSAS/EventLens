# EL-TK-179 — Medir soporte funcional y recuperación de recuerdos

## Parent epic
EL-EP-016

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Medición de soporte funcional y recuperación de recuerdos (DEC-053, DEC-054). Soporte comercial excluido de falla; eventos sin contenido excluidos del denominador de descarga. UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** equipo de producto, **quiero** calcular eventos sin soporte funcional y organizadores que descargan contenido, **para** evaluar autonomía y recuperación de valor.

## Alcance funcional
Medir proporción de eventos sin soporte funcional y proporción de organizadores con contenido que realizan al menos una descarga elegible.

## Fuera de alcance
Medir soporte comercial/no técnico como fallo o exigir descarga a eventos sin contenido.

## Criterios de aceptación
### Escenario 1
**Dado** evento no requiere soporte funcional, **cuando** se agrega, **entonces** cuenta favorablemente en la métrica.

### Escenario 2
**Dado** organizador tiene contenido y descarga, **cuando** se agrega, **entonces** cuenta como recuperación de recuerdos.

### Escenario 3
**Dado** organizador no tiene contenido, **cuando** se calcula denominador de descarga, **entonces** se excluye.

## Reglas de negocio
Objetivos: ≥80% eventos sin soporte funcional; ≥70% organizadores con contenido descargan.

## Validaciones y permisos
Producto/operación autorizados.

## Casos de error y estados vacíos
Clasificación soporte ambigua, evento duplicado, contenido inexistente y descarga anulada/inválida.

## Datos / contratos afectados
SupportMetric, RetrievalMetric, eligibility/denominator rules.

## Dependencias técnicas y funcionales
EL-TK-177; señales EL-EP-010/012.

## Dependencias de tickets
- **depends_on:** EL-TK-177; contratos EL-EP-010/012
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
