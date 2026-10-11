# EL-TK-184 — Aplicar retención de auditoría y rotación de logs técnicos

## Parent epic
EL-EP-014

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el ticket como READY. Cubre la política y ejecución periódica de depuración de AuditEvent (12 meses) y rotación/retención de logs técnicos operativos (30 días) configurables conforme a DEC-059 y Q-014/Q-021. Sin mezclar con purga ni conservación de multimedia. UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** equipo operativo y de privacidad, **quiero** que los logs técnicos se roten y retengan a 30 días y los eventos de auditoría se depuren a 12 meses, **para** garantizar la minimización de datos y el uso eficiente de almacenamiento sin afectar registros activos ni multimedia.

## Alcance funcional
Implementar y calendarizar la ejecución periódica de:
1. Depuración de registros `AuditEvent` que superen el periodo configurable de retención (objetivo 12 meses), preservando la integridad de eventos activos y sin mutar datos de dominio.
2. Rotación periódica y retención de logs técnicos operativos de aplicación y servicios (objetivo 30 días configurables), eliminando archivos de log rotados obsoletos.
3. Emisión de señal operativa de ejecución y reporte de fallo de purga/rotación para ser consumido por el alertamiento de EL-TK-170.

## Fuera de alcance
Purga de archivos multimedia, portadas o tombstones de media (pertenece a EL-EP-015 / DEC-086 / DEC-096), retención contractual de SLA o interfaces de usuario.

## Criterios de aceptación
### Escenario 1
**Dado** existen eventos de auditoría que superan el periodo de 12 meses configurado, **cuando** el scheduler ejecuta la tarea de retención, **entonces** se eliminan permanentemente los eventos expirados y se registra métrica de depuración sin tocar registros activos ni multimedia.

### Escenario 2
**Dado** la acumulación de logs técnicos operativos, **cuando** se alcanza el ciclo de rotación, **entonces** los logs se rotan y aquellos que superan los 30 días configurados se purgan del almacenamiento de logs.

### Escenario 3
**Dado** la tarea de purga o rotación encuentra un fallo o bloqueo, **cuando** finaliza con error, **entonces** emite una señal de fallo de purga detectable por EL-TK-170 para alertamiento sin dejar el sistema en estado inconsistente.

## Reglas de negocio
Retención objetivo: logs técnicos 30 días y auditoría 12 meses configurables/revisables (DEC-059). No se utiliza multimedia como auditoría. La purga de auditoría nunca afecta al catálogo ni al almacenamiento de medios.

## Validaciones y permisos
Ejecución automatizada mediante scheduler / worker operativo con credenciales restringidas; parámetros de retención configurables por variables operativas protegidas.

## Casos de error y estados vacíos
Sin registros para depurar (no-op exitoso), fallo de escritura/disco, bloqueo transaccional, interrupción a mitad de lote (lotes acotados e idempotentes).

## Datos / contratos afectados
AuditRetentionPolicy, LogRotationConfig, purge execution metrics, purge failure signal.

## Dependencias técnicas y funcionales
EL-TK-166 (modelo y tabla AuditEvent), EL-TK-168 (telemetría y logging de aplicación), scheduler operativo.

## Dependencias de tickets
- **depends_on:** EL-TK-166, EL-TK-168
- **blocks:** EL-TK-170, EL-TK-176

## Pruebas requeridas
Depuración por antigüedad en PostgreSQL, rotación de archivos de log, conservación de eventos dentro de ventana, lotes idempotentes, simulación de fallo y emisión de señal de alerta.

## Observabilidad / auditoría
Métricas de registros purgados, espacio liberado y estado de ejecución sin registrar datos sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-014, Q-021; DEC-019, DEC-059; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
