# EL-TK-118 — Aplicar ocultamiento preventivo por decisión administrativa

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** administración autorizada, **quiero** ocultar preventivamente una media tras revisar un caso, **para** reducir exposición cuando el riesgo lo justifica sin confundirlo con eliminación definitiva.

## Alcance funcional
Permitir una decisión administrativa explícita y auditada que retire la media de nuevas visualizaciones, preservando el caso y sin disparar purga por sí sola.

## Fuera de alcance
Auto-ocultar al recibir denuncia, eliminar definitivamente o liberar contenido bloqueado por seguridad.

## Criterios de aceptación
### Escenario 1
**Dado** admin revisó el caso y decide ocultar, **cuando** confirma con motivo, **entonces** la media deja de estar disponible para nuevas consultas/grants.

### Escenario 2
**Dado** solo existe una denuncia grave sin decisión, **cuando** se procesa alerta, **entonces** la media no se oculta automáticamente.

### Escenario 3
**Dado** la media ya está retirada/purgada, **cuando** se intenta ocultar, **entonces** se responde de forma idempotente/consistente sin resucitarla.

## Reglas de negocio
Ocultamiento preventivo es decisión, no consecuencia automática de denuncia.

## Validaciones y permisos
Admin autorizado; motivo obligatorio; revalidación de estado.

## Casos de error y estados vacíos
Media ya no disponible, actor sin permiso, conflicto y caso inconsistente.

## Datos / contratos afectados
PreventiveHide command, caseId, mediaId, actor, reason, previous visibility/state.

## Dependencias técnicas y funcionales
Revalidación EL-TK-101 y biblioteca/moderación EL-EP-008.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-117, EL-TK-101
- **blocks:** EL-TK-119, EL-TK-122, EL-TK-123

## Pruebas requeridas
Decisión válida, no auto-hide, idempotencia, carrera y nueva consulta bloqueada.

## Observabilidad / auditoría
Auditar decisión, motivo y estado anterior/nuevo.

## Prioridad / estimación
P0 / M

## Traceability
DEC-023, DEC-088; EL-EP-009, EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Implementado método `applyPreventiveHide` en `MediaCaseGovernanceService` y `PostgresMediaCaseGovernanceRepository` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Transición atómica de `media_catalog.status` a `'HIDDEN'` con incremento optimista de `revision`.
  - Actualización del caso a `'UNDER_INVESTIGATION'` y registro inmutable en `media_case_history` con acción `'PREVENTIVE_HIDE'`.
- **Criterios de aceptación verificados:**
  - Escenario 1: Decisión administrativa explícita y motivada retira la media de nuevas consultas pasando su estado a `'HIDDEN'` en el catálogo y `'UNDER_INVESTIGATION'` en el caso, preservando el caso y **sin disparar purga**.
  - Escenario 2: La sola presencia de denuncia grave alerta pero **NUNCA auto-oculta** la media (conforme a `DEC-088`). El ocultamiento requiere esta decisión administrativa separada.
  - Escenario 3: Idempotencia consistente: si la media ya fue retirada/purgada (`DELETED` o `TRASHED`) o ya está en `HIDDEN`, responde con éxito idempotente sin resucitarla.
- **Pruebas:** 3 pruebas unitarias en `media-report-and-removal.unit.test.ts` y prueba de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16 real. Build limpio.

