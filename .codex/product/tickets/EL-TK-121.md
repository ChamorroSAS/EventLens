# EL-TK-121 — Integrar reporte y retiro en la experiencia pública/guest

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** invitado o reportante, **quiero** reportar o retirar mediante los flujos apropiados, **para** completar la acción desde móvil con consecuencias claras.

## Alcance funcional
Integrar ReportContentDialog y RemovalRequestFlow para reporte, retiro propio irreversible e intake sin sesión, reutilizando componentes/copy del handoff.

## Fuera de alcance
Seguimiento público, recuperación de token, UI admin o inventar texto jurídico definitivo.

## Criterios de aceptación
### Escenario 1
**Dado** invitado reporta desde media visible, **cuando** envía, **entonces** ve 'Reporte recibido' y no 'Contenido eliminado'.

### Escenario 2
**Dado** uploader retira aporte propio, **cuando** confirma, **entonces** ve consecuencia irreversible antes del comando y estado posterior.

### Escenario 3
**Dado** persona sin sesión abre intake, **cuando** completa DEC-103..105, **entonces** recibe confirmación de revisión sin asumir titularidad.

## Reglas de negocio
Estados de recepción y resolución son distintos. Inputs se preservan ante error/retry cuando sea seguro.

## Validaciones y permisos
Capacidades del servidor determinan variante; declaración nunca preseleccionada.

## Casos de error y estados vacíos
Offline, rate limit, timeout desconocido, sesión vence, ya retirado y validaciones DEC-103..105.

## Datos / contratos afectados
Clientes de EL-TK-113..115; ReportContentAction/Dialog, RemovalRequestFlow.

## Dependencias técnicas y funcionales
Handoff UI EL-EP-009.

## Dependencias de tickets
- **depends_on:** EL-TK-099, EL-TK-113, EL-TK-114, EL-TK-115
- **blocks:** EL-TK-123

## Pruebas requeridas
Component/unit/E2E móvil, foco, validaciones, retry, sesión vencida y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin telemetría invasiva de motivos/descripciones sensibles.

## Prioridad / estimación
P0 / M

## Traceability
DEC-084, DEC-089, DEC-097, DEC-103..105; EL-EP-009; ui-mvp-epic-review.md#el-ep-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Componente `ReportContentDialogComponent` en `apps/web/src/app/gallery/report-content-dialog.component.ts`: catálogo canónico de motivos (`DEC-084`), validación contextual (descripción obligatoria solo si motivo es `OTHER`), neutralidad en feedback de confirmación ("Reporte recibido para revisión" sin afirmar "Contenido eliminado" per `DEC-088`), prevención de doble envío y accesibilidad WCAG 2.2 AA (foco, escape, live regions).
  - Componente `RemovalRequestFlowComponent` en `apps/web/src/app/guest/removal-request-flow.component.ts`:
    - Flujo `OWN_REMOVAL`: confirmación explícita con advertencia de irreversibilidad antes del comando ("Se retirará de visibilidad al confirmar. No podrás restaurarlo. EventLens no ofrece papelera de organizador...") conectada a `GuestService.removeOwnContribution`.
    - Flujo `GUEST_INTAKE` (sin sesión): formulario apilado conforme a `DEC-103..105`, referencias obligatorias a evento y media, catálogo de motivos con descripción obligatoria si `OTHER`, correo de contacto sintáctico sin asumir titularidad ni sesión, declaración de buena fe obligatoria NUNCA preseleccionada, feedback neutral "Solicitud recibida para revisión".
  - Integración en `GalleryComponent` y `GuestContainerComponent` en `apps/web`.
- **Criterios de aceptación verificados:**
  - Escenario 1: Invitado reporta desde la galería, ve confirmación neutral "Reporte recibido para revisión" y nunca "Contenido eliminado".
  - Escenario 2: Uploader con sesión activa retira aporte propio, visualiza advertencia de consecuencia irreversible antes del envío y feedback de retiro completado.
  - Escenario 3: Persona sin sesión completa intake con campos `DEC-103..105`, declaración no preseleccionada y recibe confirmación sin recuperar sesión ni asumir titularidad.
- **Pruebas:** 15 pruebas unitarias passing: 6 en `report-content-dialog.component.spec.ts` y 9 en `removal-request-flow.component.spec.ts`. Suite completa web (18 archivos, 101 tests) pasando sin regresiones. Typecheck Angular limpio.
