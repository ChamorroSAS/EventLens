# EL-TK-193 — Propagar barreras de eliminación a accesos, grants y exportaciones

## Parent epic
EL-EP-015

## Status
READY

## User story
**Como** sistema, **quiero** propagar restricciones de solicitudes y cancelaciones a módulos propietarios, **para** evitar acceso, subida o descarga después de revocación.

## Alcance funcional
Coordinar invalidación server-side de capacidades guest/organizer, carga, media grants, URLs futuras y exportaciones; cada propietario conserva autoridad; cancelar levanta únicamente barrera causal tras ACK, escritores tardíos permanecen vigilados.

## Fuera de alcance
No promete revocar universalmente URL ya emitida ni muta permisos en UI.

## Criterios de aceptación
### Escenario 1
Dada solicitud event/account, cuando se confirma barrera, entonces no se emiten nuevas autorizaciones upload/gallery/export/guest.

### Escenario 2
Dada exportación afectada, cuando se solicita nuevo grant, entonces MOD-005 la invalida y conserva inventario de partes.

### Escenario 3
Dada cancelación autorizada, cuando ACK confirma, entonces solo su barrera se levanta y las restantes mantienen denegación.

## Reglas de negocio
Bloqueo efectivo PREPARE, no posterior a una tarea async; no inferir ausencia de writer desde revocación API.

## Validaciones y permisos
Contracts propietarios MOD-001/002/003/004/005, CAS/fence/epoch.

## Casos de error y estados vacíos
URLs prefirmadas activas, job en vuelo, fuga por caché, timeout y dependencia caída.

## Datos / contratos afectados
EL-TK-128 invalidación exports; EventAccessPolicy, ObjectStorage grants, RecoveryAuthority.

## Dependencias técnicas y funcionales
EL-TK-189, EL-TK-191; EL-TK-128 para exportación integrada.

## Dependencias de tickets
- **depends_on:** EL-TK-189, EL-TK-191; EL-TK-128 para exportación integrada.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Pruebas integración guest/owner/exports, conexiones activas, carreras request/cancel, protección IDOR y fail-closed.

## Observabilidad / auditoría
Contadores de grants revocados y negados, sin bytes ni URLs firmadas.

## Prioridad / estimación
P0 / L

## Traceability
DEC-013/063/090/091/092; ARCH-010/017; EL-EP-015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12. No acredita implementación, ejecución de pruebas ni PASS de validation gates.
