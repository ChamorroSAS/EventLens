# EL-TK-204 — Incorporar foundation visual y piloto aislado del shell de organizador

## Parent epic

EL-EP-002 (extensión transversal de CR-004; el DONE histórico del alcance original se conserva).

## Status

READY

## User story

**Como** organizador, **quiero** que el shell existente identifique la plataforma, mi rol y el contexto activo mediante la identidad visual aprobada, **para** orientarme sin cambiar las funciones, navegación ni contenido proyectado.

## Alcance funcional

Autoalojar Manrope en `apps/web/public/assets/fonts/manrope/` con pesos reales 400/500/600/700 o variable que los cubra, `font-display: swap`, licencia de redistribución, procedencia, versión o commit disponible y hashes. Incorporar sólo `apps/web/src/styles/ui-foundation.css`, registrado en los styles Angular, con `@font-face` y custom properties `--el-ui-*` inertes en `:root`, alias de roles UI vigentes.

Aplicar el piloto exclusivamente a nodos propios del `OrganizerAppShellComponent` existente: identidad, rol, contexto opcional, control Mis eventos y footer. Usa el handoff UI adoptado para pesos, medidas, responsive, foco, contraste y fallback de wordmark; preserva inputs/outputs `selectedEvent`/`exitContext`, `onExitContext`, proyección, semántica y badge hijo.

## Fuera de alcance

Routing, root, auth, API, adapters, páginas o componentes nuevos, biblioteca CSS/UI/iconos, reset o utilities globales, recolor o migración masiva de admin/guest/dashboard, cambio de encapsulación, `::ng-deep`, cambio de permisos o nueva navegación. No convierte el harness de pruebas en una ruta o bundle productivo.

## Criterios de aceptación

### Fuente y foundation

**Dado** los archivos de Manrope candidatos, **cuando** se añaden al runtime, **entonces** se acredita licencia, procedencia, versión o commit, hashes y cobertura real de 400/500/600/700; la familia declarada es `Manrope, system-ui, sans-serif`, no requiere proveedor remoto y conserva los pesos/roles definidos en `ui-design-system.md`.

**Dado** que falta licencia, procedencia o un peso real, **cuando** se valida la fuente, **entonces** ese archivo no se incorpora ni el ticket se certifica DONE; se obtiene una distribución válida de Manrope sin sustituir la tipografía.

**Dado** fallo forzado de la carga de Manrope, **cuando** se renderiza el piloto, **entonces** usa sólo `system-ui, sans-serif` como fallback técnico y mantiene contenido legible y espacio estable.

### Piloto y aislamiento

**Dado** `OrganizerAppShellComponent` con y sin `selectedEvent`, incluido `null` o `undefined`, **cuando** se renderiza, **entonces** conserva identidad/rol, contexto opcional, proyección, footer, nombre accesible y las emisiones únicas de `exitContext`; no añade navegación ni muta el evento.

**Dado** un evento con nombre corto, multilínea o cadena larga sin espacios, **cuando** se prueba a 320, 375, 768, 1024 y 1440 CSS px y zoom 200 % o reflow equivalente a 400 %, **entonces** el nombre completo permanece accesible sin scroll horizontal ni elipsis como único acceso, y el control Mis eventos puede pasar a nueva fila con objetivo mínimo de 44 × 44 CSS px.

**Dado** contenido proyectado y el badge hijo existente, **cuando** se aplican los estilos del piloto, **entonces** sus estilos efectivos de familia, color y fondos compartidos permanecen sin cambio; no se aplican familia, color, fondo o surface al host, raíz, `main` ni contenedor de proyección, y surface sólo afecta nodos propios.

**Dado** teclado o lector de pantalla, **cuando** se opera Mis eventos y la salida de contexto, **entonces** Enter/Espacio, foco visible de 2 CSS px con offset 2 CSS px, orden semántico y nombre accesible funcionan sin ocultar foco; contraste alcanza 4.5:1 para texto normal, 3:1 para texto grande y contraste no textual pertinente.

**Dado** carga o fallo del wordmark runtime, **cuando** se muestra el h1 existente, **entonces** EventLens se identifica una vez con texto visible de respaldo, sin icono roto, spinner, toast ni retry; el ensayo de 160 CSS px no se trata como mínimo oficial y respeta el resultado de EL-TK-203.

### Harness de validación

**Dado** las pruebas de interfaz, **cuando** se ejecutan Vitest y Playwright, **entonces** montan el componente Angular real y la foundation productiva desde un harness marcado exclusivamente de test, sin ruta, root, autenticación, API, adaptador ni HTML imitativo de producto; el harness queda excluido del entrypoint y bundle productivo.

