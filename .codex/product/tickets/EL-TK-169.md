# EL-TK-169 — Detectar degradación de JobQueue, workers y procesamiento

## Parent epic
EL-EP-014

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Detección de colas degradadas, jobs DEAD/abandonados y deduplicación de alertas operativas (DEC-034, DEC-064). REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (UI_REQUIRED: NO).

## User story
**Como** equipo operativo, **quiero** recibir señales sobre colas y procesamiento anómalos, **para** intervenir antes de que trabajos queden abandonados o acumulados.

## Alcance funcional
Derivar alertas operativas sobre profundidad/edad de cola, retries, DEAD, PROCESSING abandonados, workers/scheduler no saludables y tiempos de procesamiento.

## Fuera de alcance
Definir SLA empresarial, cambiar política de retry o operar jobs directamente.

## Criterios de aceptación
### Escenario 1
**Dado** edad/profundidad supera criterio configurado, **cuando** se evalúa, **entonces** se genera alerta operativa deduplicada.

### Escenario 2
**Dado** aparecen jobs DEAD o abandonados, **cuando** se observa, **entonces** se registra señal priorizable con referencias sanitizadas.

### Escenario 3
**Dado** la condición vuelve a normal, **cuando** se evalúa, **entonces** se resuelve/rearma la alerta sin spam.

## Reglas de negocio
Umbrales son configuración operativa, no nuevos límites de producto. Redis no es obligatorio.

## Validaciones y permisos
Solo operación autorizada ve referencias/alertas.

## Casos de error y estados vacíos
Datos incompletos, métrica stale, replay y tormenta de alertas.

## Datos / contratos afectados
OperationalAlert, queue/process signal, dedup/rearm state.

## Dependencias técnicas y funcionales
EL-TK-168 y JobQueue vigente.

## Dependencias de tickets
- **depends_on:** EL-TK-168; contrato JobQueue
- **blocks:** EL-TK-173, EL-TK-176

## Pruebas requeridas
Profundidad/edad/retry/DEAD/abandonado, dedupe, recovery y señales stale.

## Observabilidad / auditoría
Alertas no incluyen payloads grandes ni errores sin sanitizar.

## Prioridad / estimación
P0 / M

## Traceability
DEC-034, DEC-064; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
