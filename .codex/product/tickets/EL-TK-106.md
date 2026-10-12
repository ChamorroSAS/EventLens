# EL-TK-106 — Volver a publicar una media oculta cuando sigue autorizada

## Parent epic
EL-EP-008

## Status
DONE

## User story
**Como** organizador propietario, **quiero** volver a publicar una media oculta, **para** restaurar su visibilidad sin saltar bloqueos vigentes.

## Alcance funcional
Transicionar HIDDEN a PUBLISHED únicamente cuando el contenido siga autorizado y no exista barrera de seguridad, retiro o lifecycle.

## Fuera de alcance
Restaurar desde papelera, liberar cuarentena o aprobar media PENDING_REVIEW.

## Criterios de aceptación
### Escenario 1
**Dado** una media propia HIDDEN sin bloqueos, **cuando** el organizador la publica de nuevo, **entonces** pasa a PUBLISHED.

### Escenario 2
**Dado** existe un bloqueo de seguridad/retiro, **cuando** se intenta publicar, **entonces** se deniega y permanece HIDDEN.

### Escenario 3
**Dado** la media cambió de estado concurrentemente, **cuando** se aplica el comando, **entonces** se devuelve conflicto sin publicar indebidamente.

## Reglas de negocio
Re-publicar exige revalidar barreras actuales; no usa el estado histórico para evadir restricciones.

## Validaciones y permisos
Solo propietario del evento; autorización server-side.

## Casos de error y estados vacíos
No encontrada, actor ajeno, estado incompatible, bloqueo vigente y conflicto.

## Datos / contratos afectados
Media visibility command, publicationState, current blockers/capabilities.

## Dependencias técnicas y funcionales
EL-TK-101 para revalidación y contratos de seguridad/retiro.

## Dependencias de tickets
- **depends_on:** EL-TK-105, EL-TK-101
- **blocks:** EL-TK-111, EL-TK-112

## Pruebas requeridas
Re-publicación válida, bloqueo vigente, actor ajeno y concurrencia.

## Observabilidad / auditoría
Auditar actor, media, estado y motivo de denegación sanitizado.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019; DEC-005, DEC-086, DEC-087; EL-EP-008.

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
- **Implementación:** Implementado `RepublishMediaService` en `@eventlens/media-inspection` (`packages/media-inspection/src/media-visibility.ts`) permitiendo al organizador propietario restaurar la publicación (`HIDDEN` $\to$ `PUBLISHED`).
  - Revalida en tiempo real que no existan bloqueos de seguridad (`safety_outcome !== 'DENIED'`), cuarentena ni intervenciones restrictivas conforme a DEC-005, DEC-086 y DEC-087.
  - Si la media no está en estado `HIDDEN` o sufre modificaciones concurrentes (`expectedRevision`), devuelve `CONFLICT` sin forzar publicación indebida.
  - Si la media tiene una inspección de seguridad con resultado `DENIED`, deniega con `SAFETY_BLOCKED` y la media permanece en `HIDDEN`.
  - Transición atómica CAS avanzando revisión (`revision + 1n`) y registrando auditoría en `MediaVisibilityAuditSink`.
- **Pruebas:** 11/11 pruebas unitarias PASS en vitest (`packages/media-inspection/test/media-visibility.test.ts`). Typecheck y monorepo limpios.
