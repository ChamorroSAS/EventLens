# EL-EP-005 — Cargar recuerdos con tolerancia a fallos móviles

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - dictamen UI/UX actual; no certifica implementacion.

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-008, Q-009, Q-011; DEC-009, DEC-010, DEC-011. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-003

## Objective / outcome

El invitado envía fotos/videos con progreso y recuperación por archivo sin perder el lote.

## Problem solved

Una conexión móvil inestable o un límite alcanzado puede frustrar o perder aportaciones.

## Actors

Invitado; sistema; organizador como responsable del espacio.

## Scope

Selección múltiple; progreso individual; validación tipo/tamaño/duración; reintentos automáticos temporales y manuales; recepción/preservación original; diseño compatible con multipart/reanudación.

## Out of scope

Prometer reanudación tras cierre de navegador para todos los archivos sin definición técnica; importación externa.

## Business rules

CONFIRMED: fotos JPG/JPEG, PNG, HEIC/HEIF, WebP ≤25 MB; videos MP4/MOV/WebM ≤500 MB y ≤5 min; configurables. Un fallo no cancela otros archivos. Al límite no se pierden cargas ya finalizadas; sin mensajes internos técnicos.

**CONFIRMED — DEC-085:** intentos aún no confirmados se cancelan al desactivar cargas, cerrar/suspender/vencer el evento o revocar acceso. Originales ya confirmados se conservan bajo retención vigente; una reserva no concede continuidad contra permisos actuales. [Decisión](../DECISIONS.md).

## Main scenarios

Cargar lote mixto; red cae y se reintenta; archivo excede límite sin cancelar restantes; cuota llena informa al invitado/organizador.

## Edge cases

Pérdida de conexión; duración detectada tras carga; archivos dañados; cargas simultáneas cerca de cuota; cierre/revocación durante transferencia; reintento duplicado.

## Data

Intento de carga, progreso, archivo original, tamaño/tipo/duración, sesión/evento y consumo/reserva conforme DEC-079/080/085.

## Permissions

Invitado autorizado en evento que permita cargas; no cruzar eventos; sistema valida antes de disponibilidad normal.

## Integrations

ObjectStorage externo privado; carga directa navegador, confirmación backend y procesamiento Workers/JobQueue (DEC-063/064).

## Dependencies

EL-EP-004, EL-EP-011 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Objetivo éxito ≥95% para archivos válidos; mobile first; aislamiento; rate limiting; original intacto.

## Success criteria

Progreso y error por archivo; reintento recupera fallo temporal; no pérdida de cargas confirmadas al alcanzar cuota.

- Dado un intento no confirmado, cuando ocurre una condición de DEC-085, entonces queda cancelado y no se confirma usando permisos o reserva anteriores; la limpieza física aplica el contrato seguro existente, sin prometer corte instantáneo de IO ya iniciado.
- Dado un original confirmado antes del cambio, entonces el cambio de permiso no lo elimina por sí solo; conserva las reglas vigentes de seguridad/retención.

## Risks

Sobreconsumo por concurrencia; duplicados; finalización tras revocación.

CONFIRMED — CR-002/DEC-061..064: Carga navegador→ObjectStorage externo privado mediante URLs temporales. Backend autoriza permisos/estado/cuota y confirma existencia/tamaño real/metadata/asociación evento/estado inicial antes de async. App nunca storage permanente. PL-005 respondida en DEC-085; PL-011/012 respondidas en [DEC-079/080](../DECISIONS.md). Implementación requiere resolver carreras de confirmación/cancelación conforme contratos vigentes.

## Open questions

PL-005 respondida en DEC-085; gate localizado de requisitos aprobado, sin bloqueantes propios. PENDING técnico: estrategia de reanudación/reintento y coordinación de cancelación con IO externo, sin inventar políticas o seleccionar tecnología DEFERRED.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Seleccion, progreso por archivo, confirmacion, resultado parcial y retry autorizado.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-005). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Sesion004 y capacidad011; proceso006 conserva estado diferenciado.

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

Requisitos aprobados por requirements_reviewer y frontera arquitect?nica compatible; [dictamen actual](../sessions/2026-10-08-cierre-reglas-mvp.md). Gate UI completo pendiente; no generar tickets frontend.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-10: ticket_writer crea EL-TK-086..095 como DRAFT para autorización/reserva, carga directa, confirmación y validación real, aceptación/handoff a procesamiento, retry, cancelación por policy, consulta de lote, UI guest y validación integrada. Pendientes de requirements_reviewer; sin implementación.

- 2026-10-08: gate localizado aprueba READY de requisitos; implementaci?n/UI conservan sus puertas pendientes.

- 2026-10-08: DEC-085 resuelve continuidad de intentos no confirmados; reglas/escenarios actualizados, gate pendiente, sin código ni tickets.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 actualiza integración y riesgos para EC2/persistencia local; conserva NOT_READY y bloqueante existente.

- 2026-10-07: creación por product_planner con trazabilidad Q-008, Q-009, Q-011; DEC-009, DEC-010, DEC-011; estado inicial NOT_READY; sin tickets.