## Reglas de negocio

Manrope y sus pesos vigentes se mantienen; los trazados vectoriales del logo no dependen de la fuente UI. Roles semánticos UI continúan separados de identidad corporativa y de personalizaciones de evento. Los errores, cargas, vacíos y permisos siguen siendo responsabilidad del contenido funcional proyectado.

## Validaciones y permisos

El shell conserva sus precondiciones de integración y no autentica ni concede capacidades por apariencia. Harness sólo fixtures de prueba, no sesiones/adapters ficticios de producto. Validar procedencia/licencia/pesos antes de distribuir fuentes; no consultar ni almacenar datos privados de eventos para pruebas visuales.

## Errores y estados

Sin evento/null/undefined: omitir sólo región contextual, preservando identidad/proyección/footer. Fuente o imagen cargando/fallida: fallback técnico y marca textual respectivamente, sin nuevo estado de dominio. Licencia/peso inválido, cascada a hijos, contraste/reflow fallido o harness publicado impiden cierre DONE. Los estados loading/error/empty/denied de features proyectadas no se sustituyen ni reinterpretan.

## Datos / contratos afectados

Contrato local de CR-004 y handoff `ui-brand-foundation.md`. No modifica API/OpenAPI, Nest, Prisma, sesiones, grants, persistencia, consentimiento, campos, formularios, permisos, contratos de evento ni estrategia global CSS/UI/iconos, que permanece DEFERRED.

## Dependencias técnicas y funcionales

`ui-design-system.md`; `brand-integration-contract.md`; `ui-brand-foundation.md`; catálogo `ui-components.md`; baseline EL-TD-001/005/006/007. EL-TK-048 aporta el `OrganizerAppShellComponent` existente que este ticket reutiliza.

## Dependencias de tickets

- **depends_on:** EL-TK-203, EL-TK-048.
- **blocks:** ninguno.
- **can_parallelize_with:** ninguno antes de EL-TK-203; después, sólo trabajo que no cambie las hojas propias del shell ni la foundation del ticket.

## Pruebas requeridas

Vitest del componente real para entradas/salidas, `exitContext`, contexto ausente/presente, proyección, fallback de fuente y logo. Playwright con harness test-only para foco, teclado, contraste, responsive/reflow, nombres largos, aislamiento del badge/proyección y exclusión del bundle productivo. Verificar carga efectiva de fuentes/pesos, paths, licencia, hashes, typecheck y build pertinente. No declarar pruebas de auth, routing, API, Beta o dispositivos no usados.

## Observabilidad / auditoría

Evidencia de licencia, procedencia, versión/commit, hashes, pesos disponibles y resultados de validación visual. No aplica auditoría de dominio ni registro de contenido del evento.

## Prioridad / estimación

RECOMMENDED P1 — integración visual / M

## Riesgos / notas

Riesgos: licencia o peso no demostrable, cascada CSS hacia contenido proyectado, regresión de foco/contraste/reflow, fuente duplicada o harness incluido por error en producción. Las pruebas visuales no certifican el estado funcional de EL-TK-048 ni de otros tickets.

## Traceability

CR-004 decisiones 3, 5, 6 y 7; manual canónico secciones 4 a 7; `ui-design-system.md`; `brand-integration-contract.md`; `ui-brand-foundation.md`; Gate 1 APPROVED; gate técnico APPROVED; UI `READY_FOR_FRONTEND_PLANNING: YES`.

## Definition of Ready

- [x] Alcance de foundation y piloto delimitado
- [x] Criterios verificables, aislamiento y errores definidos
- [x] Dependencias técnicas y de tickets identificadas
- [x] Sin permisos o preguntas funcionales BLOCKER nuevas
- [x] Gate 2 de requirements_reviewer aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. READY_FOR_FRONTEND_PLANNING: YES. TECHNICAL_GATE: APPROVED. READY_FOR_IMPLEMENTATION: NO. EXECUTION_READY: NO hasta ejecutar y validar EL-TK-203. IMPLEMENTED: NO.

Gate2 APPROVED y ratificación técnica APPROVED, 2026-10-12, sin hallazgos accionables; [dictámenes](../sessions/2026-10-12-brand-planning-gates.md). READY expresa requisitos/contratos completos; NO de implementación se refiere exclusivamente a la predecesora203, no a preguntas de producto, arquitectura o UI. Tras validar203 puede iniciarse sin nuevo gate de producto salvo cambio material de alcance. DRAFT anterior queda histórico; no declara implementación, pruebas ejecutadas ni DONE.
