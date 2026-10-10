# EL-TK-112 — Validar moderación, papelera y restauración de extremo a extremo

## Parent epic
EL-EP-008

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** validar el flujo de moderación y papelera, **para** comprobar que ninguna acción evade seguridad, visibilidad o retención.

## Alcance funcional
Cubrir API/UI/scheduler para aprobar, rechazar, ocultar, republicar, papelera, restaurar, vencimiento y cambio de modo.

## Fuera de alcance
Certificar resolución completa de denuncias graves, retención jurídica o purga física integral de EL-EP-015.

## Criterios de aceptación
### Escenario 1
**Dado** un conjunto de medias cubre estados elegibles/no elegibles, **cuando** se ejecutan acciones, **entonces** cada transición respeta el contrato.

### Escenario 2
**Dado** una restauración compite con expiración, **cuando** se ejecuta la carrera, **entonces** solo una decisión consistente prevalece.

### Escenario 3
**Dado** cambia el modo con pendientes y trabajos en vuelo, **cuando** finalizan, **entonces** se conserva DEC-087.

## Reglas de negocio
La prueba debe verificar que cuarentena/procesamiento/retiro no pueden evadirse.

## Validaciones y permisos
Datos sintéticos/controlados y roles autorizados.

## Casos de error y estados vacíos
Conflictos, jobs repetidos, media purgada, bloqueo seguridad y UI parcial.

## Datos / contratos afectados
EL-TK-103..111 y contrato de purga EL-EP-015.

## Dependencias técnicas y funcionales
Entorno integrado con JobQueue/scheduler y biblioteca owner.

## Dependencias de tickets
- **depends_on:** EL-TK-103, EL-TK-104, EL-TK-105, EL-TK-106, EL-TK-107, EL-TK-108, EL-TK-109, EL-TK-110, EL-TK-111
- **blocks:** validación integrada de EL-EP-008 antes de consumidores EL-EP-009/010/015

## Pruebas requeridas
E2E, integración, concurrencia, idempotencia, lifecycle, seguridad y WCAG 2.2 AA.

## Observabilidad / auditoría
Evidencias sanitizadas sin media privada real.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019, Q-023; DEC-005, DEC-022, DEC-039, DEC-086, DEC-087, DEC-096; EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
