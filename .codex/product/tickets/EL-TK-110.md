# EL-TK-110 — Cambiar el modo de moderación sin reescribir contenido existente

## Parent epic
EL-EP-008

## Status
DONE

## User story
**Como** organizador propietario, **quiero** cambiar el modo de moderación del evento, **para** aplicar la nueva regla a resultados futuros sin alterar retroactivamente el contenido existente.

## Alcance funcional
Permitir cambiar el modo de moderación después del borrador y aplicar DEC-087: pendientes existentes siguen pendientes; trabajos que terminan usan el modo vigente; PUBLISHED existentes no cambian automáticamente.

## Fuera de alcance
Reprocesar contenido, publicar pendientes en lote, modificar media publicada automáticamente o saltar seguridad.

## Criterios de aceptación
### Escenario 1
**Dado** existen pendientes y el owner cambia el modo, **cuando** se guarda la configuración, **entonces** los pendientes existentes siguen PENDING_REVIEW.

### Escenario 2
**Dado** un procesamiento termina después del cambio, **cuando** se determina publicación, **entonces** usa el modo vigente al finalizar.

### Escenario 3
**Dado** ya existe media PUBLISHED, **cuando** cambia el modo, **entonces** permanece PUBLISHED salvo una acción explícita posterior.

## Reglas de negocio
DEC-087 gobierna la transición. Seguridad/retiro prevalecen sobre auto-publicación.

## Validaciones y permisos
Solo propietario del evento dentro de las capacidades de configuración permitidas.

## Casos de error y estados vacíos
Actor ajeno, configuración inválida, conflicto de versión y evento no editable según policy.

## Datos / contratos afectados
ModerationSettings, mode, version/effectiveAt, MediaGovernance contract.

## Dependencias técnicas y funcionales
Configuración EL-EP-002 y procesamiento EL-EP-006.

## Dependencias de tickets
- **depends_on:** EL-TK-028, EL-TK-037
- **blocks:** EL-TK-111, EL-TK-112

## Pruebas requeridas
Cambio con pendientes, trabajo finalizando, contenido publicado, conflicto y actor ajeno.

## Observabilidad / auditoría
Auditar old/new mode y actor; no reescribir historia de media.

## Prioridad / estimación
P0 / M

## Traceability
Q-006; DEC-005, DEC-087; EL-EP-008, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-086/087/096 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §8.5..9; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Actualizado `EventDraftService.setModerationMode` en `@eventlens/event-management` para permitir la modificación del modo (`AUTO_PUBLISH` vs `MANUAL_REVIEW`) en eventos con estados `['DRAFT', 'SCHEDULED', 'ACTIVE']` respetando la política de gobernanza `canEditSettings`.
  - Implementado `PostgresMediaGovernance` en `@eventlens/media-inspection` desacoplado del catálogo de medios: lee atómicamente el modo del evento para guiar la decisión de publicación (`AUTO` vs `PRE_REVIEW`) en la finalización de procesamiento.
  - Regla canónica DEC-087 preservada: cambiar el modo no muta retroactivamente el catálogo existente. Los items en `PENDING_REVIEW` continúan pendientes de aprobación manual; los items en `PUBLISHED` permanecen publicados.
- **Criterios de aceptación verificados:**
  - Escenario 1: Al cambiar de modo con elementos pendientes, los pendientes existentes se mantienen inalterados en `PENDING_REVIEW`.
  - Escenario 2: Procesamientos que finalizan posterior al cambio consultan y aplican el modo vigente en el evento.
  - Escenario 3: Contenido previamente publicado permanece en `PUBLISHED` sin mutaciones colaterales.
- **Pruebas:** 30/30 tests unitarios PASS en `event-draft-config.unit.test.ts` (suite unitaria total 276 tests pass en `event-management`), y validación de integración E2E en `media-moderation-e2e.integration.test.ts`. Builds limpios.

