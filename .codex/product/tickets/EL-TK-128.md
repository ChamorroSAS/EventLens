# EL-TK-128 — Invalidar exportaciones afectadas por retiro o pérdida de acceso

## Parent epic
EL-EP-010

## Status
READY

## User story
**Como** sistema, **quiero** revalidar una exportación ante cambios de permiso o contenido, **para** evitar entregar paquetes que ya contienen contenido no autorizado.

## Alcance funcional
Revalidar snapshot al preparar y antes de autorizar descargas; invalidar exportación/partes afectadas por retiro de privacidad/seguridad o revocación de acceso conforme DEC-090.

## Fuera de alcance
Revocar universalmente bytes ya descargados o URLs ya emitidas, alterar el snapshot para añadir media o resolver el retiro origen.

## Criterios de aceptación
### Escenario 1
**Dado** una media del snapshot es retirada antes de preparar, **cuando** se revalida, **entonces** la exportación no se prepara como si siguiera autorizada.

### Escenario 2
**Dado** una exportación AVAILABLE queda afectada por retiro/revocación, **cuando** se solicita nuevo grant, **entonces** se invalida y no se emite nueva autorización.

### Escenario 3
**Dado** una URL ya fue entregada, **cuando** ocurre el cambio, **entonces** no se promete recuperar bytes ni revocación universal técnica.

## Reglas de negocio
Snapshot no se amplía; permisos sí se revalidan. Invalidación es distinta de EXPIRED/FAILED.

## Validaciones y permisos
Policy server-side; owner solo recibe estado resultante.

## Casos de error y estados vacíos
Cambio concurrente, invalidación parcial, manifest viejo y downstream cleanup fallido.

## Datos / contratos afectados
Export invalidation reason/status, current permission check, affected parts.

## Dependencias técnicas y funcionales
Contratos EL-EP-008/009/015 y acceso owner.

## Dependencias de tickets
- **depends_on:** EL-TK-125, EL-TK-126; contratos EL-EP-008, EL-EP-009, EL-EP-015
- **blocks:** EL-TK-129, EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
Retiro antes/durante/después, access revoke, no expansión snapshot y URL ya emitida.

## Observabilidad / auditoría
Auditar invalidación y causa sin listar contenido sensible innecesario.

## Prioridad / estimación
P0 / M

## Traceability
DEC-090; EL-EP-010, EL-EP-008, EL-EP-009, EL-EP-015.

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
