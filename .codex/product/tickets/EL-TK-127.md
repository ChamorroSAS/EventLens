# EL-TK-127 — Publicar disponibilidad y expiración de una exportación preparada

## Parent epic
EL-EP-010

## Status
READY

## User story
**Como** sistema, **quiero** marcar una exportación preparada como disponible, **para** informar al organizador qué partes puede descargar y hasta cuándo.

## Alcance funcional
Al completar todas las partes autorizadas, marcar AVAILABLE, registrar lista/tamaños y expiresAt de 48h; no considerar disponible una exportación parcial incompleta.

## Fuera de alcance
Descargar bytes, regenerar exportación o notificar por email directamente si pertenece a EL-EP-013.

## Criterios de aceptación
### Escenario 1
**Dado** todas las partes requeridas están listas, **cuando** finaliza preparación, **entonces** la exportación queda AVAILABLE con expiresAt +48h.

### Escenario 2
**Dado** solo algunas partes existen, **cuando** se evalúa, **entonces** no se declara AVAILABLE por la mera existencia parcial.

### Escenario 3
**Dado** llega expiresAt, **cuando** se reconcilia, **entonces** pasa a EXPIRED y deja de emitir nuevos grants.

## Reglas de negocio
DEC-048: disponibilidad 48h. Estado de disponibilidad representa el conjunto autorizado, no un archivo parcial.

## Validaciones y permisos
Sistema; owner solo consulta estado.

## Casos de error y estados vacíos
Manifest inconsistente, parte faltante, reloj/replay y cleanup pendiente.

## Datos / contratos afectados
Export status AVAILABLE/EXPIRED, parts metadata, expiresAt.

## Dependencias técnicas y funcionales
Preparación EL-TK-126 y avisos EL-EP-013.

## Dependencias de tickets
- **depends_on:** EL-TK-126
- **blocks:** EL-TK-129, EL-TK-131, EL-TK-132, EL-TK-133; contrato de aviso EL-EP-013

## Pruebas requeridas
Completo, parcial, expiración, replay y timestamps.

## Observabilidad / auditoría
Auditar disponibilidad/expiración y conteos.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-048, DEC-049; EL-EP-010, EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-009/013/046..049/063/064/075/079/090 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §9.1..8; sin componentes nuevos ni centros de exportación paralelos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
