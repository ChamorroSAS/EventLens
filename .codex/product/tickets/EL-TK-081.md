# EL-TK-081 — Consultar datos de compartir y QR del acceso vigente

## Parent epic
EL-EP-004

## Status
READY

## User story
**Como** organizador, **quiero** consultar el enlace vigente y su representación QR, **para** compartir el acceso correcto con mis invitados.

## Alcance funcional
Exponer al propietario un payload de compartir basado únicamente en la credencial pública vigente y una representación QR descargable/generable sin persistir secretos innecesarios.

## Fuera de alcance
Diseño gráfico avanzado del QR, analítica nominal o historial de invitados.

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio con credencial vigente, **cuando** consulta compartir, **entonces** obtiene enlace actual y QR equivalente.

### Escenario 2
**Dado** una regeneración reciente, **cuando** consulta, **entonces** nunca devuelve la credencial anterior.

## Reglas de negocio
QR y enlace representan la misma credencial vigente.

## Validaciones y permisos
Solo propietario autorizado para consultar el material de compartir.

## Casos de error y estados vacíos
Sin credencial vigente se devuelve estado explícito sin generar credenciales implícitamente.

## Datos / contratos afectados
ShareAccessSnapshot / QR payload.

## Dependencias técnicas y funcionales
Acceso público y regeneración.

## Dependencias de tickets
- **depends_on:** EL-TK-074, EL-TK-084.
- **blocks:** EL-TK-085.

## Pruebas requeridas
Credencial vigente, post-regeneración, autorización y equivalencia enlace/QR.

## Observabilidad / auditoría
No registrar URL/token completos.

## Prioridad / estimación
P0 / S

## Traceability
Q-005; DEC-004, DEC-013; EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la consulta de enlace de compartir y payload QR basado en la credencial vigente, consumido por EventSharePanel, QRPreview y CopyEventLinkAction conforme al handoff UI/UX de EL-EP-004.
