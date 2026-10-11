# EL-TK-020 — Crear un borrador de evento

## Parent epic

EL-EP-002

## Status

DONE

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer declaró este ticket implementable, sin hallazgos pendientes. Se conservan sus dependencias de ejecución. Véase [dictamen](../sessions/2026-10-07-el-ep-002-ticket-review.md).

## Resolución e implementación — 2026-10-11
- **Paquete creado:** `@eventlens/event-management` en `packages/event-management/`.
- **Esquema y migración:** Modelo `Event` agregado con migración `202610110021_event_draft` ensamblada en `packages/database/`.
- **Servicio y políticas:**
  - `EventDraftService.createDraft` con validación estricta de nombre (1..120 caracteres tras trim), aislamiento de organizador mediante `OrganizerActorContext`, e idempotencia segura con `ON CONFLICT (idempotency_key) DO NOTHING` e indexación única `(organizer_id, idempotency_key)`.
  - Configuración inicial restrictiva confirmada (DEC-069): `status = 'DRAFT'`, `timezone = 'America/Bogota'`, `uploads_enabled = false`, `guest_gallery_enabled = false`, `moderation_mode = 'AUTO_PUBLISH'`, `pin_enabled = false`.
  - `EventAccessPolicy` con bloqueo estricto de acceso de invitados (`assertGuestAccessAllowed`) y carga de fotos (`assertGuestUploadAllowed`) en eventos DRAFT.
  - Auditoría append-only sin secretos en `admin_audit_event`.
- **Pruebas y verificación:**
  - 6 pruebas unitarias (`test/event-draft.unit.test.ts`).
  - 3 pruebas de integración contra PostgreSQL 16 real (`test/event-draft.integration.test.ts`).
  - Suite de validación en `infra/validation/event-management/run.mjs` con resultado `PASS` (9/9 pruebas superadas). Typecheck y test de workspace en verde.

## User story

**Como** organizador autenticado, **quiero** crear un borrador con su nombre, **para** preparar el evento sin exponerlo a invitados.

## Alcance funcional

Crear un evento con nombre válido. El sistema asigna identificador, propietario, timestamps e IDs internos necesarios; fija `DRAFT`, `America/Bogota`, `uploads_enabled=false`, `guest_gallery_enabled=false`, `AUTO_PUBLISH` y PIN desactivado.

## Criterios de aceptación

### Escenario 1
**Dado** un organizador autenticado y un nombre válido, **cuando** crea el evento, **entonces** obtiene un DRAFT propio con los valores iniciales confirmados.

### Escenario 2
**Dado** un nombre inválido, **cuando** intenta crear, **entonces** no se crea el evento y recibe el error de validación.

### Escenario 3
**Dado** un DRAFT recién creado, **cuando** un invitado intenta acceder o cargar, **entonces** no obtiene acceso ni puede cargar.

## Validaciones y permisos

Solo un organizador autenticado crea. El propietario queda asociado al evento; no se crea fecha/hora, portada, bienvenida, acceso publicado ni QR.

## Datos / contratos afectados

Evento: identificador, propietario, nombre, estado, TZ, flags, moderación, PIN y timestamps.

## Dependencias de tickets

- **depends_on:** EL-TK-013.
- **blocks:** EL-TK-021, EL-TK-022, EL-TK-023, EL-TK-024, EL-TK-025, EL-TK-027, EL-TK-028, EL-TK-029, EL-TK-030, EL-TK-031, EL-TK-047, EL-TK-049, EL-TK-051.
- **can_parallelize_with:** ninguno.

## Pruebas requeridas

Escenarios de creación, validación, aislamiento de propietario y bloqueo de acceso/carga invitada.

## Observabilidad / auditoría

Auditar creación con actor, evento y resultado, sin secretos.

## Prioridad / estimación

P0 / S

## Traceability

Q-004, Q-015, Q-016, Q-022, Q-034; DEC-017, DEC-018, DEC-035, DEC-069; EL-EP-002.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final de 2026-10-08:** remediación APPROVED; READY del 2026-10-07 permanece histórico. Hereda el handoff [EL-EP-002](../../context/ui-mvp-epic-review.md#el-ep-002), su contrato común y EL-TD-001..007 sin seleccionar librerías/CSS/iconos.

### Confirmación y conflictos de escritura
**Dado** actor vigente autorizado y revisión esperada, **cuando** guarda esta acción, **entonces** el servidor valida owner/estado/barreras y confirma cambio, recibo de idempotencia y auditoría/jobs pertinentes en una transacción SQL; rollback no conserva cambio ni intención parcial. Replay compatible devuelve el mismo efecto/recibo; misma clave con payload distinto o revisión obsoleta da conflicto sin sobrescribir. La UI sólo anuncia éxito de esta sección tras confirmación, nunca el guardado de otra.

### Interacción y accesibilidad
CreateEventForm consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

Crear repetido con la misma clave confirma un único DRAFT/eventId; owner se deriva de ActorContext y nunca del payload. Loading de crear conserva nombre y error no anuncia evento creado.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
