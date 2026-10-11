# EL-TK-138 — Emitir señales deduplicadas de uso al 80 y 100 por ciento

## Parent epic
EL-EP-011

## Status
DRAFT

## User story
**Como** sistema, **quiero** detectar cruces de umbral de capacidad, **para** avisar sin spam cuando el evento se acerca o alcanza su límite.

## Alcance funcional
Evaluar snapshots de consumo efectivos y emitir hechos de umbral 80%/100% con deduplicación y rearmado cuando el uso cae por debajo conforme contrato.

## Fuera de alcance
Enviar email/panel directamente o inventar frecuencias adicionales.

## Criterios de aceptación
### Escenario 1
**Dado** el uso cruza 80%, **cuando** se evalúa, **entonces** se emite una sola señal vigente.

### Escenario 2
**Dado** refrescos repetidos permanecen sobre 80%, **cuando** se evalúan, **entonces** no se emiten duplicados equivalentes.

### Escenario 3
**Dado** el uso alcanza 100%, **cuando** se evalúa, **entonces** se emite señal de capacidad agotada independiente del 80%.

## Reglas de negocio
La señal usa estado del servidor y no autoriza cargas. EL-EP-013 decide comunicación.

## Validaciones y permisos
Sistema; datos aislados por evento.

## Casos de error y estados vacíos
Snapshot inválido, replay y cambio concurrente de consumo.

## Datos / contratos afectados
UsageThresholdReached event, threshold, snapshotVersion, dedup key.

## Dependencias técnicas y funcionales
Snapshot EL-TK-135 y notificaciones EL-EP-013.

## Dependencias de tickets
- **depends_on:** EL-TK-135, EL-TK-137
- **blocks:** consumidor EL-EP-013; EL-TK-145

## Pruebas requeridas
Cruces 80/100, no spam, descenso/recruce e idempotencia.

## Observabilidad / auditoría
Métricas de umbrales sin datos personales.

## Prioridad / estimación
P0 / M

## Traceability
DEC-027, DEC-079; EL-EP-011, EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
