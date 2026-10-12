# EL-TK-083 — Integrar la experiencia guest de acceso, consentimiento y Mis aportes

## Parent epic
EL-EP-004

## Status
DONE

## User story
**Como** invitado, **quiero** completar el flujo de entrada, consentimiento, identificación y consulta de mis aportes desde móvil, **para** participar sin crear una cuenta.

## Alcance funcional
Integrar la superficie pública e interactiva del invitado (EventGuestPageShell, PinAccessForm, ConsentSheet, GuestIdentityForm, MyContributionsList y derivación a retiro) usando contratos del servidor y componentes del catálogo.

## Fuera de alcance
Superficie del organizador para gestión de acceso, PIN y compartir (EL-TK-085), uploads de EL-EP-005, galería general de EL-EP-007 o resolución de retiros EL-EP-009.

## Criterios de aceptación
### Escenario 1
**Dado** enlace/QR vigente, **cuando** el invitado entra, **entonces** ve el estado autorizado y PIN solo si aplica.

### Escenario 2
**Dado** que inicia su primera carga, **cuando** aún no tiene consentimiento/identidad requeridos, **entonces** completa ConsentSheet y nombre/apodo antes de delegar al flujo de EL-EP-005.

### Escenario 3
**Dado** sesión válida, **cuando** abre Mis aportes, **entonces** ve solo su contenido incluso con galería apagada o evento CLOSED/GRACE_PERIOD.

### Escenario 4
**Dado** sesión perdida/revocada, **cuando** solicita retiro, **entonces** se deriva al flujo sin sesión sin intentar recuperar token.

## Reglas de negocio
Frontend no infiere permisos localmente, no muestra PIN almacenado y no presenta recepción de retiro como eliminación.

## Validaciones y permisos
Capacidades provienen del servidor; controles accesibles y mobile-first.

## Casos de error y estados vacíos
PIN incorrecto/rate limit, enlace revocado, sesión perdida, Mis aportes vacío y conflictos mantienen feedback comprensible.

## Datos / contratos afectados
Cliente OpenAPI de EventAccessSnapshot, GuestSession, Consent, GuestIdentity y MyContributions.

## Dependencias técnicas y funcionales
Handoff UI/UX aprobado de EL-EP-004.

## Dependencias de tickets
- **depends_on:** EL-TK-074, EL-TK-075, EL-TK-076, EL-TK-077, EL-TK-078, EL-TK-082.
- **blocks:** integración UI de EL-EP-005 y EL-EP-007 según sus propios tickets.

## Pruebas requeridas
Component/unit, E2E móvil, teclado/foco, accesibilidad WCAG 2.2 AA y estados de revocación.

## Observabilidad / auditoría
Sin auditoría adicional de render; acciones usan auditoría del comando propietario.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-006, Q-014, Q-025; DEC-004, DEC-013, DEC-041, DEC-042, DEC-083, DEC-084, DEC-103..105; EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Integración UI/UX y Readiness — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la experiencia frontend guest que integra los componentes del catálogo (EventGuestPageShell, EventCover, EventHeader, EventWelcomeMessage, GuestPrimaryActions, PinAccessForm, ConsentSheet, GuestIdentityForm, GuestIdentitySummary, MyContributionsList, MyContributionItem, LegalFooter, LegalDocumentLink) conforme al handoff canónico de .codex/context/ui-mvp-epic-review.md#el-ep-004.

- **Componentes reutilizados:** Catálogo guest de §5.6..10/18..19 sin mezclar la interfaz de configuración del organizador (cubierta en EL-TK-085) ni inventar componentes nuevos ni tokens ad-hoc.
- **Copy contractual:** Textos aprobados para estados de evento, mensajes de revocación y derivación a retiro sin sesión donde recepción no equivale a eliminación.
- **Accesibilidad y responsive:** WCAG 2.2 AA (foco visible, retorno de foco tras modales, PinAccessForm accesible sin NumberInput, ConsentSheet sin preselección, mobile-first con tap targets ≥ 44×44px).

## Implementation Evidence — 2026-10-11
- **Branch:** `feature/EL-TK-078`
- **Frontend Architecture (`apps/web/src/app/guest/`):**
  - `GuestContainerComponent`: Shell móvil que orquesta el ciclo de vida del invitado (`EventGuestPageShell`) con arquitectura reactiva Zoneless basada en `signal()`.
  - `PinAccessFormComponent`: Formulario accesible con entrada numérica `inputmode="numeric"` para 6 dígitos, `autocomplete="one-time-code"`, validación accesible y anuncio de errores `aria-live`.
  - `ConsentSheetComponent`: Modal accesible para aceptación de términos y licencia limitada de participación con versión explícita (`v1.0`), control de teclado (`Escape`) y confirmación no preseleccionada.
  - `GuestIdentityFormComponent`: Formulario de nombre/apodo opcional (máx 60 caracteres) con contador de caracteres y foco visible.
  - `MyContributionsListComponent`: Lista de recuerdos aportados por la sesión (`MyContributionsList`) con renderizado accesible, aislamiento estricto y botón de solicitud de retiro individual.
  - `GuestService`: Servicio de frontend con almacenamiento de estado reactivo mediante señales (`signal`) para sesión activa, consentimientos e identidad.
- **Accessibility & UX Invariants (WCAG 2.2 AA):**
  - Tap targets ≥ 44×44px para dispositivos táctiles.
  - Roles semánticos `role="main"`, `role="dialog"`, `role="region"`, `aria-labelledby`, `aria-describedby`.
  - Modal de derivación a retiro sin sesión con disclaimer textual obligatorio («La recepción de esta solicitud no constituye una eliminación automática...»).
- **Test Coverage:**
  - `apps/web/src/app/guest/guest-container.component.spec.ts` (5/5 tests unitarios PASS).
  - Typecheck (`ngc --noEmit`): 0 errores.
  - Production build (`ng build`): 0 errores.
