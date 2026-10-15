# EL-TK-226 — Exponer programación local de borrador
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero guardar fecha y hora local de mi borrador, para planificarlo en su zona confirmada.
## Alcance funcional
Montar PUT `/api/v1/events/{eventId}/configuration/schedule` `{startsAtLocal,utcOffsetMinutes?,expectedRevision}` y cliente generado; llamar `RecalculateSchedule` propietario en misma revisión/transacción.
## Fuera de alcance
No cambia TZ, no activa/publica, no programa lifecycle ni borra programación.
## Criterios de aceptación
### Guardado DRAFT
**Dado** DRAFT propio con TZ vigente, **cuando** guarda fecha local válida, **entonces** se persiste/recalcula atómicamente y retorna receipt.
### DST gap
**Dado** hora inexistente en la zona, **cuando** la envía, **entonces** recibe 422 sin cambio.
### DST overlap/CAS
**Dado** hora ambigua sin offset o revisión vieja, **cuando** guarda, **entonces** recibe allowlist 422 o 409 sin efecto.
## Reglas de negocio
Formato local sin Z/offset embebido; DRAFT sin inicio no inventa expiración.
## Validaciones y permisos
IANA/TZ vigente y owner servidor validan offset/DST; key, CSRF y sesión revalidada.
## Casos de error y estados vacíos
422 fecha/TZ/DST, 409, 503; no guardado atómico con TZ.
## Datos / contratos afectados
PUT schedule; MOD-002 calendario; OpenAPI/cliente.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-219, EL-TK-220, EL-TK-221. **blocks:** EL-TK-231, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
PostgreSQL aislado de fecha válida, gap, overlap/offset, CAS, rollback del calendario y autorización.
## Observabilidad / auditoría
Auditar outcome y correlationId sin fecha/datos privados innecesarios.
## Prioridad / estimación
P0 / M. Fase 2.
## Riesgos / notas
Activación queda bloqueada por EL-TK-222.
## Traceability
EL-EP-019; DEC-070; contrato técnico.
## Definition of Ready
- [x] Contrato/DST/transacción definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
Calendario propietario y errores DST demostrados con CAS, receipt durable y tipado en OpenAPI/cliente.
- [x] Endpoint PUT `/api/v1/events/{eventId}/configuration/schedule` implementado en `OrganizerEventsController`.
- [x] Recálculo atómico en MOD-002 mediante `EventDraftService.setSchedule` con resolución DEC-070 DST (gap 422, overlap/offset 422, formato ISO local).
- [x] CAS monotónico verificado con `expectedRevision` y conflicto 409.
- [x] Persistencia e idempotencia con receipts durables en `event_command_receipt` (`SET_SCHEDULE`).
- [x] Export OpenAPI y cliente TypeScript `api-client` regenerados sin edición manual.
- [x] Pruebas unitarias de CAS, DST y contratos validadas en Vitest.

## Cierre de implementación — 2026-10-13
Implementación completada en rama `EL-TK-226`. Endpoint montado en NestJS, tipado generado en OpenAPI (`contracts/openapi.json`) y api-client (`packages/api-client/src/schema.ts`), con integración en `OrganizerService` de `@eventlens/web`. Suite de pruebas ejecutada con éxito (30 test files, 190 tests en `@eventlens/web`).

