# EL-TK-170 — Detectar fallos de storage, base de datos, scheduler y disponibilidad

## Parent epic
EL-EP-014

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Alertas de infraestructura (DB, storage, scheduler) y disponibilidad agregada sin comprometer SLA comercial (DEC-034, DEC-061..064, DEC-106). REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (UI_REQUIRED: NO).

## User story
**Como** equipo operativo, **quiero** detectar fallos de infraestructura crítica, **para** identificar pérdida de disponibilidad o riesgo de recuperación.

## Alcance funcional
Generar alertas neutrales de proveedor para DB, storage, scheduler, API/workers y disponibilidad observada, incluyendo fallos de backup/purga cuando exista señal.

## Fuera de alcance
Seleccionar proveedor, prometer 99.5% contractual o ejecutar recovery automáticamente.

## Criterios de aceptación
### Escenario 1
**Dado** DB/storage deja de responder, **cuando** se observa, **entonces** se genera alerta con componente y severidad operativa.

### Escenario 2
**Dado** scheduler deja de avanzar checkpoints, **cuando** se observa, **entonces** se detecta estancamiento.

### Escenario 3
**Dado** disponibilidad se degrada, **cuando** se agrega medición, **entonces** se registra evidencia para evaluación sin llamarla SLA.

## Reglas de negocio
99.5% mensual es objetivo, no SLA. Señales deben ser verificables en entorno Beta.

## Validaciones y permisos
Operación autorizada.

## Casos de error y estados vacíos
Falso positivo, collector caído, dependencia parcial y reloj inconsistente.

## Datos / contratos afectados
InfrastructureAlert, availability measurement, component health.

## Dependencias técnicas y funcionales
EL-TK-168; baseline EL-TD-008.

## Dependencias de tickets
- **depends_on:** EL-TK-168
- **blocks:** EL-TK-173, EL-TK-174, EL-TK-176

## Pruebas requeridas
DB/storage/scheduler/workers, caída parcial, recuperación y dedupe.

## Observabilidad / auditoría
Sin credenciales, DSN ni object keys en alertas.

## Prioridad / estimación
P0 / M

## Traceability
DEC-034, DEC-061..064, DEC-106; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
