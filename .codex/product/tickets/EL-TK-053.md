# EL-TK-053 — Consultar el estado y capacidades autorizadas de una media

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** actor autorizado, **quiero** consultar el estado y capacidades vigentes de una media, **para** conocer su procesamiento sin obtener acceso indebido.

## Alcance funcional

Backend/API GET /media/{id}/status por contrato vigente: estado, progreso sólo observable, inspección/elegibilidad y capacidades mínimas autorizadas. No emite firmas/descargas ni detalles operativos/admin; lectura no concede comandos.

## Criterios de aceptación

**Dado** owner vigente o invitado con sesión válida sobre sus aportes conforme policy, **cuando** consulta, **entonces** obtiene estado y capacidades actuales de su media según actor/evento/safety/barriers. Retry y elegibilidad de descarga son independientes: inspección inconclusa puede requerir reexaminar en nuevo ciclo permitido, pero no admite descarga. Cuarentena no expone retry/liberación owner.

**Dado** media ajena/inexistente, sesión perdida o scope no reconciliado, **cuando** consulta, **entonces** aplica denegación/error contractual sin filtrar bytes, metadata sensible, paths, errores admin ni claves/URLs. No inventa autorización por galería/estado local; restricciones Mis aportes siguen policy aprobada. Fallo temporal no simula éxito/vacío.

## Contratos y pruebas

MediaCatalog/MediaSafetyPolicy y ActorContext/event policy; REST/JSON/OpenAPI mínimo, cliente Angular generado, sin DTO Nest/Prisma. Vitest matriz owner/guest propio/ajeno/safety; PG/API estado/policy/revisión y no enumeración, sesión expirada/barrier/recovery epoch. Contratos independientes de implementar toda galería o descarga.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-054.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / S

## Traceability

GAP-EL-EP-006-01; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Consulta estado/capacidades mantiene contrato API cerrado independiente del codec/galería. Estados y fixtures respetan disposiciones adoptadas; no revela errores sensibles ni concede descarga por inspección exitosa.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Implementación y Verificación — 2026-10-11

- **Componentes:**
  - `packages/media-inspection/src/media-status.ts`: Servicio `GetMediaStatusAndCapabilities`, repositorio `PostgresMediaStatusRepository`, tipos de dominio `ActorContext`, `MediaStatusResult`, `MediaCapabilities`, `MediaObservableProgress`, y errores `MediaStatusError`.
  - Migración Prisma `202610110014_media_status_query`: Tabla de auditoría `media_status_query_audit` para registrar consultas sin secretos, claves, DSN ni paths de archivo.
  - Exportación en `packages/media-inspection/src/index.ts`.
- **Invariantes contractuales verificados (DEC-075 / DEC-076):**
  - `canRetry`: solo `true` para `ORGANIZER` cuando `status === 'PROCESSING_FAILED'`, no en cuarentena y `safety.outcome !== 'DENIED'`. Invitados nunca pueden reintentar procesamiento.
  - `canDownloadOriginal`: solo `true` si `safety.outcome === 'APPROVED'` y la media no está en `QUARANTINED`/`DELETED`. Estado `INCONCLUSIVE` permite retry pero deniega descarga (DEC-075).
  - No enumeración: consultas sobre medias inexistentes, de otro evento, o entre distintos invitados en "Mis aportes" devuelven `MEDIA_NOT_FOUND` uniforme sin fugar metadatos.
  - Aislamiento y sanitización: no se emiten paths S3, credenciales, firmas, ni URLs pre-firmadas.
- **Evidencia en Docker con PostgreSQL 16 (`infra/validation/media-inspection/Run.ps1`):**
  - Pruebas unitarias: `test/media-status.test.ts` (8/8 passed).
  - Pruebas integradas con PG 16 real: `test/media-status.integration.test.ts` (7/7 passed).
  - Suite de regresión completa de `media-inspection`: 18/18 archivos passed, 331/331 tests passed.
  - Veredicto de testing: **PASS** (`infra/validation/media-inspection/evidence/result.json`).

