# EL-TK-234 — Exponer búsqueda y detalle administrativo de sólo lectura
## Parent epic
EL-EP-019
## Status
READY
## User story
Como administrador autorizado, quiero buscar y abrir detalle mínimo de eventos, para investigar sin ejecutar acciones administrativas.
## Alcance funcional
Montar GET `/admin/search` y `/admin/events/{eventId}/aggregated-detail` usando owner MOD-007, filtros/paginación existentes, serialización mínima, no-store y auditoría durable previa a respuesta.
## Fuera de alcance
No invitationCode, media, capacidades diferidas, acciones, jobs, overrides ni nueva policy de búsqueda.
## Criterios de aceptación
### Consulta autorizada
**Dado** sesión admin vigente, **cuando** busca, **entonces** recibe página autorizada sin totales inventados.
### Detalle parcial
**Dado** sección indisponible, **cuando** abre evento, **entonces** recibe disponibilidad PARTIAL sin cero falso ni media.
### Auditoría fallida
**Dado** falla el sink owner, **cuando** consulta, **entonces** no responde éxito ni filtra error SDK/SQL.
## Reglas de negocio
Organizadores buscables según owner; sólo evento abre detalle. No snapshot distribuido ficticio.
## Validaciones y permisos
Actor MOD-001, owner autoriza; errores neutros para ausente/ajeno.
## Casos de error y estados vacíos
401/403/503 no-store, 404 neutral, input sanitizado/allowlisted.
## Datos / contratos afectados
MOD-007, endpoints admin, OpenAPI/cliente y auditoría.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-233. **blocks:** EL-TK-236, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
API aislada de auth, sanitización, paginación, partial, no-store, auditoría failure y schema/cliente.
## Observabilidad / auditoría
Auditoría durable de búsqueda/detalle sin query sensible, media, secretos ni doble evento.
## Prioridad / estimación
P0 / M. Fase 5.
## Riesgos / notas
No activar mientras EL-TK-222 continúe BLOCKED.
## Traceability
EL-EP-019; MOD-007; contrato técnico.
## Definition of Ready
- [x] Owner/read-only/errores definidos
- [x] Gate 2 y activación de autoridad aprobadas
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Lecturas mínimas auditadas y fail-closed demostradas en entorno aislado.
## Archivos candidatos
- **read/modify:** `packages/admin-support/src/admin-search.ts`, `packages/admin-support/src/admin-event-detail.ts`, `packages/admin-support/src/contracts.ts`, `apps/api/src/export-openapi.ts`.
- **test:** `packages/admin-support/test/admin-search.integration.test.ts`, `packages/admin-support/test/admin-event-detail.integration.test.ts`, nuevo `apps/api/test/admin-read-only.integration.test.ts` si se crea controller semántico.
