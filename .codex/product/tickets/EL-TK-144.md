# EL-TK-144 — Integrar revisión y overrides de capacidad en la consola administrativa

## Parent epic
EL-EP-011

## Status
DONE

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

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-079/080/093..095/100..102 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Implementación y Validación — 2026-10-11
- Implementado diálogo modal `AdminCapacityOverrideDialogComponent` con comparación de métricas base, límites actuales y propuestos, motivo obligatorio de auditoría y acción de retorno al plan base.
- Implementado componente `AdminCapacityRequestsComponent` para revisar solicitudes de ampliación del evento con historial e interacciones de aprobación, solicitud de información (`REQUEST_INFO`) y rechazo (`REJECT`).
- Integrado en `AdminEventDetailComponent` dentro de la sección de capacidad y consumo.
- Ampliado `AdminApiService` con clientes para aplicar/retornar overrides y revisar solicitudes.
- Suite de pruebas unitarias en `admin-capacity-override.component.spec.ts` (5 tests en verde) cubriendo los 3 escenarios de aceptación.
- Suite completa de frontend `apps/web`: 52/52 pruebas PASS.
- `pnpm typecheck` validado con código de salida 0.
