# EL-TK-155 — Validar soporte e intervención administrativa de extremo a extremo

## Parent epic
EL-EP-012

## Status
DONE

## Implementation Evidence — 2026-10-12
- Implementada suite E2E en `packages/admin-support/test/admin-support-epic-e2e.test.ts`.
- Validados los 4 escenarios canónicos:
  1. Denegación estricta de acceso multimedia sin justificación válida / sin actor administrativo humano y emisión firmada con auditoría `ADMIN_MEDIA_ACCESS_GRANTED`.
  2. Ejecución de intervenciones delegando en el dominio dueño (`SUSPEND_EVENT`), replay idempotente (`IDEMPOTENT_REPLAY`) y acciones controladas sobre jobs (`RETRY`) con auditoría `ADMIN_JOB_ACTION_EXECUTED`.
  3. Tolerancia a fallos en detalle agregado (`overallAvailability: 'PARTIAL'`) ante fallos de secciones propietarias sin ofrecer acciones falsas, y deshabilitación estricta de capacidades en estado cerrado (`CLOSED`) y terminal (`DELETED`).
  4. Búsqueda administrativa con mínimo privilegio y auditoría `ADMIN_SEARCH_PERFORMED`.
- Verificaciones ejecutadas: 11/11 tests E2E pasando, 90 tests unitarios/servicios en verde en `packages/admin-support`, y `pnpm typecheck` = 0.

## User story
**Como** equipo de producto, **quiero** validar la consola administrativa y sus límites, **para** comprobar mínimo privilegio, trazabilidad y no bypass de dominios.

## Alcance funcional
Cubrir búsqueda/detalle, jobs, acceso justificado a media, acciones delegadas, secciones compartidas y UI administrativa.

## Fuera de alcance
Certificar políticas jurídicas, observabilidad externa o todos los dominios propietarios.

## Criterios de aceptación
### Escenario 1
**Dado** admin sin razón intenta abrir media, **cuando** E2E, **entonces** se deniega.

### Escenario 2
**Dado** admin ejecuta acción permitida, **cuando** E2E, **entonces** dominio dueño valida y auditoría registra.

### Escenario 3
**Dado** una sección propietaria no está lista, **cuando** abre detalle, **entonces** no se ofrece acción falsa.

## Reglas de negocio
Consola no amplía permisos ni redefine dominios.

## Validaciones y permisos
Datos sintéticos, admin autorizado/no autorizado.

## Casos de error y estados vacíos
Permiso, reauth, carrera, partial downstream y replay.

## Datos / contratos afectados
EL-TK-146..154 y contratos EL-EP-014.

## Dependencias técnicas y funcionales
API/DB/UI/JobQueue integrados.

## Dependencias de tickets
- **depends_on:** EL-TK-146, EL-TK-147, EL-TK-148, EL-TK-149, EL-TK-150, EL-TK-151, EL-TK-152, EL-TK-153, EL-TK-154
- **blocks:** validación integrada de EL-EP-012

## Pruebas requeridas
E2E, integración, autorización negativa, auditoría y accesibilidad.

## Observabilidad / auditoría
Evidencia sanitizada sin PII/media.

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
