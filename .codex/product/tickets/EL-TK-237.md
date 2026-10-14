# EL-TK-237 — Validar de forma integrada el recorrido del organizador
## Parent epic
EL-EP-019
## Status
BLOCKED

## Evidencia de ejecución independiente
Preparación verificada sin activar: aislamiento 38/38, PostgreSQL receipts/CAS/zona horaria 16/16, API organizador con migraciones reales 5/5 y suite frontend completa 246/246 PASS. Runner incorpora scopes reproducibles y sentinel único de propiedad exclusiva. Cierre BLOCKED por autoridad operacional EL-TK-222, integración HTTPS/Playwright y accesibilidad manual; estas pruebas no acreditan post-PITR. Véase `docs/reports/event-control-panels-validation-2026-10-14.md`.
## User story
Como equipo de entrega, quiero validar el recorrido completo del organizador en laboratorio, para acreditar sus garantías antes de activarlo.
## Alcance funcional
Integrar documentación/revisión y evidencias de laboratorio para lista, create, detalle, nombre, horario/TZ, Router, receipts/CAS, sesión/revocación/authority y UI a11y/responsive. Requiere autoridad real EL-TK-222 para activación final.
## Fuera de alcance
No declara la épica DONE, no cubre admin final, no certifica WCAG sólo por tests ni ejecuta contra desarrollo.
## Criterios de aceptación
### Recorrido durable
**Dado** laboratorio autorizado, **cuando** crea→edita→replay, **entonces** no duplica y UI consulta estado actual.
### Concurrencia/seguridad
**Dado** CAS, revoke, epoch/barrera o authority outage, **cuando** se ejercitan, **entonces** falla cerrado/atómico sin datos privados.
### UI verificable
**Dado** 320/375/768/1024/1440, teclado y lector manual, **cuando** opera, **entonces** foco, anuncios y reflow cumplen el handoff con evidencia.
## Reglas de negocio
Timeout conserva intención; acceso ajeno/restringido no enumera; no activar sin evidencia operational EL-TK-222.
## Validaciones y permisos
Guard de EL-TK-218 antes de listen/callback; HTTPS real si el dominio admin/secure cookie aplica.
## Casos de error y estados vacíos
DB/authority/audit/GET posterior fallidos no convierten resultado en éxito.
## Datos / contratos afectados
Todos los contratos organizer de EL-EP-019 y documentación operativa/revisión.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218, EL-TK-219, EL-TK-220, EL-TK-221, EL-TK-222, EL-TK-223, EL-TK-224, EL-TK-225, EL-TK-226, EL-TK-227, EL-TK-228, EL-TK-229, EL-TK-230, EL-TK-231, EL-TK-232. **blocks:** EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Unitarias, API/PostgreSQL, cliente drift, Playwright aislado, revisión manual a11y y revisión independiente; registrar comandos/resultados reales al ejecutar.
## Observabilidad / auditoría
Evidencias redactadas; auditoría de comandos sin secretos/cookies/keys.
## Prioridad / estimación
P0 / L. Fase 7.
## Riesgos / notas
No puede cerrar activación mientras EL-TK-222 sea BLOCKED; no declarar PASS por planificación.
## Traceability
EL-EP-019; contrato técnico/UI; EL-TK-218..232.
## Definition of Ready
- [x] Matriz de garantías y dependencias definida
- [x] Gate 2 aprobado
- [ ] Capacidad EL-TK-222 y dependencias finales validadas
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: PARTIAL (alcance independiente; activación/cierre pendientes).
## Definition of Done
Evidencia reproducible aislada, revisión independiente y activación organizer aprobada; no cierra la épica.
## Archivos candidatos
- **read/modify:** `infra/validation/event-management/run.mjs`, `apps/api/test/integration/organizer-account-and-events.test.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.spec.ts`.
- **test:** suites aisladas de `packages/event-management/test/event-draft*.integration.test.ts` y Playwright semántico nuevo bajo `e2e/tests/`, reutilizando `e2e/playwright.config.ts` y runner aislado existente, sin segunda infraestructura E2E.
