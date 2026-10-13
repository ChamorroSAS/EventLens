# EL-TK-218 — Laboratorio aislado para API, SPA y autoridad de EL-EP-019

## Parent epic
EL-EP-019
## Status
READY
## User story
Como equipo de entrega, quiero ejecutar las pruebas mutantes de paneles en un laboratorio aislado, para proteger las bases y servicios de desarrollo.
## Alcance funcional
Extender el runner aislado de EL-TK-215 para API E2E, SPA y una autoridad de prueba durable, con DB, rol, marcador, puertos y fixtures propios por ejecución/worker. Validar `NODE_ENV=test` (o equivalente Vitest), URL/DB/rol/marker efectivos antes de `listen` y antes de cualquier callback; `reuseExistingServer:false`. Cleanup comprueba ownership y elimina exclusivamente recursos creados por el runner.
## Fuera de alcance
No ejecuta pruebas contra `eventlens`, no reutiliza API dev, no selecciona RecoveryAuthority productiva ni modifica datos locales.
## Criterios de aceptación
### Rechazo temprano
**Dado** una URL o marker no autorizados, **cuando** el runner inicia, **entonces** falla antes de escuchar o ejecutar una operación mutante.
### Recursos propios
**Dado** una ejecución autorizada, **cuando** crea DB/rol/marker/puertos, **entonces** cada recurso queda identificado con su ejecución y el cleanup sólo actúa sobre esos recursos.
### Aislamiento demostrable
**Dado** un fixture propio del harness que crea un sentinel en PostgreSQL aislado, **cuando** el cleanup intenta actuar sobre un recurso ajeno a esa ejecución bajo control del fixture, **entonces** el sentinel permanece intacto y queda evidencia reproducible.
## Reglas de negocio
La identidad declarada no basta: se verifica la conexión efectiva. Autoridad de laboratorio es independiente del timeline PostgreSQL efímero.
## Validaciones y permisos
Denegar por defecto; secretos y URLs sensibles no salen en logs. Sólo el runner controla cleanup.
## Casos de error y estados vacíos
DB inaccesible, puerto ocupado, marker ajeno o autoridad ausente detienen la ejecución sin fallback. Una URL de desarrollo se rechaza antes de abrir conexión o inspeccionar filas de desarrollo.
## Datos / contratos afectados
EL-TK-215; `event-control-panels-contract.md` sección Laboratorio y evidencias futuras.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-215. **blocks:** EL-TK-219, EL-TK-221, EL-TK-222, EL-TK-223, EL-TK-237, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Unitarias de guards; integración PostgreSQL aislada de rechazo de URL de desarrollo sin conexión, rechazo antes de callback, ownership/cleanup y puertos; evidencia de sentinel del fixture intacto. No declarar ejecución hasta realizarla.
## Observabilidad / auditoría
Registrar sólo executionId, resultado de guard y recursos redacted; sin credenciales, cookies ni DATABASE_URL.
## Prioridad / estimación
P0 / M. Fase 1.
## Riesgos / notas
Prerequisito de seguridad: implementación nueva sólo después de Gate 2; no acredita autoridad operacional real.
## Traceability
EL-EP-019; EL-TK-215; EL-TD-003/006; `event-control-panels-contract.md`.
## Definition of Ready
- [x] Comportamiento, aislamiento y criterios comprobables definidos
- [x] Dependencias, permisos y fallos identificados
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES, limitado al laboratorio tras Gate2 aprobado y evidencia acotada de EL-TK-215. IMPLEMENTED: NO; no habilita autoridad ni activación productiva.
## Definition of Done
Guards antes de listen/callback, recursos propios limpiados, evidencia aislada reproducible y revisión de seguridad sin blockers.
## Archivos candidatos
- **read/modify:** `scripts/isolated-tests.mjs`, `scripts/workspace.mjs`, `e2e/playwright.config.ts`, `packages/database/src/testing.ts`; reutilizar `infra/validation/identity/run.mjs` cuando aplique. Tests guard en `packages/database/test/test-isolation.unit.test.ts`.
- **test:** `apps/api/test/integration/organizer-account-and-events.test.ts` y un fixture nuevo semántico bajo `infra/validation/identity/` si la cobertura actual no basta.
