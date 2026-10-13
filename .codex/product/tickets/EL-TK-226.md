# EL-TK-226 — Exponer programación local de borrador
## Parent epic
EL-EP-019
## Status
READY
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
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Calendario propietario y errores DST demostrados en PostgreSQL aislado.
## Archivos candidatos
- **read/modify:** `apps/api/src/events/organizer-events.controller.ts`; consume dominio/calendario propietario sin alterar reglas de negocio.
- **generated exclusively:** `contracts/openapi.json` mediante export OpenAPI y `packages/api-client/src/schema.ts` mediante generación del cliente; nunca edición manual.
- **test:** `packages/event-management/test/event-schedule.integration.test.ts`, `packages/event-management/test/event-draft-timezone-preview.integration.test.ts`.
