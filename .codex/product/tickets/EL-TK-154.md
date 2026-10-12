# EL-TK-154 — Integrar búsqueda, detalle e intervenciones en la consola administrativa

## Parent epic
EL-EP-012

## Status
DONE

## User story
**Como** administración autorizada, **quiero** operar soporte desde una consola mínima unificada, **para** localizar, diagnosticar e intervenir sin privilegios ilimitados.

## Alcance funcional
Integrar AdminAppShell, AdminEventSearch/Result/Detail, AdminOrganizerSummary, acciones contextuales, secciones reutilizadas y acceso multimedia justificado.

## Fuera de alcance
Impersonación, roles múltiples, dashboard nuevo o políticas duplicadas.

## Criterios de aceptación
### Escenario 1
**Dado** admin busca y abre evento, **cuando** navega, **entonces** ve detalle sin media y acciones vigentes.

### Escenario 2
**Dado** necesita media, **cuando** solicita acceso, **entonces** se exige motivo antes de preview.

### Escenario 3
**Dado** acción no está disponible, **cuando** se renderiza, **entonces** se explica READ_ONLY/disabled sin habilitar bypass.

## Reglas de negocio
No preview previo; acciones por capacidades server-side.

## Validaciones y permisos
Sesión admin/capabilities vigentes.

## Casos de error y estados vacíos
Búsqueda vacía, detalle parcial, permiso/reauth, conflicto y downstream error.

## Datos / contratos afectados
Clientes EL-TK-146..153 y componentes UI existentes.

## Dependencias técnicas y funcionales
Handoff EL-EP-012 y contratos propietarios.

## Dependencias de tickets
- **depends_on:** EL-TK-146, EL-TK-147, EL-TK-150, EL-TK-151, EL-TK-152, EL-TK-153
- **blocks:** EL-TK-155

## Pruebas requeridas
E2E navegación, permisos, foco, responsive, partial states y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin telemetría de multimedia; acciones auditadas en backend.

## Prioridad / estimación
P0 / M

## Traceability
Q-017; DEC-019, DEC-020, DEC-027, DEC-038; EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-019/020/027/038/061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-012; sin componentes nuevos ni bypass de justificación).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
