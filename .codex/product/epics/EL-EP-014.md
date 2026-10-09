# EL-EP-014 — Detectar incidentes y reconstruir acciones relevantes

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-014, Q-021; DEC-019, DEC-034, DEC-059. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-009

## Objective / outcome

Operación detecta fallos y reconstruye intervenciones sin registrar recuerdos ni datos innecesarios.

## Problem solved

Sin alertas y auditoría, pérdidas, abuso y fallos de eliminación pueden pasar inadvertidos.

## Actors

Equipo operativo; administración; sistema.

## Scope

Auditoría de autenticación, estado, accesos/PIN, privacidad/moderación, contenido, ampliaciones/suspensión/reportes; monitor app/frontend/backend/DB/storage/colas/proceso/cargas; alertas disponibilidad, error, cola, storage, purga y backup; backups DB diarios ≥7d y recuperación verificable.

## Out of scope

SLA empresarial; auditoría mediante conservación de multimedia; proveedor elegido.

## Business rules

CONFIRMED: logs técnicos 30d y auditoría12 meses configurables/revisables; acción/fecha/actor/tipo/recurso/resultado/metadatos mínimos. DEC-062/063: storage externo privado con redundancia/recuperación propia; PITR obligatorio producción, RPO≤1h/RTO≤4h, backups completos diarios7d/restauraciones periódicas.

## Main scenarios

Fallo procesamiento dispara alerta; consulta de intervención muestra actor/motivo; fallo purga detectable; verificar recuperación desde backup; rotar logs.

## Edge cases

Sistema ejecuta acción sin humano; logging falla; información sensible accidental; backup restaurado no debe reactivar datos eliminados.

## Data

Eventos de auditoría mínimos, métricas operativas, errores sanitizados, alertas y evidencia de recuperación.

## Permissions

Acceso operativo autorizado; auditoría no abre media; aislamiento en observación de recursos.

## Integrations

App inicial EC2, PostgreSQL separado/administrado, ObjectStorage externo y Workers/Scheduler/JobQueue PostgreSQL; Nginx/Docker Compose donde correspondan. Proveedores/herramientas pendientes; Redis no obligatorio (CR-002).

## Dependencies

Sin predecesora funcional dura; integra señales/servicios comunes cuando corresponda. Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Objetivo 99.5% disponibilidad mensual no SLA; TLS, protección/persistencia de archivos, minimización y trazabilidad. CR-002 no confirma cumplimiento observado; validar disponibilidad y recuperación de componentes separados.

## Success criteria

Alertas y auditoría verificables para incidentes mínimos; backups diarios/retención comprobables; multimedia no aparece en logs.

## Risks

Falsa confianza sin probar recuperación; datos sensibles en errores.

CONFIRMED — CR-002/DEC-061..064: PITR DB producción obligatorio/RPO≤1h/RTO≤4h/backup completo diario7d/restore periódico consistente. Media con redundancia/recuperación propias. Monitorear profundidad/edad cola/tiempos/retries/DEAD/abandonados y DB/storage/workers/scheduler. Redis solo métricas-justificado; herramientas/capacidad/pruebas pendientes.

CONFIRMED: RPO≤1h/RTO≤4h/PITR obligatorio producción. PENDING implementación: umbrales/herramientas/proveedores. Preservar disponibilidad/backups/auditoría; comprobar objetivos antes de beta.

## Open questions

Ninguna.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Consulta explicita de auditoria compartida con consola; no dashboard operativo nuevo.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-014). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Consola012 reutiliza auditoria; no obliga pantallas de observabilidad.

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

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 reconcilia redundancia previa y añade riesgos/validación de host único; conserva READY y objetivos de backup/disponibilidad.

- 2026-10-07: creación por product_planner con trazabilidad Q-014, Q-021; DEC-019, DEC-034, DEC-059; estado inicial READY; sin tickets.

