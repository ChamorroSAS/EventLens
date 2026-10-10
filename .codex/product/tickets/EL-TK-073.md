# EL-TK-073 — Integrar el lifecycle en la interfaz de organizador e invitado

## Parent epic
EL-EP-003

## Status
DRAFT

## User story
**Como** usuario autorizado, **quiero** ver el estado y las acciones vigentes del evento, **para** comprender apertura, cierre, vencimiento y restricciones sin inferirlas localmente.

## Alcance funcional
Integrar EventLifecyclePanel, EventStatusBadge, EventAccessStatus, acciones y diálogos existentes usando LifecycleSnapshot/capabilities del servidor.

## Fuera de alcance
Crear componentes paralelos, implementar acciones de EL-EP-010/011/015 o lógica temporal en frontend.

## Criterios de aceptación
### Escenario 1
**Dado** un organizador, **cuando** abre el detalle, **entonces** ve estado, inicio/TZ/vencimiento/gracia y únicamente acciones autorizadas.

### Escenario 2
**Dado** un invitado, **cuando** el evento todavía no inicia o ya no admite participación, **entonces** recibe feedback autorizado y accesible sin habilitar carga por error.

### Escenario 3
**Dado** una transición automática mientras la vista está abierta, **cuando** se refresca el snapshot, **entonces** la UI actualiza estado/acciones sin robar foco ni anunciar cada segundo.

## Reglas de negocio
Frontend no calcula permisos ni inventa estado EXPIRED. Contadores son informativos; fechas/TZ textuales son autoridad visible.

## Validaciones y permisos
Usar capacidades del servidor; acciones sensibles conservan el gate de su épica propietaria.

## Casos de error y estados vacíos
Loading, conflicto, permiso perdido, estado terminal y error de actualización mantienen copy comprensible y foco estable.

## Datos / contratos afectados
Cliente OpenAPI de LifecycleSnapshot/capabilities.

## Dependencias técnicas y funcionales
Handoff UI/UX aprobado de EL-EP-003; componentes existentes del catálogo.

## Dependencias de tickets
- **depends_on:** EL-TK-071, EL-TK-072.
- **blocks:** integración UX de consumidores posteriores de lifecycle.

## Pruebas requeridas
Component/unit de estados, E2E de acciones autorizadas, responsive, teclado, foco y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin auditoría adicional de render; acciones usan auditoría del comando propietario.

## Prioridad
P0

## Estimación
M

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
