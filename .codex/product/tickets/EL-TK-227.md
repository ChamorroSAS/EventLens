# EL-TK-227 — Exponer cambio de zona horaria de evento
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero cambiar la zona horaria permitida, para conservar hora local y recalcular UTC correctamente.
## Alcance funcional
Montar PUT `/api/v1/events/{eventId}/configuration/timezone` `{timezone,utcOffsetMinutes?,expectedRevision}` y cliente generado; DRAFT/SCHEDULED antes de ACTIVE conserva local y recalcula UTC.
## Fuera de alcance
No guarda fecha/hora en la misma mutación ni crea un comando combinado de UI TZ+fecha; no altera lifecycle ni habilita invitados.
## Criterios de aceptación
### DRAFT
**Dado** DRAFT propio, **cuando** guarda IANA válida, **entonces** cambia TZ y devuelve `TIMEZONE_CHANGED`/receipt.
### SCHEDULED
**Dado** SCHEDULED antes de ACTIVE, **cuando** cambia TZ válida, **entonces** conserva local, recalcula UTC y expone únicamente el `warning: 'RECALCULATED_SCHEDULE'` allowlisted por el owner; no lo infiere del estado ni del receipt outcome.
### Restricción
**Dado** ACTIVE, TZ inválida, gap/overlap no resuelto o revisión vieja, **cuando** llama, **entonces** no cambia y recibe 409/422.
## Reglas de negocio
No elección automática de offset; client no calcula autoridad DST.
## Validaciones y permisos
Owner valida IANA, offset y estado; key/CSRF/sesión vigentes.
## Casos de error y estados vacíos
422 allowlist offset, 409 estado/CAS, 503 dependencia sin fallback.
## Datos / contratos afectados
PUT timezone; capacidades `canChangeTimezone`; OpenAPI/cliente.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-219, EL-TK-220, EL-TK-221. **blocks:** EL-TK-232, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
PostgreSQL aislado DRAFT/SCHEDULED/ACTIVE, preserve-local/recalculate-UTC, DST y carreras; API/cliente verifica el envelope y el warning allowlisted, incluso en replay, sin alterar receipt.
## Observabilidad / auditoría
Auditar cambio/outcome sin datos personales ni secreto.
## Prioridad / estimación
P0 / M. Fase 2.
## Riesgos / notas
El calendario propietario sí se coordina atómicamente con el cambio de TZ en la misma transacción/revisión; la UI no combina ambos comandos. Activación queda bloqueada por EL-TK-222.
## Traceability
EL-EP-019; DEC-070; contrato técnico.
## Definition of Ready
- [x] Estados, validación DST y contrato definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
Transición TZ comprobada con recálculo propietario atómico, warning allowlisted conservado en replay sin alterar receipt, y sin comando combinado de UI TZ+fecha.
- [x] Endpoint PUT `/api/v1/events/{eventId}/configuration/timezone` implementado en `OrganizerEventsController`.
- [x] Recálculo atómico en MOD-002 mediante `EventDraftService.changeTimezone` preservando hora local y recalculando UTC con warning `RECALCULATED_SCHEDULE` en estado `SCHEDULED`.
- [x] Validación CAS monotónica con `expectedRevision` y conflicto 409 ante revisiones obsoletas.
- [x] Rechazo de cambios de zona horaria sobre eventos que alcanzaron `ACTIVE` con 409 (`INVALID_STATE`).
- [x] Persistencia e idempotencia con receipts durables en `event_command_receipt` (`CHANGE_TIMEZONE`), preservando warning y envelope en repeticiones.
- [x] Export OpenAPI y cliente TypeScript `api-client` regenerados sin edición manual.
- [x] Pruebas unitarias de CAS, warning, y estados validadas en Vitest.

## Cierre de implementación — 2026-10-13
Implementación completada en rama `EL-TK-227`. Endpoint montado en NestJS, tipado generado en OpenAPI (`contracts/openapi.json`) y api-client (`packages/api-client/src/schema.ts`), con integración en `OrganizerService` de `@eventlens/web`. Suite de pruebas y typecheck ejecutados con éxito.

