# EL-TK-083 — Integrar la experiencia guest de acceso, consentimiento y Mis aportes

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** invitado, **quiero** completar el flujo de entrada, consentimiento, identificación y consulta de mis aportes desde móvil, **para** participar sin crear una cuenta.

## Alcance funcional
Integrar EventGuestPageShell, PinAccessForm, ConsentSheet, GuestIdentityForm, MyContributionsList y superficies de compartir/revocación usando contratos del servidor.

## Fuera de alcance
Implementar uploads de EL-EP-005, galería de EL-EP-007 o resolución de retiros EL-EP-009.

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
- **depends_on:** EL-TK-074, EL-TK-075, EL-TK-076, EL-TK-077, EL-TK-078, EL-TK-079, EL-TK-080, EL-TK-081, EL-TK-082.
- **blocks:** integración UI de EL-EP-005 y EL-EP-007 según sus propios tickets.

## Pruebas requeridas
Component/unit, E2E móvil, teclado/foco, accesibilidad WCAG 2.2 AA y estados de revocación.

## Observabilidad / auditoría
Sin auditoría adicional de render; acciones usan auditoría del comando propietario.

## Prioridad
P0

## Estimación
M

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
