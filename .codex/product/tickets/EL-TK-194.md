# EL-TK-194 — Coordinar ingresos por causa: gracia, retiro propio, papelera y cuarentena

## Parent epic
EL-EP-015

## Status
READY

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
EL-TK-188, EL-TK-067, EL-TK-109, EL-TK-114, EL-TK-187; EL-TK-119 antes de integrar la disposición de casos. Para acreditar papelera y la carrera restauración-vencimiento se requiere el correctivo vigente de EL-TK-108: reloj servidor bajo la misma serialización y restauración sólo con now < restoreDeadline. Su DONE histórico no acredita ese correctivo posterior. No se reimplementan productores ni se declara cobertura de una causa cuyo productor aún no está integrado.

## Dependencias de tickets
- **depends_on:** EL-TK-188, EL-TK-067, EL-TK-109, EL-TK-114, EL-TK-187.
- **integration_requires:** EL-TK-119 para disposición de casos; correctivo vigente EL-TK-108 para la frontera de restauración de papelera, según la sección anterior.
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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12. No acredita implementación, ejecución de pruebas ni PASS de validation gates.
