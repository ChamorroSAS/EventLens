# Convenciones de identificadores — EventLens

**CONFIRMED — 2026-10-07:** convención solicitada por el usuario y aplicada por backlog_manager.

## Identificadores canónicos

- épicas: `EL-EP-{NNN}`, con tres dígitos; archivo `epics/EL-EP-{NNN}.md`.
- Tickets: `EL-TK-{NNN}`, con tres dígitos; archivo `tickets/EL-TK-{NNN}.md`.
- La numeración existente se conserva exactamente; el prefijo identifica el mismo artefacto, no uno nuevo.
- Nunca reutilizar un ID ni su número dentro de su serie, incluidos artefactos SUPERSEDED, DEPRECATED, CANCELLED e históricos.
- **CONFIRMED — 2026-10-08:** EL-TK-001..046 están ocupados; EL-TK-043..046 fueron asignados para la remediación aprobada de EL-EP-001.
- **CONFIRMED — 2026-10-08, remediación EL-EP-002:** EL-TK-047..052 asignados a consulta/navegación y reemplazos de portada; serie ocupada EL-TK-001..052. EL-TK-026 permanece SUPERSEDED histórico por 049..052, nunca se reutiliza.
- **CONFIRMED — 2026-10-08, remediación EL-EP-006:** EL-TK-053..058 asignados únicamente a estado API, integración UI, lease JobQueue, ejecutor aislado, cleanup media y validación integrada. Serie ocupada EL-TK-001..058; ningún ID histórico reutilizado.
- **CONFIRMED — 2026-10-08, paquete TB-01..05:** EL-TK-059 entorno mínimo TB-04,060 spike TB-02,061 spike TB-01. Serie ocupada EL-TK-001..061; sólo tres nuevos, sin auth duplicada ni ticket TB-05.
- **CONFIRMED — 2026-10-10, EL-EP-003:** EL-TK-062..073 asignados a lifecycle temporal, transiciones, política de acceso y handoff UI; approved READY de requisitos por requirements_reviewer. La serie EL-TK-001..073 queda ocupada; implementación PARTIAL según dependencias técnicas.
- **CONFIRMED — 2026-10-10, EL-EP-004:** EL-TK-074..085 asignados a acceso público, sesión guest, consentimiento, identidad, Mis aportes, desactivación/cambio de PIN, regeneración, compartir/QR, emisión inicial e integración UI guest/organizador; approved READY de requisitos por requirements_reviewer. La serie EL-TK-001..085 queda ocupada.
- **CONFIRMED — 2026-10-10, EL-EP-005:** EL-TK-086..095 asignados a autorización/reserva, carga directa, confirmación, validación real, aceptación/handoff async, retry, cancelación, consulta de lote, UI guest y validación integrada; approved READY de requisitos por requirements_reviewer. La serie EL-TK-001..095 queda ocupada.
- Antes de asignar un nuevo ID, revisar toda la serie, incluidos sus registros históricos. Tras esta migración están ocupados EL-EP-001..017 y EL-TK-001..019; no se asigna ningún número nuevo.
- Usar identificadores canónicos en metadatos, referencias, enlaces, backlog, dependencias, roadmap, decisiones, sesiones y contexto técnico. Los otros tipos de ID del proyecto conservan sus convenciones existentes.
- Las plantillas EL-EP-TEMPLATE.md y EL-TK-TEMPLATE.md no son IDs ni consumen números.

## Migración histórica de prefijos

Esta tabla conserva los identificadores anteriores únicamente para buscar y rastrear documentos previos. No son referencias vigentes ni identificadores disponibles para reutilización. Cada fila representa el mismo artefacto antes y después; no hay renumeración.

| ID histórico | ID canónico vigente |
|---|---|
| EPIC-001 | EL-EP-001 |
| EPIC-002 | EL-EP-002 |
| EPIC-003 | EL-EP-003 |
| EPIC-004 | EL-EP-004 |
| EPIC-005 | EL-EP-005 |
| EPIC-006 | EL-EP-006 |
| EPIC-007 | EL-EP-007 |
| EPIC-008 | EL-EP-008 |
| EPIC-009 | EL-EP-009 |
| EPIC-010 | EL-EP-010 |
| EPIC-011 | EL-EP-011 |
| EPIC-012 | EL-EP-012 |
| EPIC-013 | EL-EP-013 |
| EPIC-014 | EL-EP-014 |
| EPIC-015 | EL-EP-015 |
| EPIC-016 | EL-EP-016 |
| EPIC-017 | EL-EP-017 |
| TICKET-001 | EL-TK-001 |
| TICKET-002 | EL-TK-002 |
| TICKET-003 | EL-TK-003 |
| TICKET-004 | EL-TK-004 |
| TICKET-005 | EL-TK-005 |
| TICKET-006 | EL-TK-006 |
| TICKET-007 | EL-TK-007 |
| TICKET-008 | EL-TK-008 |
| TICKET-009 | EL-TK-009 |
| TICKET-010 | EL-TK-010 |
| TICKET-011 | EL-TK-011 |
| TICKET-012 | EL-TK-012 |
| TICKET-013 | EL-TK-013 |
| TICKET-014 | EL-TK-014 |
| TICKET-015 | EL-TK-015 |
| TICKET-016 | EL-TK-016 |
| TICKET-017 | EL-TK-017 |
| TICKET-018 | EL-TK-018 |
| TICKET-019 | EL-TK-019 |

EL-TK-001..004 conservan SUPERSEDED; EL-TK-005..019 conservan READY. La migración no cambia estados, alcance, criterios, reglas, prioridades, dependencias funcionales ni decisiones aceptadas.

## Registro de aplicación

Cambio exclusivamente documental; no requiere una nueva change request conforme a las instrucciones de backlog_manager. Los registros CR-001..003 y las decisiones de producto permanecen válidos. Clasificación: Correction documental de identificadores; disposición CHANGE_READY.

Se actualizaron referencias tanto actuales como históricas al identificador canónico, manteniendo intactos sus hechos y estados en cada momento. El mapa anterior y el inventario de rutas en la [sesión de migración](sessions/2026-10-07-identifier-convention.md) son las únicas excepciones históricas; no deben utilizarse como rutas vigentes.
