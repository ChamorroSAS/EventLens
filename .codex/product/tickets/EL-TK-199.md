# EL-TK-199 — Verificar residual y restauraciones hasta deadline UTC más 30 días

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** operador de recuperación, **quiero** demostrar que backups ordinarios no reactivan contenido purgado, **para** cerrar la obligación residual sin inventar acceso ni borrar autoridad.

## Alcance funcional
Política/medición +30 desde ancla original; inventario de copias/retención de storage; protección restore antiguo con tombstone/checkpoint y reportes de mainPurgedAt vs residual; alertas/gates de simulacro y control de deadlines.

## Fuera de alcance
No elegir proveedor, no certificar borrado instantáneo de copias, no habilitar hold jurídico.

## Criterios de aceptación
### Escenario 1
Dado backup antiguo restaurado en entorno aislado, cuando intenta acceder a recurso purgado, entonces authority/tombstone lo mantiene restringido.

### Escenario 2
Dado purgeStartedAt, cuando se comprueba +30 calendario UTC, entonces existe evidencia de no recuperación activa y estado residual verificable.

### Escenario 3
Dada copia/provider sin evidencia o recovery gap, cuando se evalúa, entonces gate queda FAIL/PENDING, nunca PASS implícito.

## Reglas de negocio
Backups ordinarios +30 desde ancla, independientemente de retrasos worker; PITR y RPO/RTO existentes no bastan por sí solos.

## Validaciones y permisos
Solo operación de recuperación autorizada y evidencia sanitizada; no media expuesta.

## Casos de error y estados vacíos
Legacy snapshot, staging version desconocida, provider no verificado, límite residual excedido.

## Datos / contratos afectados
RecoveryAuthority/EL-TK-172/174, backup/PITR, storage retention evidence, DeletionEvidence.

## Dependencias técnicas y funcionales
EL-TK-197, EL-TK-198, EL-TK-172, EL-TK-174; almacenamiento y adapter de backup verificables.

## Dependencias de tickets
- **depends_on:** EL-TK-197, EL-TK-198, EL-TK-172, EL-TK-174; almacenamiento y adapter de backup verificables.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Ejercicio PITR anterior a solicitud/cancel/claim, +7/+30 UTC, cierre false positive y corrupción/checkpoint.

## Observabilidad / auditoría
Dashboard/métricas de incumplimiento, pruebas de recuperación, sin restos ni información personal adicional.

## Prioridad / estimación
P0 / L

## Traceability
DEC-045/062/092/097..110; ARCH-010/019; EL-EP-014/015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación propuesto
REQUIREMENTS_READY: YES (contratos aceptados, pendiente revisión formal del ticket).
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
REVIEW_STATUS: PENDING — propuesta documental sin prueba ejecutada ni dictamen automatizado de requirements_reviewer.
