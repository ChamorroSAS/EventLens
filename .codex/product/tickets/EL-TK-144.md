# EL-TK-144 — Integrar revisión y overrides de capacidad en la consola administrativa

## Parent epic
EL-EP-011

## Status
DRAFT

## User story
**Como** administración autorizada, **quiero** revisar solicitudes y ajustar límites desde el detalle del evento, **para** operar ampliaciones sin duplicar políticas ni formularios.

## Alcance funcional
Integrar AdminUsageOverrideForm, estado/historial de solicitudes, AdministrativeActionReason, comparación base/actual/propuesto y retorno al plan base.

## Fuera de alcance
Crear consola paralela, redefinir validaciones de dominio o asumir que aprobación siempre modifica capacidad.

## Criterios de aceptación
### Escenario 1
**Dado** admin revisa solicitud, **cuando** abre detalle, **entonces** ve plan base, efectivo, uso/reservas e historial.

### Escenario 2
**Dado** aplica override, **cuando** confirma, **entonces** muestra solo resultado persistido y auditoría.

### Escenario 3
**Dado** un cambio sería temporalmente inválido, **cuando** backend deniega, **entonces** la UI conserva valores reales y explica el motivo autorizado.

## Reglas de negocio
La UI no muestra un cambio como aplicado hasta confirmación del servidor.

## Validaciones y permisos
Admin autenticado/capability vigente.

## Casos de error y estados vacíos
Conflicto, permiso, solicitud resuelta, override rechazado y carga parcial.

## Datos / contratos afectados
Clientes EL-TK-141/142 y componentes de EL-EP-012.

## Dependencias técnicas y funcionales
Handoff EL-EP-011 y consola compartida EL-EP-012.

## Dependencias de tickets
- **depends_on:** EL-TK-141, EL-TK-142; contrato EL-EP-012
- **blocks:** EL-TK-145

## Pruebas requeridas
Estados de solicitud, override/retorno, foco, responsive, permisos y WCAG 2.2 AA.

## Observabilidad / auditoría
Acciones backend auditadas; UI no persiste razones fuera del contrato.

## Prioridad / estimación
P0 / M

## Traceability
DEC-095, DEC-100..102; EL-EP-011, EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
