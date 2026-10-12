# EL-EP-006 — Procesar multimedia preservando originales y aislando riesgos

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-008, Q-014, Q-023, Q-040 y Q-041; DEC-009, DEC-014, DEC-037, DEC-038, DEC-075 y DEC-076. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-003

## Objective / outcome

Los originales aceptados generan versiones web y fallos/amenazas quedan aislados sin pérdida.

## Problem solved

Formatos móviles diversos y procesamiento fallido pueden impedir ver recuerdos o exponer archivos inseguros.

## Actors

Sistema; organizador; administración/automatización de seguridad autorizada.

## Scope

Validación real, metadata, miniaturas, derivados web/transcodificación; estados UPLOADED/PROCESSING/PROCESSING_FAILED/QUARANTINED y salida PENDING_REVIEW/PUBLISHED; reintento automático limitado y manual.

## Out of scope

IA avanzada de moderación; liberación de cuarentena por organizador; reemplazo del original.

## Business rules

CONFIRMED: original y derivados distintos; fallo no elimina original. Un `PROCESSING_FAILED` solo queda elegible para descarga si la inspección de seguridad terminó aprobada; `QUARANTINED`, pendiente o inconclusa se deniega. El organizador solicita un nuevo ciclo solo para fallo técnico elegible, que conserva historial y dispone de hasta tres intentos automáticos; no libera ni reintenta cuarentena. Solo admin/proceso autorizado libera cuarentena a PROCESSING o elimina. La autorización y entrega de descarga pertenecen a EL-EP-010.

## Main scenarios

HEIC genera preview; MOV genera reproducción web; procesamiento falla y se reintenta; tipo sospechoso entra cuarentena; procesamiento exitoso respeta modo de publicación.

## Edge cases

Codec no reproducible directamente; original válido y transcodificación falla; reintento repetido; archivo malicioso; derivados parciales; trabajo duplicado.

## Data

Original/derivados, estado técnico, metadata, errores sanitizados, intentos, decisión de cuarentena.

## Permissions

Organizador no publica/libera cuarentena; admin con justificación revisa; sistema accede solo a objetos autorizados.

## Integrations

ObjectStorage externo compatible S3 y Workers async/JobQueue inicial PostgreSQL (DEC-063/064); proveedor y herramientas pendientes.

## Dependencies

EL-EP-005 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Fotos mediana ≤15 s/p95 ≤60 s, video mediana ≤2 min/p95 ≤5 min; procesamiento autónomo foto ≥98%, video ≥95%; TLS, aislamiento y conservación de originales. DEC-061/063 sustituyen media local permanente; redundancia/durabilidad del storage externo y rendimiento requieren validación.

## Success criteria

Original preservado ante fallo; versiones utilizables en navegadores admitidos; cuarentena no publicada ni descargada normalmente.

## Risks

Variedad de codecs, costes de transcodificación y cola acumulada.

CONFIRMED — CR-002/DEC-061..064: ObjectStorage externo para originales/derivados; Workers async/JobQueue PostgreSQL, hasta3 intentos automáticos/DEAD/esperas configurables y recuperación abandonados. Original preservado; DEAD de job no equivale a estado media. Herramientas/capacidad/leases pendientes; latencias conservadas.

PENDING implementación: herramientas/codecs/capacidad/esperas. DEC-064 fija hasta3 intentos automáticos; preservar formatos/tamaños/originales y contrato de carga EL-EP-005.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Estados de procesamiento/fallo/cuarentena y nuevo ciclo manual, no solo backend.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-006). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Biblioteca007; acciones de descarga010 y cuarentena012 por contrato.

UX_OPEN_QUESTIONS: ninguna funcional nueva; gates tecnicos aplicables en el handoff.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

Sin preguntas BLOCKER de producto en este límite; las decisiones técnicas pendientes no se presentan como decisiones confirmadas.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-12: correctivo EL-TK-187 READY tras [dictámenes propios](../sessions/2026-10-12-el-tk-185-187-readiness.md), REQUIREMENTS_READY y READY_FOR_IMPLEMENTATION YES por alcance backend. Disposición/guardia serializadas reutilizan DEC-109/110; no acredita purga ni cambia DONE históricos041/042.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: Q-040/041 y DEC-075/076 precisan elegibilidad segura de descarga y ciclo manual de reintento, sin trasladar la entrega a esta épica.

- 2026-10-07: CR-001/DEC-060 actualiza almacenamiento, procesamiento, NFR y riesgos; conserva READY y contratos funcionales.

- 2026-10-07: creación por product_planner con trazabilidad Q-008, Q-014, Q-023; DEC-009, DEC-014, DEC-037, DEC-038; estado inicial READY; sin tickets.
- 2026-10-07: requirements_reviewer aprobó EL-TK-032..042 sin hallazgos pendientes; once tickets READY. [Dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). Sin implementación ni avance a otra épica.
