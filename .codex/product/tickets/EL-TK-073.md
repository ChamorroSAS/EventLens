# EL-TK-073 — Integrar el lifecycle en la interfaz de organizador e invitado

## Parent epic
EL-EP-003

## Status
READY

## User story
**Como** usuario autorizado, **quiero** ver el estado y las acciones vigentes del evento, **para** comprender apertura, cierre, vencimiento y restricciones sin inferirlas localmente.

## Alcance funcional
Integrar EventLifecyclePanel, EventStatusBadge, EventAccessStatus, acciones y diálogos existentes usando LifecycleSnapshot/capabilities del servidor.

## Fuera de alcance
Crear componentes paralelos, implementar acciones de EL-EP-010/011/015 o lógica temporal en frontend.

## Criterios de aceptación
### Escenario 1
**Dado** un organizador, **cuando** abre el detalle, **entonces** ve estado, inicio/TZ/vencimiento/gracia y únicamente acciones autorizadas.

### Escenario 2
**Dado** un invitado, **cuando** el evento todavía no inicia o ya no admite participación, **entonces** recibe feedback autorizado y accesible sin habilitar carga por error.

### Escenario 3
**Dado** una transición automática mientras la vista está abierta, **cuando** se refresca el snapshot, **entonces** la UI actualiza estado/acciones sin robar foco ni anunciar cada segundo.

## Reglas de negocio
Frontend no calcula permisos ni inventa estado EXPIRED. Contadores son informativos; fechas/TZ textuales son autoridad visible.

## Validaciones y permisos
Usar capacidades del servidor; acciones sensibles conservan el gate de su épica propietaria.

## Casos de error y estados vacíos
Loading, conflicto, permiso perdido, estado terminal y error de actualización mantienen copy comprensible y foco estable.

## Datos / contratos afectados
Cliente OpenAPI de LifecycleSnapshot/capabilities.

## Dependencias técnicas y funcionales
Handoff UI/UX aprobado de EL-EP-003; componentes existentes del catálogo.

## Dependencias de tickets
- **depends_on:** EL-TK-071, EL-TK-072.
- **blocks:** integración UX de consumidores posteriores de lifecycle.

## Pruebas requeridas
Component/unit de estados, E2E de acciones autorizadas, responsive, teclado, foco y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin auditoría adicional de render; acciones usan auditoría del comando propietario.

## Prioridad / estimación
P0 / M

## Traceability
Q-015; DEC-017, DEC-084; EL-EP-003; handoff ui-mvp-epic-review.md#el-ep-003.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Integración UI/UX y Readiness — 2026-10-10

**CONFIRMED — handoff UI/UX de EL-EP-003:** Hereda la especificación documental de [ui-capacity-lifecycle.md](../../context/ui-capacity-lifecycle.md#el-ep-003--vigencia-y-reactivación), la reevaluación en [ui-mvp-epic-review.md](../../context/ui-mvp-epic-review.md#el-ep-003), su contrato común de interacción y EL-TD-001..007 sin seleccionar librerías/CSS/iconos propietarios.

### Componentes reutilizados del catálogo
- `CROSS_CUTTING_PRODUCT_COMPONENT`: `EventLifecyclePanel`, `EventStatusBadge`, `EventAccessStatus`.
- `PRODUCT_COMPONENT`: `EventLifecycleAction`, `EventCloseDialog`, `EventScheduleForm`, `EventGracePeriodBanner`, `SuspendEventDialog`, `ReactivateEventDialog`.
- `CROSS_CUTTING_PRODUCT_COMPONENT` reutilizado: `AdministrativeActionReason`.
- `GENERIC_UI`: `Button`, `Modal`, `ConfirmDialog`, `InlineMessage`, `LoadingState`, `ErrorState`, `Badge`.
- No introduce componentes nuevos ni tokens adicionales.

### Flujo e interacción verificable
- **Detalle de evento (Organizador):** `EventLifecyclePanel` presenta jerarquía: nombre → estado → inicio → vencimiento → fin de gracia aplicable → acción autorizada → explicación. DRAFT sin programar muestra «Sin programar». Fechas, horas y TZ se muestran de forma textual completa junto a contadores informativos.
- **Acciones y diálogos de organizador:**
  - `DRAFT`: Programar mediante `EventScheduleForm`.
  - `SCHEDULED`: Acción «Activar ahora» con advertencia de que la activación anticipada conserva el vencimiento anclado a la fecha programada.
  - `ACTIVE`: Acción «Cerrar evento» mediante `EventCloseDialog`, advirtiendo que cerrar no pausa la vigencia ni el periodo de gracia.
  - `CLOSED`: Acción «Reabrir evento» antes de vencer.
  - `GRACE_PERIOD`: `EventGracePeriodBanner` informa el fin de gracia y acceso autorizado a descargas; extensión delega al flujo de EL-EP-011.
  - `SUSPENDED` / `PENDING_DELETION` / `DELETED`: Muestra estado vigente y explicaciones autorizadas sin ofrecer acciones no permitidas. DELETED nunca habilita reapertura ni reactivación.
- **Superficie de invitado:** `EventAccessStatus` presenta copy contractual aprobado:
  - SCHEDULED: «El evento aún no inicia» y fecha/hora de inicio en TZ del evento.
  - CLOSED: «Las cargas están cerradas».
  - GRACE_PERIOD: «La vigencia del evento terminó».
  - SUSPENDED: Muestra disponibilidad autorizada sin filtrar motivos ni detalles de investigación administrativa.
  - Preserva acceso autorizado a *Mis aportes* y solicitud de retiro propio con sesión válida conforme a DEC-084.

### Accesibilidad (WCAG 2.2 AA) y Responsive
- Mobile-first: fechas y acciones apiladas verticalmente con touch targets amplios; tablet y escritorio agrupan métricas y acciones sin scroll horizontal ni alteración del orden semántico de lectura.
- Foco visible y navegación completa por teclado. Los diálogos modales (`EventCloseDialog`, etc.) contienen y devuelven el foco.
- Los temporizadores informativos y transiciones automáticas en segundo plano NO roban foco ni emiten anuncios continuos en cada segundo a lectores de pantalla (anuncian únicamente cambios de estado significativos).
- El estado y la temporalidad se comunican con texto explícito y badges semánticos, nunca exclusivamente mediante color.

### API y validación de riesgo
- Cliente TypeScript generado a partir de OpenAPI para Angular; no acoplar DTOs internos Nest ni modelos Prisma.
- Pruebas unitarias de componentes (Vitest) para cada estado visual, precondición de botón y renderizado accesible.
- Pruebas E2E (Playwright) para el flujo de transiciones autorizadas, refresco de estado y manejo de conflictos concurrentes.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el alcance UI propio de lifecycle en organizador e invitado.
