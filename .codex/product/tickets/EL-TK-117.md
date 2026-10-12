# EL-TK-117 — Autorizar acceso administrativo justificado a la media de un caso

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** administración autorizada, **quiero** justificar y abrir la media estrictamente necesaria de un caso, **para** investigar sin acceso indiscriminado a recuerdos privados.

## Alcance funcional
Exigir motivo y autorización vigente antes de emitir preview/grant temporal administrativo de la media asociada al caso.

## Fuera de alcance
Impersonación, navegación libre por galería privada, descarga de original no autorizada o acceso sin justificación.

## Criterios de aceptación
### Escenario 1
**Dado** un caso requiere inspección, **cuando** admin registra motivo válido, **entonces** se emite acceso temporal al recurso estrictamente necesario.

### Escenario 2
**Dado** no hay motivo/permisos, **cuando** se solicita preview, **entonces** se deniega.

### Escenario 3
**Dado** el permiso o caso cambia antes del grant, **cuando** se revalida, **entonces** no se emite nueva autorización.

## Reglas de negocio
Acceso administrativo a media siempre justificado/auditado; storage permanece privado.

## Validaciones y permisos
Admin autorizado con capability específica y revalidación server-side.

## Casos de error y estados vacíos
Sin permiso, motivo ausente, media no disponible, caso cerrado/restringido y URL expirada.

## Datos / contratos afectados
AdministrativeMediaAccessGrant, reason, caseId, mediaId, expiresAt.

## Dependencias técnicas y funcionales
Auth admin EL-TK-044, MediaViewGrant/Storage y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-116, EL-TK-044, EL-TK-097; contrato EL-EP-014
- **blocks:** EL-TK-118, EL-TK-119, EL-TK-122, EL-TK-123

## Pruebas requeridas
Motivo obligatorio, grant temporal, actor ajeno, revalidación y auditoría.

## Observabilidad / auditoría
Auditar quién, por qué, qué recurso y resultado; nunca URL completa.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-019, DEC-088; EL-EP-009, EL-EP-012, EL-EP-014.

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
  - Implementado método `grantAdministrativeMediaAccess` en `MediaCaseGovernanceService` y `PostgresMediaCaseGovernanceRepository` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Creada tabla `media_case_access_grant` (migración `202610120051_media_case_governance`) para registrar grants temporales de 15 minutos con token criptográfico strictly scoped.
  - Exigencia estricta de motivo no vacío (`justification`) y rol de administrador (`ADMIN_HUMAN`).
- **Criterios de aceptación verificados:**
  - Escenario 1: Admin autorizado registra motivo obligatorio y recibe grant temporal de 15 minutos con token y previewUrl acotada al caso y recurso específico.
  - Escenario 2: Ante ausencia de justificación o actor no autorizado, la solicitud es rechazada con `MISSING_JUSTIFICATION` o `UNAUTHORIZED_ACTOR`.
  - Escenario 3: Si el caso ya está cerrado o la media fue eliminada del catálogo (`DELETED`), no se emite nueva autorización (`CASE_ALREADY_CLOSED` / `MEDIA_NOT_AVAILABLE`).
  - Observabilidad: Se audita quién (`admin_id`), por qué (`justification`), qué caso y qué `mediaRef`; **nunca se expone la URL completa sensible en los logs**.
- **Pruebas:** 4 pruebas unitarias en `media-report-and-removal.unit.test.ts` y prueba de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16 real. Build limpio.

