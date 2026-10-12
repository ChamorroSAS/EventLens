# EL-TK-048 — Navegar por la configuración de un evento propio

## Parent epic

EL-EP-002

## Status

DONE

## User story

**Como** organizador propietario, **quiero** navegar por las secciones de configuración de mi evento, **para** completar su preparación y volver al dashboard con su contexto.

## Alcance funcional

Superficie frontend compartida mediante OrganizerAppShell, OrganizerDashboard/EventList/EventCard y EventSettingsNav existentes: entrar, identificar evento/estado, navegar secciones y volver. Consume047 por cliente OpenAPI. Sin crear componentes/páginas alternativas ni librerías/CSS/iconos; no implementa cada mutación ni concede permisos.

## Criterios de aceptación

**Dado** consulta autorizada, **cuando** selecciona evento/sección o vuelve al dashboard, **entonces** mantiene contexto/encabezado, identifica sección activa y salida explícita; formularios020..025/027..031 integran esta superficie. Acciones/read-only provienen del servidor, no del estado/color del cliente.

**Dado** loading, cero eventos, error o sesión/permiso perdido, **cuando** entra, **entonces** presenta respectivamente ocupado sin falso vacío, vacío con crear autorizado, error con retry vigente o acceso restringido sin datos ajenos. Volver/cancelar no ejecuta mutaciones.

**Dado** móvil/tablet/desktop o teclado/lector, **cuando** navega, **entonces** orden vertical móvil sin scroll horizontal, navegación accesible en pantallas mayores, nombres/labels/headings semánticos, foco visible estable y anuncios significativos identifican sección/resultado sin depender de color.

## Datos / contratos afectados

Handoff UI002, contrato común y catálogo ui-components; EventConfigurationPolicy y OpenAPI→cliente generado→Angular, sin DTO Nest/Prisma.

## Pruebas requeridas

Vitest componentes loading/empty/error/retry/read-only/keyboard/focus/anuncios; Playwright dashboard→evento→secciones→preview privado/volver y sesión expirada/denegación; responsive y contraste final.

## Dependencias técnicas y funcionales

Handoff EL-EP-002/contrato común ui-mvp-epic-review y catálogo ui-components; domain-map/api-conventions y cliente Angular OpenAPI, EL-TD-001..007.

## Dependencias de tickets

- **depends_on:** EL-TK-047.
- **blocks:** ninguno.
- **can_parallelize_with:** configuración/consulta independiente sobre contratos acordados; se respetan predecesoras y conflictos serializados.

## Observabilidad / auditoría

Actor/resource/operationId/revisión/resultado pertinentes sin PIN, contenido, firmas o secretos.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-002-02/03; EL-EP-002; handoff UI002; EL-TD-001..007.

## Definition of Ready

- [x] Comportamiento/criterios delimitados por contratos aprobados
- [x] Dependencias, permisos y errores identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.

## Evidencia de implementación y verificación — 2026-10-12

- **Componentes (`apps/web/src/app/organizer/`):**
  - `OrganizerAppShellComponent`: shell autenticado con header accesible, marca EventLens, indicador de contexto del evento activo con badge de estado y botón de salida rápida.
  - `EventCardComponent`: tarjeta semántica para visualización de fecha, timezone, estado de uploads y PIN, y acción "Configurar evento".
  - `EventListComponent`: grilla responsiva con orden vertical en móvil y adaptación flexible para desktop sin scroll horizontal per WCAG 2.2 AA.
  - `EventSettingsNavComponent`: barra de navegación con tabs accesibles (`role="tablist"`), botón "Volver a mis eventos" y selección de secciones contextuales (`general`, `schedule`, `access`, `guest`, `lifecycle`, `capacity`).
  - `OrganizerDashboardComponent`: contenedor principal que integra consumo de `OrganizerService` (EL-TK-047), gestión de estados (`isLoading`, `errorMessage` con retry, `EMPTY_EVENTS` con crear autorizado, lista de eventos y workspace de configuración del evento seleccionado).
- **Pruebas unitarias (`apps/web/src/app/organizer/organizer-dashboard.component.spec.ts`):** 5/5 pruebas unitarias PASS verificando renderizado de cards, estado vacío accesible, recuperación ante error con retry, selección de evento con carga de configuración autorizada y navegación entre secciones, y reseteo sin mutaciones al volver al dashboard.
- **Suite completa y compilación:** 66/66 pruebas PASS en `@eventlens/web`, `ngc --noEmit` exit code 0, y `ng build` exit code 0 con bundle de 104.72 kB.

