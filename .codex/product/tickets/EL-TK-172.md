# EL-TK-172 — Verificar restauración PostgreSQL y objetivos RPO RTO

## Parent epic
EL-EP-014

## Status
READY

**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Verificación de restore periódico en entorno aislado, objetivos RPO ≤ 1h / RTO ≤ 4h y preservación de eliminaciones/tombstones sin resucitar contenido (DEC-045, DEC-062, DEC-092). REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (UI_REQUIRED: NO).

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
