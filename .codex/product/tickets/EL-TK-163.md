# EL-TK-163 — Generar avisos de denuncias e intervenciones según severidad autorizada

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** sistema, **quiero** comunicar hechos de casos cuando corresponda, **para** informar a actores autorizados sin filtrar reportantes ni contenido sensible.

## Alcance funcional
Consumir hechos de casos de EL-EP-009 para alertas administrativas prioritarias y comunicaciones al organizador cuando proceda, respetando supresión legal/seguridad.

## Fuera de alcance
Clasificar severidad, resolver denuncias o incluir multimedia/reportante en avisos.

## Criterios de aceptación
### Escenario 1
**Dado** caso grave emite alerta prioritaria, **cuando** se procesa, **entonces** admin receptor autorizado recibe aviso sin auto-ocultar por el aviso.

### Escenario 2
**Dado** resolución permite comunicación al owner, **cuando** se procesa, **entonces** se genera copy mínimo autorizado.

### Escenario 3
**Dado** existe razón legal/seguridad para no avisar, **cuando** se evalúa, **entonces** se registra supresión sin filtrar la razón al destinatario.

## Reglas de negocio
Severidad proviene de EL-EP-009; comunicación no cambia estado de media.

## Validaciones y permisos
Admin/owner según hecho y contrato.

## Casos de error y estados vacíos
Caso ya cerrado/obsoleto, destinatario no válido, supresión y retry.

## Datos / contratos afectados
CaseNotificationFact, severity, recipient role, suppressionRef.

## Dependencias técnicas y funcionales
Hechos de reportes y resoluciones de EL-EP-009 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-156; hechos de dominio EL-EP-009; contrato auditoría EL-EP-014
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Grave/normal, no leak reportante, suppression, dedupe y replay.

## Observabilidad / auditoría
Auditar comunicación/supresión con mínimos.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-023, DEC-088; EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-021 y DEC-061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-013; sin componentes nuevos ni NotificationCenter obligatorio).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12
- **STATUS:** DONE
- **Implementación técnica:**
  - Servicio `CaseNoticeService` en `@eventlens/notifications` (`case-notice-service.ts`), consumiendo hechos de moderación de `@eventlens/media-inspection` (EL-EP-009) y auditoría de `@eventlens/observability` (EL-EP-014).
  - Escenario 1: Alerta prioritaria `CASE_CRITICAL_ALERT` para administradores autorizados ante casos críticos sin alterar el estado del medio multimedia.
  - Escenario 2: Notificaciones al organizador (`CASE_RESOLUTION_NOTICE`, `ADMIN_INTERVENTION`) con copy mínimo autorizado sin filtrar reportantes ni previews multimedia.
  - Escenario 3: Supresión ante órdenes legales o directivas de seguridad (`suppressNotice`), auditada con mínimos sin fugar referencias ni razones confidenciales al destinatario.
  - Idempotencia y deduplicación: Previene duplicación de comunicaciones ante replays o reintentos de hechos de casos.
  - Integración: Proyecciones contextuales en `NoticeProjectionService` y plantillas de correo en `EmailRenderer`.
- **Validación y pruebas:**
  - Suite unitaria: `test/case-notice.unit.test.ts` (7 pruebas PASS).
  - Suite de integración: `test/case-notice.integration.test.ts` (2 pruebas PASS contra PostgreSQL 16 real).
  - Typecheck y build limpios en todo el monorepo.

