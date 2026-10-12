# EL-TK-200 — Integrar solicitud y cancelación de eliminación en UI de evento

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** organizador, **quiero** gestionar el borrado de evento desde su detalle, **para** ver consecuencias y fecha límite antes de confirmar.

## Alcance funcional
Reutilizar EventDeleteRequestDialog, EventDeletionCountdown, EventLifecyclePanel, RetentionNotice; cliente Angular generado de OpenAPI; fechas exactas zona evento, mensajes pending/UNKNOWN, estados permitidos servidor, accesibilidad.

## Fuera de alcance
No crear páginas de jobs ni permitir cancelar gracia/retirada irreversible.

## Criterios de aceptación
### Escenario 1
Dado evento propio, cuando abre diálogo, entonces muestra recurso, bloqueo, 72h y salida antes de solicitar.

### Escenario 2
Dada solicitud cancelable, cuando consulta detalle, entonces fecha exacta y countdown textual muestran solo acción servidor disponible.

### Escenario 3
Dada petición timeout/409/503, cuando reconsulta, entonces no indica cancelación o purga como efectuada sin ACK.

## Reglas de negocio
Cuenta/evento manual distintos; countdown no mueve deadlines UTC; no progreso de backup ficticio.

## Validaciones y permisos
Permisos API servidor, cierre de foco y sin auth derivada de UI.

## Casos de error y estados vacíos
Doble clic, sesión perdida, rate limit, error de red, límite de plazo y permisos read-only.

## Datos / contratos afectados
Angular/OpenAPI, EventDeleteRequestDialog, Countdown, LifecyclePanel.

## Dependencias técnicas y funcionales
EL-TK-189, EL-TK-190, EL-TK-193; handoff UI aprobado.

## Dependencias de tickets
- **depends_on:** EL-TK-189, EL-TK-190, EL-TK-193; handoff UI aprobado.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Componentes y Playwright mobile/desktop, teclado/lector, conflicto/caducidad/UNKNOWN, mocks respuesta API.

## Observabilidad / auditoría
No guardar credenciales ni firmados; telemetría de interacción agregada.

## Prioridad / estimación
P0 / M

## Traceability
DEC-043/091/092; ui-deletion-flow.md; EL-EP-015

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
