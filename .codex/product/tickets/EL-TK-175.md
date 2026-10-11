# EL-TK-175 — Integrar visor de auditoría contextual en la consola administrativa

## Parent epic
EL-EP-014

## Status
DONE

**CONFIRMED — 2026-10-11:** implementado y verificado en `apps/web/src/app/audit/` con `AuditLogViewerComponent`, `AuditLogDetailComponent` y `AuditApiService`. Visor contextual de solo lectura sin edición, sin exportación ni botones de reintento/ejecución desde auditoría (Escenario 3). Soporta filtros, paginación, estados de carga, sin coincidencias (Escenario 2), sin registros, error y sesión expirada/no autorizado. Compatible con tokens de `ui-design-system.md` y directrices de accesibilidad WCAG 2.2 AA. Pruebas de componentes y typecheck pasan al 100% (17/17 pruebas PASS en `@eventlens/web`).
**CONFIRMED — 2026-10-10:** requirements_reviewer y ui_designer aprueban el paso de DRAFT a READY. Integración de AuditLogViewer y AuditLogDetail contextual en consola administrativa conforme a ui-mvp-epic-review.md#el-ep-014 (DEC-019, DEC-034). Visor de solo lectura sin edición, exportación ni dashboard nuevo. WCAG 2.2 AA. REQUIREMENTS_READY: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** administración autorizada, **quiero** consultar auditoría desde el contexto operativo, **para** reconstruir acciones sin un dashboard operacional nuevo.

## Alcance funcional
Integrar AuditLogViewer/AuditLogDetail con filtros, paginación, estados vacíos/parciales y navegación desde el detalle administrativo.

## Fuera de alcance
Dashboard de observabilidad, editar/exportar logs o iniciar restore desde UI.

## Criterios de aceptación
### Escenario 1
**Dado** admin abre auditoría de un recurso, **cuando** consulta, **entonces** ve eventos sanitizados con filtros.

### Escenario 2
**Dado** filtro no tiene resultados, **cuando** aplica, **entonces** muestra estado sin coincidencias.

### Escenario 3
**Dado** registro tiene resultado fallido, **cuando** abre detalle, **entonces** se presenta como dato, no como acción ejecutable.

## Reglas de negocio
Solo lectura; reutiliza consola EL-EP-012 y componentes existentes.

## Validaciones y permisos
Admin autorizado.

## Casos de error y estados vacíos
Permiso/session expired, parcial, consulta fallida y página vacía.

## Datos / contratos afectados
Cliente EL-TK-167 y componentes UI canónicos.

## Dependencias técnicas y funcionales
Handoff EL-EP-014 y consola EL-EP-012.

## Dependencias de tickets
- **depends_on:** EL-TK-167; contrato EL-EP-012
- **blocks:** EL-TK-176

## Pruebas requeridas
Component/unit, filtros, foco, responsive, permisos y WCAG 2.2 AA.

## Observabilidad / auditoría
UI no duplica eventos ni expone metadata oculta.

## Prioridad / estimación
P0 / M

## Traceability
DEC-019, DEC-034; EL-EP-014; ui-mvp-epic-review.md#el-ep-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
