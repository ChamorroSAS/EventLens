# EL-TK-172 — Verificar restauración PostgreSQL y objetivos RPO RTO

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `PostgresRecoveryService` y `RealPostgresRestoreTarget` en `@eventlens/observability` conforme a los criterios de aceptación y DEC-045, DEC-062, DEC-092:
- Definición y ejecución de simulacros de restauración periódicos y PITR en entorno aislado (`executeRecoveryExercise`), restaurando snapshots validados por SHA-256 y registrando evidencia estructurada (Escenario 1).
- Medición objetiva de RPO observado (objetivo RPO ≤ 1h / 60m) y RTO observado (objetivo RTO ≤ 4h / 240m) conforme a DEC-062.
- Evaluación determinista del gate de recuperación (`overallGateStatus`): si RPO o RTO exceden los objetivos, el resultado queda explícitamente en `FAIL` y `FAIL_OBJECTIVE_MISSED` sin ocultamiento (Escenario 2).
- Reaplicación estricta de restricciones de eliminación y tombstones (`applyTombstoneRestrictions`), asegurando que contenidos purgados tras `purge_started_at` nunca resuciten en estado activo, y aislando retenciones especiales bajo `hasLegalHold` (DEC-045, DEC-092, Escenario 3).
- Verificación de no-corrupción y validación de sumas de comprobación SHA-256 previo a cualquier restauración.
- Control de acceso que restringe la ejecución de simulacros a actores autorizados (`SYSTEM`, `ADMIN`).
- Emisión de telemetría operativa (`infrastructure.recovery.rpo_observed_minutes`, `infrastructure.recovery.rto_observed_minutes`, `infrastructure.recovery.gate_status`, `infrastructure.recovery.resurrections_prevented`).
- Pruebas completas: 10 pruebas (7 unitarias y 3 de integración con PostgreSQL 16 real) con 100% PASS.

## User story
**Como** equipo operativo, **quiero** ejecutar restauraciones periódicas controladas, **para** demostrar que backup y PITR realmente recuperan el sistema dentro de objetivos.

## Alcance funcional
Definir y ejecutar ejercicio de restore/PITR en entorno controlado, medir RPO/RTO observado y verificar consistencia mínima de datos.

## Fuera de alcance
Restore de producción automático, declarar PASS sin evidencia o reactivar datos eliminados.

## Criterios de aceptación
### Escenario 1
**Dado** existe backup/PITR válido, **cuando** se ejecuta ejercicio, **entonces** se restaura a punto elegido y se registra evidencia.

### Escenario 2
**Dado** RPO/RTO observado excede objetivo, **cuando** se mide, **entonces** el gate queda FAIL/acción requerida, no se oculta.

### Escenario 3
**Dado** restore contiene tombstones/eliminaciones, **cuando** se levanta, **entonces** se reaplican protecciones para no resucitar contenido borrado.

## Reglas de negocio
Objetivos: RPO≤1h, RTO≤4h. Restore no puede convertir contenido eliminado en activo.

## Validaciones y permisos
Operación autorizada en entorno aislado.

## Casos de error y estados vacíos
WAL faltante, backup corrupto, restore parcial, tiempos excedidos y reconciliación fallida.

## Datos / contratos afectados
RecoveryExercise, observedRpo/Rto, verification results.

## Dependencias técnicas y funcionales
EL-TK-171; contratos de eliminación/tombstones EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-171; contrato EL-EP-015
- **blocks:** EL-TK-174, EL-TK-176

## Pruebas requeridas
PITR, corrupción, RPO/RTO, no-resurrección y aislamiento del ejercicio.

## Observabilidad / auditoría
Evidencia sanitizada de tiempos/resultados.

## Prioridad / estimación
P0 / M

## Traceability
DEC-045, DEC-062, DEC-092; EL-EP-014, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
