# EL-TK-143 — Integrar capacidad y solicitudes de ampliación en la experiencia del organizador

## Parent epic
EL-EP-011

## Status
DRAFT

## User story
**Como** organizador, **quiero** ver consumo y gestionar solicitudes desde mi evento, **para** comprender límites y pedir ampliaciones con una experiencia accesible.

## Alcance funcional
Integrar StorageUsage, FileUsageSummary, UsageLimitAlert, ExtensionRequestForm y ExtensionRequestStatus conforme al handoff de capacidad.

## Fuera de alcance
Calcular autorización localmente, crear NotificationCenter o aprobar solicitudes.

## Criterios de aceptación
### Escenario 1
**Dado** capacidad carga correctamente, **cuando** owner abre el evento, **entonces** ve límites/uso/reservas y avisos aplicables.

### Escenario 2
**Dado** existe solicitud abierta, **cuando** entra, **entonces** ve seguimiento/historial en lugar de un nuevo formulario.

### Escenario 3
**Dado** estado INFORMATION_REQUESTED, **cuando** responde, **entonces** preserva foco/entradas y refleja PENDING_REVIEW tras confirmación.

## Reglas de negocio
La UI consume estado/capacidades del servidor; no interpreta incrementos como totales efectivos.

## Validaciones y permisos
Owner autenticado.

## Casos de error y estados vacíos
Loading sin cero falso, error recuperable, permiso, solicitud concurrente y capacidad no disponible.

## Datos / contratos afectados
Clientes EL-TK-135,139,140 y componentes UI canónicos.

## Dependencias técnicas y funcionales
ui-capacity-lifecycle.md#el-ep-011.

## Dependencias de tickets
- **depends_on:** EL-TK-135, EL-TK-139, EL-TK-140
- **blocks:** EL-TK-145

## Pruebas requeridas
Component/unit/E2E móvil, a11y, formularios, historial, errores y estados de uso.

## Observabilidad / auditoría
Sin telemetría sensible; acciones delegan auditoría.

## Prioridad / estimación
P0 / M

## Traceability
DEC-079, DEC-093, DEC-094, DEC-100, DEC-101; EL-EP-011; ui-capacity-lifecycle.md.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
