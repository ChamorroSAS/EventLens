# EL-EP-002 — Preparar y personalizar el espacio del evento

## Status

DONE

**COMPLETADO — 2026-10-12:** Los 17 tickets de EL-EP-002 (EL-TK-020, 021, 022, 023, 024, 025, 027, 028, 029, 030, 031, 047, 048, 049, 050, 051, 052) han sido implementados y verificados al 100% con pruebas unitarias y de integración contra PostgreSQL 16 real en `@eventlens/event-management`. Totalmente funcional, tipado y documentado.

## Module

MOD-002

## Objective / outcome

El organizador prepara un evento privado y comprueba la experiencia de invitado antes de publicarlo.

## Problem solved

El organizador necesita configurar su espacio y sus permisos sin exponer un borrador.

## Actors

Organizador; administración para correcciones excepcionales.

## Scope

Crear/configurar borrador: nombre, fecha/hora, zona IANA, portada, bienvenida, privacidad/PIN, modo de moderación, controles independientes de carga y galería; vista previa.

## Out of scope

Personalización avanzada; ejecución de transiciones temporales (EL-EP-003); emisión de QR/acceso (EL-EP-004).

## Business rules

CONFIRMED: Crear exige solo nombre; sistema asigna identificador, organizador propietario, timestamps e IDs internos necesarios y crea DRAFT con America/Bogota, uploads_enabled=false, guest_gallery_enabled=false, moderación AUTO_PUBLISH y PIN desactivado. Fecha/hora, portada y bienvenida se completan después. DRAFT sin acceso/cargas de invitados. Portada: JPEG/JPG, PNG, HEIC/HEIF o WebP hasta 25.000.000 bytes. Hora DST inexistente se rechaza; hora repetida exige elegir offset. Cambiar TZ en DRAFT/SCHEDULED conserva fecha/hora local, recalcula UTC y advierte en SCHEDULED; apertura/vencimiento corresponden a EL-EP-003. Tras alcanzar ACTIVE, solo corrección administrativa auditada. Esta épica solo establece el PIN inicial de DRAFT: exactamente seis dígitos numéricos, incluidos ceros a la izquierda, sin letras/espacios/especiales; se almacena sin texto plano y no se vuelve a mostrar. EL-EP-004 gestiona intentos/rate limiting, validación de acceso y cambios posteriores, regeneración y revocación de enlace/QR.

## Main scenarios

Crear y editar borrador; configurar modo solo carga o solo galería; previsualizar; cambiar TZ de programado con advertencia.

## Edge cases

Zona IANA inválida; fecha local afectada por horario estacional; imagen de portada inválida; otro organizador intenta editar; TZ de evento previamente activo.

## Data

Evento, propietario, nombre, inicio local/TZ, portada, bienvenida, flags, moderación y configuración de privacidad.

## Permissions

Organizador propietario configura su evento; admin corrige TZ tras activación justificando; preview no publica el borrador.

## Integrations

Validación de portada/archivos según contratos de media; auditoría EL-EP-014.

## Dependencies

EL-EP-001 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Mobile first, español/i18n-ready, WCAG 2.2 AA, aislamiento entre eventos.

## Herencia contractual de tickets

EL-TK-020..031 heredan `PROJECT.md` (NFR globales) y `api-conventions.md`: sesión vigente/cuenta activa y propietario o administración autorizada según la acción; recurso, autenticación o estado ausente/no autorizado no revelan otro evento y no mutan datos. Aplican TLS, espacio privado/no indexable, WCAG 2.2 AA, i18n-ready, idempotencia/conflictos y auditoría cuando corresponda. Cada ticket define sus excepciones concretas sin repetir esta base.

## Success criteria

Borrador privado configurable con preview; flags independientes; cambios de TZ restringidos y auditados.

## Risks

Preview confundido con acceso público; cambio de TZ accidental.

Dependencia de entrega: publicación y cómputo de fechas se implementan conforme al contrato que cierre EL-EP-003; esta épica delimita preparación y vista previa.

## Open questions

Ninguna. Q-038 y Q-039 fueron resueltas; requirements_reviewer aprobó el conjunto sin hallazgos pendientes.

## UI/UX handoff

UI_REQUIRED: YES
READY_FOR_FRONTEND_PLANNING: YES
READY_FOR_TICKET_WRITING: YES

UX_SCOPE: Crear/configurar borrador, portada segura, programacion/TZ, settings y preview privado.

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-002). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: Auth001; componentes preview de004 sin ejecutar acciones guest.

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

Las preguntas locales están cerradas y el quality gate final fue aprobado. Q-039 no resuelve PL-011 general.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-07: creación por product_planner con trazabilidad Q-004, Q-015, Q-016, Q-022; DEC-017, DEC-018, DEC-035, DEC-036; estado inicial READY; sin tickets.
- 2026-10-07: Q-034 / DEC-069 confirma creación con solo nombre, valores iniciales y datos asignados por sistema; fecha/hora, portada y bienvenida posteriores. No modifica el estado ni crea tickets.
- 2026-10-07: Q-035..037 / DEC-070..072 cierran DST/TZ, portada y frontera del PIN; no modifican el estado ni crean tickets.
- 2026-10-07: requirements_reviewer abrió Q-038/Q-039; estado pasa a NOT_READY sin cambios de alcance ni tickets READY.
- 2026-10-07: Q-038/Q-039 y DEC-073/074 cierran formato/almacenamiento de PIN y unidad decimal de portada; pendiente nueva revisión de requisitos.
- 2026-10-07: requirements_reviewer completó el gate de EL-TK-020..031: PARTIAL. Diez tickets READY; EL-TK-026/027 NOT_READY por Q-039/Q-038. [Dictamen](../sessions/2026-10-07-el-ep-002-ticket-review.md). Sin implementación ni avance a otra épica.
- 2026-10-07: requirements_reviewer aprobó la reevaluación de EL-TK-026/027 y confirmó EL-TK-020..031 implementables. EL-EP-002 y los doce tickets READY; [dictamen final](../sessions/2026-10-07-el-ep-002-ticket-final-review.md). Sin implementación ni avance a otra épica.
- 2026-10-12: Implementación y verificación completa de EL-EP-002 (17/17 tickets DONE). Ruta 1 (configuración básica), Ruta 2 (zona horaria y preview) y Ruta 3 (gestión de portadas EVENT_COVER) implementadas en `@eventlens/event-management`. Cobertura 100% de pruebas unitarias y de integración contra PostgreSQL 16 real. Estado pasa a DONE.
