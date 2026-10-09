# EL-EP-004 — Entrar por QR y participar con consentimiento sin cuenta

## Status

READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: PARTIAL
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - gate final intake aprobado.

Gate histórico de acceso: [dictamen](../sessions/2026-10-08-acceso-invitado.md). Intake sin sesión completado después en DEC-103..105 y [gate final](../sessions/2026-10-08-removal-intake.md), sin reabrir reglas aceptadas.

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-005, Q-006, Q-014, Q-025; DEC-004, DEC-013, DEC-041, DEC-042. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-003

## Objective / outcome

El invitado accede al evento autorizado y aporta con consentimiento trazable sin registrarse.

## Problem solved

Exigir cuenta reduce participación; acceso filtrado o sesión anónima demasiado amplia vulnera privacidad.

## Actors

Invitado; organizador; administración.

## Scope

Enlace difícil de adivinar, QR descargable, PIN opcional/cambio, regeneración e invalidación del anterior; condiciones versionadas en primera carga; sesión anónima; Mis aportes y solicitud propia de retiro.

## Out of scope

Identidad autenticada de invitado; recuperación automática de token; listas nominales; descargas de invitados.

## Business rules

**CONFIRMED - DEC-103..105:** campos y precisiones del retiro sin sesion aprobados; correo solo contacto, sin recuperacion/titularidad de sesion ni seguimiento publico. [Handoff](../../context/ui-mvp-epic-review.md#el-ep-009).

CONFIRMED: original uploader mantiene propiedad; licencia limitada al servicio, sin publicidad/venta/training adicional. Token aleatorio sin PII, limita a archivos de su sesión y no se recupera automáticamente. Sesión revocable mientras contenido exista y evento no esté DELETED.

**CONFIRMED — 2026-10-08:** [DEC-083/084](../DECISIONS.md) resuelven la revocación de sesiones al cambiar acceso y la disponibilidad de Mis aportes/solicitudes propias independientemente de galería y en CLOSED/GRACE_PERIOD. No concede recuperación automática de token ni acceso a contenido ajeno. Acceso al mecanismo de solicitud no decide eliminación automática o revisada: PL-009 pertenece a EL-EP-009; continuidad de cargas permanece en PL-005.

## Main scenarios

Escanear/introducir PIN; aceptar condiciones y aportar; consultar aportes propios; perder sesión y usar solicitud de retiro; regenerar QR filtrado.

## Edge cases

PIN incorrecto; enlace revocado; cookie eliminada; sesión válida tras cambio de PIN; galería apagada; evento en gracia o cerrado; documentos legales cambian.

## Data

Credencial pública, PIN protegido, sesión anónima, versiones/fecha/evento de aceptación; evidencia mínima.

## Permissions

Organizador configura acceso; invitado no administra media ajena; admin interviene justificadamente; revocación inmediata del enlace anterior.

## Integrations

Evento, privacidad/condiciones, carga y denuncias; QR generador PENDING técnico.

## Dependencies

EL-EP-003 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

No indexable; rate limiting; sesión segura; minimización; WCAG AA; navegadores móviles.

## Success criteria

Participar sin cuenta; enlace viejo deja de funcionar; aceptación trazable; token no revela aportes ajenos.

Escenarios verificables derivados de DEC-083/084:

- Dada una sesión invitada anterior, cuando se cambia el PIN o regenera QR/enlace, entonces esa sesión queda revocada y no obtiene nuevas autorizaciones; no se promete revocar universalmente URLs ya emitidas.
- Dada una sesión válida, cuando la galería está apagada o el evento está CLOSED/GRACE_PERIOD, entonces puede consultar Mis aportes y presentar solicitud de retiro propio, sin ver aportes ajenos ni habilitar galería/carga por esa consulta.
- Dada una sesión ausente o revocada, cuando la persona quiere solicitar retiro, entonces utiliza la ruta que identifica el contenido sin recuperar el token ni acceder a la lista privada de otra sesión.
- Dada una solicitud presentada, cuando se confirma su recepción, entonces no se interpreta como eliminación ejecutada; la resolución se rige por el contrato de EL-EP-009.

## Risks

Confundir identidad anónima con comprobación personal; enlaces firmados o sesiones continúan después de revocar.

## Open questions

Gate actual: PL-024..026 respondidas en DEC-103..105; requisitos y UX aprobados sin hallazgos en [sesion intake](../sessions/2026-10-08-removal-intake.md). Texto juridico final y apertura publica conservan Q-029.

PL-003/004 respondidas en DEC-083/084; PL-024..026 en DEC-103..105. Sin preguntas funcionales/UX actuales de este alcance; Q-029 conserva revisión jurídica antes de apertura pública. Cargas y retiro mantienen ownership; sin recuperación automática de token ni acceso ajeno.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Entrada/PIN, consentimiento, nombre/apodo, compartir y Mis aportes; retiro sin sesion reutiliza DEC-103..105.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-004). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: disponibilidad EL-EP-003, uploads EL-EP-005 y RemovalRequestFlow de EL-EP-009 aprobado en DEC-103..105.

UX_OPEN_QUESTIONS: ninguna funcional tras DEC-103..105 y gates aprobados.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

DoR de requisitos y UX aprobados. READY no certifica implementacion ni apertura publica; no se generan tickets en esta actualizacion.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-08: requirements_reviewer y ui_designer aprueban gate final DEC-103..105; epica READY, UX READY, frontend planning YES. Sin tickets/codigo; texto juridico final pendiente.

- 2026-10-08: PL-024 respondida en DEC-103; intake permanece PARTIAL solo por PL-025/026, sin cambios a reglas previas ni tickets/codigo.

- 2026-10-08: reevaluación UI descubre PL-024 compartida; épica completa NOT_READY/PRODUCT_READINESS PARTIAL, reglas previas y backend cerrado conservados.

- 2026-10-08: PL-003/004 respondidas mediante DEC-083/084; reglas/escenarios actualizados sin regenerar la épica. requirements_reviewer aprueba READY de requisitos sin hallazgos; PL-005 no aprobada. Arquitectura/UI pendientes, sin tickets ni implementación.

- 2026-10-07: creación por product_planner con trazabilidad Q-005, Q-006, Q-014, Q-025; DEC-004, DEC-013, DEC-041, DEC-042; estado inicial NOT_READY; sin tickets.

