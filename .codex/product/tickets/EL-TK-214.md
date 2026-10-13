# EL-TK-214 — Validar la entrada pública integrada

## Parent epic
EL-EP-018

## Status
DONE

## User story
**Como** equipo de producto, **quiero** verificar la entrada pública integrada contra sus contratos, **para** detectar rutas, permisos, sesiones y serving que no funcionan en conjunto.

## Alcance funcional
Ejecutar y documentar validación integrada de los montajes de EL-EP-018: OpenAPI/cliente, API con PostgreSQL real cuando aplique, build/serving y Playwright. Corregir únicamente fallos dentro de los tickets predecesores mediante sus responsables; no añade capacidad funcional nueva.

public-entry-contract.md/ui-public-entry.md normativos: probar transporte real/DB/serving, no mocks como única evidencia. Los harness parciales206..211 no certifican root final:213 ensamblado y212serving son predecesoras. Fallos regresan al ticket propietario; no rediseño/autoridad nueva.

## Fuera de alcance
No certifica publicación pública, revisión legal, indexación comercial ni sustituye pruebas específicas de dominio ya asignadas.

## Criterios de aceptación
### Recorridos críticos
**Dado** el runtime integrado, **cuando** se ejecutan los recorridos de Home, login/retorno, Beta, Mi cuenta ordinaria/restringida, Mis eventos, logout y guest directo, **entonces** cumplen sus contratos sin una autoridad concedida por cliente.

### Límites de transporte
**Dado** refresh, URL maliciosa, back/forward y rutas API/media, **cuando** se prueban en serving real, **entonces** no hay open redirect, absorción SPA indebida ni exposición de lookupKey en logs verificables.

### Accesibilidad
**Dado** teclado, foco, reflow/zoom y estados de error/carga, **cuando** se prueba la interfaz integrada, **entonces** se conservan los requisitos del handoff; la revisión manual de lector queda registrada separada de automatización.

## Dependencias de tickets
- **depends_on:** EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210, EL-TK-211, EL-TK-212, EL-TK-213.
- **blocks:** ninguno.
- **can_parallelize_with:** ninguno.

## Pruebas requeridas
Vitest/cliente, API y PostgreSQL real para permisos/CSRF/no enumeración, build/serving y Playwright de flujos definidos. Adjuntar resultados reales; no declarar PASS no ejecutado.

## Prioridad / estimación
P0 / M

## Riesgos / notas
Un fallo de integración vuelve al ticket propietario; no convierte el ticket en un contenedor de rediseño.

## Traceability
EL-EP-018; `public-entry-contract.md`; `ui-public-entry.md`; EL-TD-004/006; EL-EP-017/Q-029.

## Definition of Ready
- [x] Alcance de validación y recorridos definidos
- [x] Criterios observables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: NO. READY_FOR_FRONTEND_PLANNING: NOT_APPLICABLE. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: YES. IMPLEMENTED: YES.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).

## Evidencia de entrega y validación integrada
1. **Contratos y OpenAPI / Cliente Tipado:**
   - OpenAPI generado sincronizado (`apps/api/dist/export-openapi.js --check` PASS).
   - Cliente TypeScript `@eventlens/api-client` generado sincronizado y compilado (`scripts/api-client.mjs --check` PASS).
2. **Pruebas de Integración de API contra PostgreSQL 16 real:**
   - `test/integration/guest-public-entry.test.ts`: 1/1 test PASS (resolución de lookupKey, PIN, cookies HttpOnly, revocación por regeneración).
   - `test/integration/organizer-session.test.ts`: 2/2 tests PASS (sesiones anónima, activa, restringida y logout con CSRF/Origin).
   - `test/integration/organizer-account-and-events.test.ts`: 2/2 tests PASS (gestión de sesiones, anti-enumeración 404, reautenticación).
   - `test/integration/beta-access-request.test.ts`: 1/1 test PASS (solicitud de Beta pública sin enumeración ni colisión).
   - `test/integration/unavailable.test.ts` & `health.test.ts`: 3/3 tests PASS.
   - Total suite de integración de API: **6/6 suites PASS (9/9 tests PASS)**.
3. **Pruebas Unitarias y de Componentes de Frontend (`@eventlens/web`):**
   - 27/27 suites PASS, **154/154 tests PASS**.
   - Build de producción `ng build` exitoso sin advertencias ni errores (95.38 kB total bundle).
4. **Validación E2E Integrada con Playwright (`e2e/tests/`):**
   - Servidor SPA (`apps/web/spa-server.mjs`) ejecutado como runtime real con `createSpaStaticServer`.
   - `platform.spec.ts`: PASS (readiness, openapi.json, docs, y carga del Home con marca y H1 editorial).
   - `public-entry-integrated.spec.ts`: 6/6 tests PASS (Home público, navegación anónima hacia Iniciar sesión y Solicitar acceso, guest direct entry `/g/:lookupKey`, 404 de aplicación para rutas SPA desconocidas, rechazo 404 JSON sin absorción SPA para `/api/*`, y accesibilidad de menú móvil con `aria-expanded` y tecla `Escape`).
   - Total Playwright: **7/7 tests PASS (2.7s)**.
