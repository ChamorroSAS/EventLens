# EL-TK-123 — Validar privacidad y resolución de reportes/retiros de extremo a extremo

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** equipo de producto, **quiero** validar los flujos de reporte y retiro, **para** comprobar que protegen al solicitante y no conceden permisos indebidos.

## Alcance funcional
Cubrir reporte visible, retiro propio, intake sin sesión, clasificación, acceso justificado, ocultamiento, resolución, UI pública/admin y contratos de purga/auditoría.

## Fuera de alcance
Certificar texto jurídico final para apertura pública o simular retención legal no aprobada.

## Criterios de aceptación
### Escenario 1
**Dado** un guest retira aporte propio, **cuando** se ejecuta E2E, **entonces** sale de visibilidad e inicia purga irreversible sin papelera.

### Escenario 2
**Dado** una persona sin sesión solicita retiro, **cuando** se procesa, **entonces** queda para revisión sin recuperar sesión ni borrar automáticamente.

### Escenario 3
**Dado** un reporte grave llega, **cuando** se clasifica, **entonces** genera prioridad pero no auto-hide hasta decisión.

## Reglas de negocio
Privacidad, minimización y no revelación de existencia privada son parte del gate.

## Validaciones y permisos
Datos sintéticos y roles controlados.

## Casos de error y estados vacíos
Rate limit, races, actor ajeno, permiso admin vencido, purge downstream fallido y timeout.

## Datos / contratos afectados
EL-TK-113..122 y contratos EL-EP-013/014/015.

## Dependencias técnicas y funcionales
Entorno integrado web/API/DB/storage/auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-113, EL-TK-114, EL-TK-115, EL-TK-116, EL-TK-117, EL-TK-118, EL-TK-119, EL-TK-120, EL-TK-121, EL-TK-122
- **blocks:** validación integrada de EL-EP-009 antes de apertura pública/consumidores de eliminación

## Pruebas requeridas
E2E móvil/admin, privacidad, neutralidad, idempotencia, accesibilidad y auditoría.

## Observabilidad / auditoría
Evidencias sanitizadas; no originales reales ni PII innecesaria.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013, Q-019; DEC-016, DEC-023, DEC-029, DEC-031, DEC-088, DEC-089, DEC-097, DEC-103..105; EL-EP-009.

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
  - Suite de integración y validación E2E completa en `packages/media-inspection/test/media-report-governance-e2e.integration.test.ts` contra base de datos PostgreSQL 16 real.
  - Validación de los flujos canónicos de privacidad y moderación:
    1. Retiro de aporte propio por invitado con sesión (`DEC-089` / `DEC-097`): transición inmediata a `DELETED` en catálogo, registro de auditoría `CONFIRMED` en `media_own_removal_record`, despacho a purga irreversible downstream con política `PRIVACY_OWN_REMOVAL`, sin papelera para organizador y con reintento idempotente `ALREADY_REMOVED`. Rechazo con `NOT_OWNER` ante sesión no titular.
    2. Solicitud de retiro sin sesión (`DEC-103..105`): registro formal con campos apilados (`media_removal_request`), obligatoriedad de descripción en motivo `OTHER`, declaración de buena fe obligatoria NUNCA preseleccionada, validación sintáctica de correo sin conceder sesión ni borrar automáticamente (media permanece `PUBLISHED`).
    3. Flujo completo de moderación y auditoría inmutable (`DEC-088`): registro de reporte grave, consulta de cola sanitizada sin previews multimedia, clasificación a `CRITICAL` con alerta prioritaria pero **sin auto-ocultamiento** (`media_catalog` sigue `PUBLISHED`), inspección con grant temporal de 15 minutos previa justificación obligatoria, comando explícito de ocultamiento preventivo a `HIDDEN`, resolución definitiva a `ACTION_TAKEN` con purga irreversible downstream, consulta de detalle con historial inmutable de auditoría (4 eventos) y resolución idempotente ante duplicados.
- **Criterios de aceptación verificados:**
  - Escenario 1: Guest uploader retira aporte propio, sale de visibilidad e inicia purga irreversible sin papelera.
  - Escenario 2: Persona sin sesión solicita retiro, queda registrada para revisión administrativa sin recuperar sesión ni borrar de forma automática.
  - Escenario 3: Reporte grave genera alerta y prioridad en la cola pero no auto-oculta el contenido hasta que un administrador toma una decisión justificada explícita.
- **Pruebas:** 5 pruebas de integración pasando en `media-report-governance-e2e.integration.test.ts` contra PostgreSQL 16. Suite completa de backend (248 pruebas unitarias y 22 pruebas de integración) pasando al 100%. Suite web (101 pruebas) pasando al 100%. Zero errores de compilación y typecheck.
