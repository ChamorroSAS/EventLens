# EL-TK-238 — Cerrar validación de seguridad del recorrido administrativo
## Parent epic
EL-EP-019
## Status
BLOCKED

## Evidencia independiente actual
Preparación inactiva: HTTPS real con certificado temporal verificado por CA (sin desactivar validación TLS), 8/8 pruebas de denegación PASS y cero UOW de dominio después del probe de aislamiento. Se ejercitan autoridad ausente, actor falso/cookie sintética del espacio organizador, sesión, Origin/header/CSRF/preflight CORS, no-store, logout sin ACK y rechazo de fallback legacy. No instala autoridad ni acredita emisión exitosa de cookie, sesión organizadora válida, PITR o UI de navegador. Cierre BLOCKED por EL-TK-222/237 y pruebas integradas/manuales pendientes. Véase `docs/reports/event-control-panels-validation-2026-10-14.md`.
## User story
Como responsable de seguridad, quiero validar de extremo a extremo la consola administrativa, para cerrar su MVP sin bypass ni fuga de datos.
## Alcance funcional
Ejecutar matriz integrada de auth/context/logout, búsqueda/detalle, auditoría, Router/UI, autoridad/revocación/epoch/PITR y aislamiento; consolidar evidencias y critical_review de identidad/recovery.
## Fuera de alcance
No declara EL-EP-019 DONE sin EL-TK-237, no implementa operaciones admin diferidas ni recuperación pública.
## Criterios de aceptación
### Denegación
**Dado** anónimo, organizador, header falso, credencial revocada o epoch incompatible, **cuando** llama admin, **entonces** no obtiene sesión/datos/acciones.
### Fallo dependiente
**Dado** authority o auditoría indisponible, **cuando** consulta/autentica, **entonces** responde fail-closed no-store sin cache/fallback.
### Interfaz segura
**Dado** login, búsqueda, detalle y logout incierto, **cuando** opera por teclado y deep-link, **entonces** no expone secreto, conserva foco y limpia privado cuando corresponde.
## Reglas de negocio
No igualar 503 a anónimo ni 401 a contraseña incorrecta; partial no es cero; logout no afecta organizer/guest.
## Validaciones y permisos
HTTPS, Origin/CSRF/CORS, allowlist retorno, serializadores mínimos y autoridad real acreditada.
## Casos de error y estados vacíos
Pérdida CSRF/contexto, carrera de búsqueda y sesión expirada requieren retry/reconciliación explícitos.
## Datos / contratos afectados
Contratos admin MOD-001/MOD-007, auditoría y UI admin.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218, EL-TK-221, EL-TK-222, EL-TK-233, EL-TK-234, EL-TK-235, EL-TK-236, EL-TK-237. **blocks:** ninguno. **can_parallelize_with:** ninguno.
## Pruebas requeridas
API/HTTPS/Playwright aislados, PostgreSQL y authority real; spoof/CSRF/Origin/CORS, auditoría failure, PITR/revoke, responsive/a11y; critical_review obligatorio.
## Observabilidad / auditoría
Verificar auditoría durable/redactada y que logs/evidencia no incluyen secretos, tokens, cookies o media.
## Prioridad / estimación
P0 / L. Fase 7.
## Riesgos / notas
EL-TK-222 bloquea activación y este cierre; no declarar seguridad aprobada por mocks.
## Traceability
EL-EP-019; MOD-001/MOD-007; contrato técnico/UI; EL-TK-221/222/233..237.
## Definition of Ready
- [x] Matriz security y dependencias definida
- [x] Gate 2 aprobado
- [ ] Capacidad EL-TK-222 y dependencias finales validadas
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: PARTIAL (denegación HTTPS independiente; cierre BLOCKED).
## Definition of Done
Critical_review sin hallazgos bloqueantes, evidencia aislada real y ambos recorridos aptos para decidir cierre de épica.
## Archivos candidatos
- **read/modify:** `infra/validation/admin-support/run.mjs`, `apps/web/src/app/admin/admin-api.service.ts`, `packages/admin-support/src/admin-search.ts`, `packages/identity/src/authentication.ts`.
- **test:** `packages/admin-support/test/admin-support-epic-e2e.test.ts`, `packages/identity/test/authentication.integration.test.ts`, nuevo Playwright semántico bajo `e2e/tests/`, reutilizando `e2e/playwright.config.ts` y runner aislado existente, sin segunda infraestructura E2E.
