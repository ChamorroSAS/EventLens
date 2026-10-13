# EL-TK-233 — Exponer autenticación y contexto de sesión administrativa
## Parent epic
EL-EP-019
## Status
READY
## User story
Como administrador autorizado, quiero iniciar, verificar, renovar contexto y cerrar mi sesión administrativa, para consultar la consola sin mezclar actores.
## Alcance funcional
Montar OpenAPI/cliente para login, sesión, session-context y logout admin; delegar MOD-001. Cookie `__Host-el_admin_session`, HTTPS, no-store, Origin exacto/header cliente, CSRF rotado sólo en contexto y CORS restrictivo.
## Fuera de alcance
No registro, MFA, recuperación, elevación, TTL nuevo ni almacenamiento web de secretos/CSRF.
## Criterios de aceptación
### Login
**Dado** principal/credencial ACTIVE y autoridad válida, **cuando** login cumple Origin/header, **entonces** emite sesión admin segura tras ACK.
### Contexto
**Dado** sesión vigente, **cuando** renueva contexto, **entonces** rota sólo CSRF sin nueva sesión, elevación ni extensión TTL.
### Falla cerrada
**Dado** autoridad/revisión/epoch inválidos, **cuando** llama cualquier endpoint, **entonces** responde 401/503 no-store sin fallback.
## Reglas de negocio
Actor sólo MOD-001; login rechazo neutro; logout actual no afecta sesiones organizer/guest.
## Validaciones y permisos
Ignorar/rechazar x-admin-actor-id; secreto no logs/URL/auditoría.
## Casos de error y estados vacíos
CSRF perdido exige contexto explícito; ACK logout incierto no confirma revocación.
## Datos / contratos afectados
POST/GET admin auth del contrato; MOD-001/OpenAPI/cliente.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-221, EL-TK-222. **blocks:** EL-TK-234, EL-TK-235, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Laboratorio HTTPS aislado: login/sesión/contexto/logout, Origin/CSRF/CORS, revocación/epoch/authority outage y cliente drift.
## Observabilidad / auditoría
Eventos redacted; nunca identifier completo, secreto, cookie o CSRF.
## Prioridad / estimación
P0 / L. Fase 5.
## Riesgos / notas
ACTIVATION BLOCKED hasta EL-TK-222; diseño cerrado, ejecución bloqueada por dependencia real.
## Traceability
EL-EP-019; MOD-001; contrato técnico/UI.
## Definition of Ready
- [x] Contratos, permisos y seguridad definidos
- [ ] Autoridad exterior acreditada (EL-TK-222)
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Sesión admin aislada verificada contra autoridad real y revisión crítica aprobada.
## Archivos candidatos
- **read/modify:** `apps/api/src/identity/organizer-session.controller.ts` (patrón a revisar), `packages/identity/src/authentication.ts`, `apps/api/src/export-openapi.ts`.
- **generated exclusively:** `contracts/openapi.json` mediante export OpenAPI y `packages/api-client/src/schema.ts` mediante generación del cliente; nunca edición manual.
- **test:** `packages/identity/test/authentication.integration.test.ts`, `apps/api/test/integration/organizer-session.test.ts`, nuevo `apps/api/test/admin-auth.integration.test.ts` si se crea controller semántico.
