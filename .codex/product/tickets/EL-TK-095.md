# EL-TK-095 — Validar el flujo completo de carga móvil y resultado parcial

## Parent epic
EL-EP-005

## Status
READY

## User story
**Como** equipo de producto, **quiero** validar el flujo de carga de extremo a extremo bajo fallos y concurrencia, **para** comprobar que el MVP preserva confirmados y recupera archivos elegibles sin perder el lote.

## Alcance funcional
Cubrir integración API/storage/UI del flujo de selección → autorización → transferencia → confirmación → validación → aceptación → handoff a EL-TK-032, incluyendo lote mixto, retry, cuota concurrente y cancelación por policy.

## Fuera de alcance
Certificar proveedor definitivo de storage, procesamiento completo de EL-EP-006, galería o performance de transcodificación.

## Criterios de aceptación
### Escenario 1
**Dado** un lote mixto válido, **cuando** se carga en condiciones normales, **entonces** cada original aceptado queda preservado y entregado una sola vez al contrato de procesamiento.

### Escenario 2
**Dado** un fallo temporal en un archivo, **cuando** se reintenta, **entonces** el resto del lote conserva sus resultados y no aparecen duplicados.

### Escenario 3
**Dado** concurrencia cerca de cuota, **cuando** múltiples cargas compiten, **entonces** no se supera la capacidad autorizada ni se pierden confirmados.

### Escenario 4
**Dado** revocación/cierre durante transferencia, **cuando** se reconcilia, **entonces** no confirmados quedan cancelados y confirmados previos se conservan.

## Reglas de negocio
Objetivo MVP de cargas válidas exitosas >=95% se mide separadamente de este gate funcional; no se convierte una prueba aislada en métrica Beta.

## Validaciones y permisos
Usar datos sintéticos/controlados y almacenamiento privado; no exponer originales reales en evidencias.

## Casos de error y estados vacíos
Offline, storage temporalmente indisponible, timeout de confirmación, replay, cancelación concurrente y resultado parcial.

## Datos / contratos afectados
Todos los contratos EL-TK-086..094 y handoff EL-TK-032.

## Dependencias técnicas y funcionales
Implementaciones de EL-TK-086..094 y entorno de integración disponible.

## Dependencias de tickets
- **depends_on:** EL-TK-086, EL-TK-087, EL-TK-088, EL-TK-089, EL-TK-090, EL-TK-091, EL-TK-092, EL-TK-093, EL-TK-094.
- **blocks:** validación integrada de EL-EP-005 antes de consumidores completos de EL-EP-006/007.

## Pruebas requeridas
API/PostgreSQL/storage real de integración, E2E móvil, concurrencia, retry, idempotencia y cancelación por policy.

## Observabilidad / auditoría
Evidencia sanitizada sin bytes privados, secretos ni URLs firmadas.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-009, Q-011; DEC-009, DEC-010, DEC-011, DEC-063, DEC-079, DEC-080, DEC-085; EL-EP-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la suite de validación integrada de flujo completo móvil, concurrencia, tolerancia a fallos por archivo y resultado parcial, verificando que los confirmados se conservan ante cancelación de lotes en vuelo.
