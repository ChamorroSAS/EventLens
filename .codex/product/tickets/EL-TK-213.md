# EL-TK-213 — Componer el Home público y cabecera sensible a capacidades

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** visitante u organizador, **quiero** una portada clara con acciones coherentes con mi sesión, **para** comprender EventLens y llegar a las capacidades autorizadas.

## Alcance funcional
Implementar PublicHomePage, AppHeader.public y LegalFooter minimal; hero/beneficios/cuatro pasos/privacidad/FAQ exactas/cierre/anclas y marca/foundation según handoff. Cabecera205: anónimo login/Beta; ordinario sustituye acceso/login por Mis eventos/Mi cuenta/logout; restringido sólo acciones de cuenta Mi cuenta/logout, sin Mis eventos. CTA editorial Beta y anclas públicas siguen en hero/cierre; unknown/unavailable no filtra identidad o navegación privada.

Activar aquí main.ts/AppComponent con provideRouter/RouterOutlet y appRoutes completo, ensamblando Home/404206 y descriptores/componentes reales207..211 entregados. Sustituir health de raíz por producto sin eliminar endpoints de health internos. No importar pantallas inexistentes ni publicar stubs.206 entrega infraestructura, no activación productiva. Normativos public-entry-contract.md/ui-public-entry.md; pruebas Home/rutas reales, fallback servidor final212/214.

## Fuera de alcance
No crea autenticación, dashboard, perfil, formulario propio, directorio, tema por evento, fotos no autorizadas ni enlaces legales sin destino aprobado.

## Criterios de aceptación
### Contenido público
**Dado** que el API está caído, **cuando** carga `/`, **entonces** el contenido estático completo sigue usable y las acciones dependientes muestran retry neutro.

### Navegación por capacidad
**Dado** una sesión ordinaria o restringida, **cuando** se renderiza la cabecera, **entonces** muestra únicamente las acciones autorizadas y Home no redirige.

### Móvil accesible
**Dado** el menú compacto, **cuando** se abre, se cierra con Escape o se elige un ancla, **entonces** conserva foco, `aria-expanded`, orden semántico y foco al h2 correspondiente.

## Validaciones y permisos
UI no reemplaza guards ni políticas servidor. Logo y Manrope siguen EL-TK-203/204; footer omite enlaces legales sin documento/destino válido.

## Dependencias de tickets
- **depends_on:** EL-TK-204, EL-TK-205, EL-TK-206, EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210, EL-TK-211.
- **blocks:** EL-TK-214.
- **can_parallelize_with:** EL-TK-212 después de predecesoras propias; nunca con211 antes de su descriptor real.

## Pruebas requeridas
Vitest de composición/variantes y estados; Playwright de Home sin redirect, menú/foco/anclas, 320–1440 CSS px, zoom/reflow, teclado, lector manual y CTA/rutas reales.

## Prioridad / estimación
P1 / L

## Riesgos / notas
Copy UX no aprueba claims jurídicos. Fotografías no son prerrequisito ni se sustituyen por stock no autorizado.

## Traceability
EL-EP-018; `ui-public-entry.md`; `public-entry-contract.md`; CR-004; EL-TK-203/204.

## Definition of Ready
- [x] Composición, variantes y copy definidos
- [x] Criterios, a11y y límites comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
