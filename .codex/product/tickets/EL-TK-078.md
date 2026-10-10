# EL-TK-078 — Consultar Mis aportes mediante la sesión guest

## Parent epic
EL-EP-004

## Status
READY

## User story
**Como** invitado con sesión vigente, **quiero** consultar únicamente mis propios aportes, **para** revisar lo que envié sin acceder al contenido de otras personas.

## Alcance funcional
Listar referencias y estados autorizados de aportes pertenecientes a la sesión guest, incluso cuando la galería esté apagada o el evento esté CLOSED/GRACE_PERIOD según DEC-084.

## Fuera de alcance
Descarga guest, galería general, recuperación automática de sesión o resolución de solicitudes de retiro.

## Criterios de aceptación
### Escenario 1
**Dado** una sesión guest válida, **cuando** consulta Mis aportes, **entonces** recibe solo media asociada a esa sesión.

### Escenario 2
**Dado** galería apagada o evento CLOSED/GRACE_PERIOD, **cuando** consulta Mis aportes, **entonces** la consulta continúa disponible si la sesión sigue autorizada.

### Escenario 3
**Dado** una sesión ausente o revocada, **cuando** intenta consultar, **entonces** no obtiene datos ni recupera automáticamente el token.

## Reglas de negocio
La excepción de Mis aportes no habilita galería general ni nuevas cargas.

## Validaciones y permisos
Aislamiento estricto por GuestSession; lifecycle conforme DEC-084.

## Casos de error y estados vacíos
Lista vacía, sesión revocada, evento eliminado y media retirada.

## Datos / contratos afectados
GuestContributionSummary, media ownership por sessionId.

## Dependencias técnicas y funcionales
GuestSession, GuestIdentity y policy lifecycle.

## Dependencias de tickets
- **depends_on:** EL-TK-075, EL-TK-077, EL-TK-072.
- **blocks:** EL-TK-082, EL-TK-083 y flujo propio de retiro EL-EP-009.

## Pruebas requeridas
Aislamiento entre sesiones, CLOSED/GRACE, galería off, lista vacía y sesión revocada.

## Observabilidad / auditoría
Lectura normal sin exponer identificadores de otros invitados.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-014; DEC-013, DEC-041, DEC-084; EL-EP-004, EL-EP-003.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la consulta aislada de Mis aportes por sessionId, consumido por MyContributionsList y MyContributionItem conforme al handoff UI/UX de EL-EP-004, preservando la excepción de DEC-084 en CLOSED/GRACE_PERIOD o galería inactiva.
