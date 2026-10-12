# EL-TK-194 — Coordinar ingresos por causa: gracia, retiro propio, papelera y cuarentena

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** sistema, **quiero** recibir intenciones verificadas de causas no manuales, **para** aplicar una política única sin añadir ventanas indebidas.

## Alcance funcional
Consumir eventos de lifecycle 067, retiro propio 114/119, vencimiento de papelera 109 y disposición 187; validar policyRef, ancla/deadlines, sourceOperationId, generation/revision, ownership e inventario; deduplicar por causa.

## Fuera de alcance
No repetir el scheduler de papelera, el intake de reportes, la autorización de seguridad ni la eliminación física.

## Criterios de aceptación
### Escenario 1
Dado fin de gracia confirmado, cuando llega intent, entonces purgeStartedAt=graceEndsAt sin ventana adicional cancelable.

### Escenario 2
Dado retiro propio confirmado, cuando se ingresa, entonces es irreversible con ancla de confirmación, sin restauración ni veto del owner.

### Escenario 3
Dada expiración de papelera o disposición de cuarentena autorizada, cuando llega intent, entonces conserva restoreDeadline o dispositionConfirmedAt respectivamente y sus fechas +7/+30.

## Reglas de negocio
No aceptar evento sin ancla acreditada ni tratar intake de denuncia como retiro ya autorizado; causa nueva no amplía otra obligación.

## Validaciones y permisos
Solo productores propietarios con receipt/revisión/epoch válidos; acción pública no es intake directo.

## Casos de error y estados vacíos
Duplicado incompatible, receipt UNKNOWN, productor atrasado, registro legacy y carrera restauración.

## Datos / contratos afectados
DeletionIntent intake, política DEC-109/110, lifecycle port, QuarantinePurgeIntent, TrashPurgeRequest.

## Dependencias técnicas y funcionales
EL-TK-188, EL-TK-109, EL-TK-114, EL-TK-187; EL-TK-119 para disposición de casos cuando esté disponible.

## Dependencias de tickets
- **depends_on:** EL-TK-188, EL-TK-109, EL-TK-114, EL-TK-187; EL-TK-119 para disposición de casos cuando esté disponible.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Pruebas por cada causa, deadline exacto, duplicate delivery, restore-vs-claim, errores y datos históricos.

## Observabilidad / auditoría
Auditoría sanitizada de causa/origen/ancla sin payload multimedia.

## Prioridad / estimación
P0 / L

## Traceability
DEC-089/091/092/097..110; ARCH-019; EL-EP-003/006/008/009/015

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
