# EL-TK-220 — Añadir revisión monotónica y CAS a eventos
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero que las configuraciones detecten cambios concurrentes, para no sobrescribir un evento actualizado.
## Alcance funcional
Introducir revisión `bigint` monotónica serializada como string y CAS en MOD-002. Todo UPDATE de fila evento, incluidos writers lifecycle/legacy, incrementa revisión mediante mecanismo SQL mínimo; comandos nuevos bloquean, revalidan y aplican CAS antes del efecto. Proyectar capacidades granulares: `canEditName`/`canSetLocalSchedule` sólo DRAFT; `canChangeTimezone` DRAFT o SCHEDULED antes de ACTIVE; estados canónicos no habilitados siempre false; ARCHIVED es solo legado inválido denegado por defecto, no un estado nuevo. Coordinar `RecalculateSchedule` propietario en la misma transacción/revisión tanto para horario como TZ, sin expiración inventada de DRAFT.
## Fuera de alcance
No define reglas en Prisma, no cambia lifecycle, no expone timestamps como expectedRevision ni crea UI.
## Criterios de aceptación
### Revisión completa
**Dado** cualquier writer de evento, **cuando** actualiza la fila, **entonces** la revisión aumenta una vez.
### Dos escritores
**Dado** dos comandos con misma revisión, **cuando** aplican, **entonces** sólo uno modifica y el otro recibe `CONCURRENCY_CONFLICT` 409.
### Rollback
**Dado** fallo posterior al CAS, **cuando** la transacción revierte, **entonces** no queda revisión ni cambio parcial.
### Capacidades y calendario
**Dado** estados canónicos DRAFT, SCHEDULED, ACTIVE, CLOSED, GRACE_PERIOD, SUSPENDED, PENDING_DELETION o DELETED, **cuando** se proyectan capacidades, **entonces** nombre/horario sólo se habilitan en DRAFT y TZ en DRAFT/SCHEDULED antes ACTIVE; los demás y legado ARCHIVED deniegan. Cambios permitidos coordinan calendario y revisión atómicos sin inventar estados.
## Reglas de negocio
Intención nueva con revisión obsoleta no es replay. La revisión es opaca al cliente.
## Validaciones y permisos
Autoridad/owner/restricciones se validan en transacción antes de efecto; recurso ajeno es neutro.
## Casos de error y estados vacíos
Revisión ausente o inválida 400; conflicto 409 sin retry automático.
## Datos / contratos afectados
MOD-002/event persistence; contrato organizer `expectedRevision`.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-219. **blocks:** EL-TK-224, EL-TK-225, EL-TK-226, EL-TK-227, EL-TK-228, EL-TK-237. **can_parallelize_with:** ninguno, comparte persistencia de EL-TK-219.
## Pruebas requeridas
PostgreSQL aislado para writers legacy/lifecycle, carreras CAS y rollback; serialización OpenAPI posterior.
## Observabilidad / auditoría
CorrelationId y tipo de conflicto; no registrar payload privado completo.
## Prioridad / estimación
P0 / M. Fase 2.
## Riesgos / notas
Revisar todos los writers antes de activar; no asumir que código DONE cubre el invariante.
## Traceability
EL-EP-019; DEC-069/070; `event-control-panels-contract.md`.
## Definition of Ready
- [x] Invariante SQL y escenarios de carrera definidos
- [x] Dependencia persistente explícita
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
- [x] CAS y revisión probados para todos los writers identificados sin lost update; capacidades granulares y recálculo propietario atómico acreditados. (Verificado con `event-draft-revision-cas.integration.test.ts` en contenedor efímero PostgreSQL 16).
## Archivos candidatos
- **read/modify:** `packages/event-management/prisma/schema.prisma`, `packages/event-management/src/event-draft.ts`, `packages/event-management/src/event-lifecycle.ts`, `packages/event-management/src/timezone.ts`.
- **test:** `packages/event-management/test/event-draft-config.integration.test.ts`, `packages/event-management/test/event-lifecycle.integration.test.ts`, `packages/event-management/test/event-schedule.integration.test.ts`.
