# EL-TK-225 — Exponer edición de nombre con revisión esperada
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero guardar el nombre de mi borrador, para corregirlo sin sobrescribir cambios ajenos.
## Alcance funcional
Montar PATCH `/api/v1/events/{eventId}/configuration/name` `{name,expectedRevision}` y cliente generado; delegar ownership, receipt/CAS y restricción DRAFT en MOD-002.
## Fuera de alcance
No cambia fecha/TZ/UI ni permite nombre fuera de DRAFT.
## Criterios de aceptación
### Cambio permitido
**Dado** DRAFT propio y revisión vigente, **cuando** guarda nombre válido, **entonces** actualiza sólo nombre y devuelve receipt/revisión.
### Conflicto
**Dado** revisión obsoleta, **cuando** intenta nueva intención, **entonces** recibe 409 `CONCURRENCY_CONFLICT` sin overwrite.
### Estado denegado
**Dado** evento no DRAFT, ajeno o sesión inválida, **cuando** llama, **entonces** no cambia ni revela existencia.
## Reglas de negocio
Trim 1..120; expectedRevision es string opaca; key requerida.
## Validaciones y permisos
Owner servidor, Origin/CSRF/no-store y sesión ordinaria revalidada.
## Casos de error y estados vacíos
400 shape/key, 422 nombre, 409 replay/conflicto, 503 dependencia; no retry automático.
## Datos / contratos afectados
PATCH name, OpenAPI/cliente, capacidades `canEditName` consumidas luego.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-219, EL-TK-220, EL-TK-221. **blocks:** EL-TK-230, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
PostgreSQL aislado de DRAFT, concurrencia, replay, ownership, revocación y drift OpenAPI.
## Observabilidad / auditoría
Auditoría durable de operación/outcome sin valor previo/nuevo completo.
## Prioridad / estimación
P0 / S. Fase 2.
## Riesgos / notas
Activación sujeta a EL-TK-222.
## Traceability
EL-EP-019; DEC-069; contrato técnico.
## Definition of Ready
- [x] Regla DRAFT, errores y contrato delimitados
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: YES.
## Definition of Done
Mutación CAS/idempotente probada sin acceso ajeno ni pérdida de actualización.
## Archivos candidatos
- **read/modify:** `apps/api/src/events/organizer-events.controller.ts`; consume el dominio propietario sin alterar reglas de negocio.
- **generated exclusively:** `contracts/openapi.json` mediante export OpenAPI y `packages/api-client/src/schema.ts` mediante generación del cliente; nunca edición manual.
- **test:** `apps/api/test/integration/organizer-account-and-events.test.ts`, `packages/event-management/test/event-draft-config.integration.test.ts`.
