# EL-TK-224 — Exponer creación idempotente de evento mediante HTTP/OpenAPI
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero crear un borrador por el contrato HTTP propietario, para abrir un evento real sin duplicarlo.
## Alcance funcional
Montar POST `/api/v1/events` `{name}` con `Idempotency-Key`, delegando a MOD-002 receipt/CAS y sesión validada; publicar OpenAPI y regenerar cliente. Responder envelope `{receipt,outcome,event:{id}}`, 201 inicial/200 replay compatible.
## Fuera de alcance
No crea UI, no acepta actor/organizerId del body ni publica/activa/invita.
## Criterios de aceptación
### Creación
**Dado** owner ordinario y nombre trim 1..120, **cuando** POST autorizado confirma, **entonces** crea exactamente un DRAFT restrictivo con ID servidor.
### Replay
**Dado** misma key/payload, **cuando** reintenta tras edición, **entonces** devuelve receipt original y no otro evento.
### Rechazo
**Dado** header/payload inválido o sesión revocada, **cuando** llama, **entonces** responde 400/401/403 sin efecto.
## Reglas de negocio
Nombre, owner y defaults DEC-069 son del servidor; outcome replay no sustituye lectura actual.
## Validaciones y permisos
Origin/CSRF/CORS/no-store y `validateMutatingOrganizerSession` más contexto ordinario; recursos ajenos no enumeran.
## Casos de error y estados vacíos
409 idempotency/concurrency, 503 DB/authority; timeout conserva intención sin retry ciego.
## Datos / contratos afectados
MOD-002, OpenAPI, cliente generado, POST `/events`.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-219, EL-TK-220, EL-TK-221. **blocks:** EL-TK-229, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
API/PostgreSQL aislado creation→edit→replay, duplicado concurrente, auth/CSRF/Origin, contrato-cliente drift.
## Observabilidad / auditoría
Auditar operación/outcome sin key o nombre sensible completo.
## Prioridad / estimación
P0 / M. Fase 2.
## Riesgos / notas
ACTIVATION BLOCKED por EL-TK-222 aunque el endpoint se implemente; no habilitar mutaciones finales.
## Traceability
EL-EP-019; DEC-069; contrato técnico organizer.
## Definition of Ready
- [x] Contrato y dependencia de seguridad definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Contrato generado sin drift y comportamiento idempotente probado en laboratorio aislado.
## Archivos candidatos
- **read/modify:** `apps/api/src/events/organizer-events.controller.ts`, `apps/api/src/export-openapi.ts`.
- **generated exclusively:** `contracts/openapi.json` mediante export OpenAPI y `packages/api-client/src/schema.ts` mediante generación del cliente; nunca edición manual.
- **test:** `apps/api/test/integration/organizer-account-and-events.test.ts`, `packages/event-management/test/event-draft.integration.test.ts`.
