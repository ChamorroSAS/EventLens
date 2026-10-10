# EL-TK-121 — Integrar reporte y retiro en la experiencia pública/guest

## Parent epic
EL-EP-009

## Status
READY

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
