# EL-TK-233 — Exponer autenticación y contexto de sesión administrativa
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como administrador autorizado, quiero iniciar, verificar, renovar contexto y cerrar mi sesión administrativa, para consultar la consola sin mezclar actores.
## Alcance funcional
Montar OpenAPI/cliente para login, sesión, session-context y logout admin; delegar MOD-001. Cookie `__Host-el_admin_session`, HTTPS, no-store, Origin exacto/header cliente, CSRF rotado sólo en contexto y CORS restrictivo.
## Fuera de alcance
No registro, MFA, recuperación, elevación, TTL nuevo ni almacenamiento web de secretos/CSRF.
## Criterios de aceptación
### Login
**Dado** principal/credencial ACTIVE y autoridad válida, **cuando** login cumple Origin/header, **entonces** emite sesión admin segura tras ACK.
- *Verificado:* Endpoint `POST /admin/auth/login` emite cookie `__Host-el_admin_session` con flags `HttpOnly; Secure; SameSite=Strict; Path=/` y encabezado `Cache-Control: no-store`. Token de sesión nunca expuesto en cuerpo de respuesta.
### Contexto
**Dado** sesión vigente, **cuando** renueva contexto, **entonces** rota sólo CSRF sin nueva sesión, elevación ni extensión TTL.
- *Verificado:* Endpoint `POST /admin/auth/session-context` rota exclusivamente `csrf_token_digest` mediante `renewSessionContext(...)`, conservando `auth_time`, `expires_at` e `idle_expires_at` originales.
### Falla cerrada
**Dado** autoridad/revisión/epoch inválidos, **cuando** llama cualquier endpoint, **entonces** responde 401/503 no-store sin fallback.
- *Verificado:* Fallo en validación o barrera de revocación exterior responde 401 Unauthorized sin fallback permisivo y con `Cache-Control: no-store`.
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
- `apps/api/test/admin-session.test.ts` (7 pruebas unitarias e integración en memoria).
- `packages/identity` (169 pruebas pasando al 100%).
## Observabilidad / auditoría
Eventos redacted; nunca identifier completo, secreto, cookie o CSRF.
## Prioridad / estimación
P0 / L. Fase 5.
## Riesgos / notas
ACTIVATION BLOCKED hasta EL-TK-222; diseño cerrado, ejecución completada tras acreditar EL-TK-222.
## Traceability
EL-EP-019; MOD-001; contrato técnico/UI.
## Definition of Ready
- [x] Contratos, permisos y seguridad definidos
- [x] Autoridad exterior acreditada (EL-TK-222)
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
- [x] Sesión admin aislada verificada contra autoridad real y revisión crítica aprobada.
- [x] Pruebas automatizadas de login, sesión, renovación de contexto, logout y barrera de autoridad pasando al 100% en `apps/api/test/admin-session.test.ts`.
- [x] Contratos Swagger y cliente TypeScript actualizados (`contracts/openapi.json`, `packages/api-client/src/schema.ts`).
- [x] Status: DONE.
## Archivos candidatos
- **read/modify:** `apps/api/src/identity/admin-session.controller.ts`, `apps/api/src/identity/admin-session.service.ts`, `packages/identity/src/authentication.ts`, `packages/identity/src/contracts.ts`, `apps/api/src/app.module.ts`.
- **generated exclusively:** `contracts/openapi.json` mediante export OpenAPI y `packages/api-client/src/schema.ts` mediante generación del cliente.
- **test:** `apps/api/test/admin-session.test.ts`.
