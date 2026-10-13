# EL-TK-206 — Preparar infraestructura Router y contratos seguros de montaje

## Parent epic
EL-EP-018

## Status
DONE

## User story
**Como** equipo web, **quiero** infraestructura y contratos seguros de montaje Router, **para** incorporar superficies propietarias después de entregarlas sin imports futuros, ciclos o rutas ficticias.

## Alcance funcional
Preparar Angular Router compatible, contratos/descriptores de paths aprobados, patrón ErrorState/404 neutro y resolución/canonicalización pura de retorno interno. Excluir externos, protocol-relative, esquemas, API/media, guest/QR, admin, auth/ciclos; sin retorno válido usar `/`. No activar root productivo ni importar pantallas futuras207..213. Cada207..211 exporta su superficie/descriptor real;213 ensambla Home/404 y provideRouter/RouterOutlet después de esas entregas. Guard/autoridad se aplica en consumers dependientes205, no aquí. Normativos public-entry-contract.md/ui-public-entry.md.

## Fuera de alcance
No modifica main.ts/AppComponent/root productivo, ni implementa Home/login/Beta/cuenta/dashboard/guest/policies. No importa componentes aún inexistentes o requiere sesión205 para validar retorno puro. Sin placeholders públicos, rutas alternativas o guard organizador en QR. Harness Angular de test no se presenta como navegación productiva entregada.

## Criterios de aceptación
### Salida independiente
**Dado** el contrato de rutas y un harness Angular exclusivo de pruebas, **cuando** se compila/prueba Router/resolución pura, **entonces** utiliza Router real y fixtures marcadas como test, sin importar pantallas futuras ni activar root productivo. No declara URLs finales funcionales.

### Retorno puro
**Dado** un destino candidato, **cuando** se canonicaliza, **entonces** sólo conserva paths internos permitidos y rechaza externos, codificaciones peligrosas, protocol-relative, API/media, QR/admin/auth/ciclos; fallback `/`. La salida no concede permisos: el consumer vuelve a autorizar con205.

### Desconocida
**Dado** wildcard en el harness, **cuando** monta ErrorState/404 real reutilizable por213, **entonces** presenta texto neutro y Volver al inicio accesibles sin enumeración. Fallback servidor/API/media y recorridos productivos completos se aceptan en212/214.

## Validaciones y permisos
Los guards sólo orientan UI; el owner servidor vuelve a autorizar. Estado desconocido no muestra navegación privada. Guest/admin conservan sus contextos.

## Datos / contratos afectados
Infraestructura semántica de navegación/contratos/descriptores reutilizables, ErrorState/404 y harness. main.ts/root se activan en213. Sin directorios runtime nombrados por IDs de tickets.

## Dependencias de tickets
- **depends_on:** EL-TK-204.
- **blocks:** EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210, EL-TK-211, EL-TK-212, EL-TK-213.
- **can_parallelize_with:** EL-TK-205.

## Pruebas requeridas
Vitest de contratos/canonicalización, Router/ErrorState reales en harness Angular sólo test y pruebas de foco/wildcard. Harness fuera del bundle productivo; build/typecheck sin imports futuros. No certifica login/Home/refresh productivo:213/214 verifican esas rutas con consumidores reales.

## Prioridad / estimación
P0 / M

## Riesgos / notas
No publicar placeholders que aparenten una capacidad de owner aún no integrada.

## Traceability
EL-EP-018; `public-entry-contract.md`; `ui-public-entry.md`; EL-TD-001/004/006.

## Definition of Ready
- [x] Rutas, límites y retornos definidos
- [x] Criterios y permisos comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: YES. IMPLEMENTED: YES.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).

## Evidencia de implementación (2026-10-12)
- **Contratos y descriptores (`apps/web/src/app/navigation/public-entry-routes.contract.ts`):** Definidos `APPROVED_PUBLIC_ENTRY_PATHS`, `CANONICAL_PUBLIC_ENTRY_ROUTE_METADATA`, `PublicEntryRouteDescriptor`, `PublicEntryRouteGuard` y `PUBLIC_HOME_ANCHORS`.
- **Canonicalización pura (`apps/web/src/app/navigation/return-url.canonicalizer.ts`):** Implementado `canonicalizeInternalReturnUrl()` puro que sólo permite destinos internos autorizables (`/`, `/mi-cuenta`, `/mis-eventos`) y rechaza externos, protocol-relative, esquemas, codificaciones peligrosas, traversal, `/api`, media/assets, `/g/:lookupKey`, `/admin` y ciclos de autenticación (`/ingresar`, `/solicitar-acceso`) con fallback `/`.
- **Infraestructura Router y 404 neutro (`public-entry-router.service.ts`, `public-not-found.component.ts`):** Implementados `PublicEntryRouterService`, `PublicEntryRouterOutletComponent`, `providePublicEntryRouter` (con redacción de `:lookupKey` en `safePathname` y gestión de foco `h1`/`h2`) y `PublicNotFoundComponent` (`ErrorState/404` neutro con «Volver al inicio»), sin modificar `main.ts` ni `AppComponent`.
- **Pruebas:** `apps/web/src/app/navigation/public-entry-router.spec.ts` (6 tests en harness Angular exclusivo de pruebas, PASS) y `pnpm --filter @eventlens/web build` sin incluir el harness en el bundle productivo.
