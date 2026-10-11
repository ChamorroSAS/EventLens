# EL-TK-135 — Consultar consumo comercial y capacidad disponible del evento

## Parent epic
EL-EP-011

## Status
READY

## User story
**Como** organizador propietario, **quiero** consultar uso, reservas y límites efectivos, **para** entender cuánta capacidad queda sin confundir consumo con almacenamiento operacional.

## Alcance funcional
Exponer snapshot de almacenamiento original comercial, conteo de archivos, reservas vigentes y límites efectivos, separando portadas/derivados/exports del consumo comercial.

## Fuera de alcance
Autorizar una carga, crear reservas, contar derivados/ZIP como cuota comercial o calcular límites en frontend.

## Criterios de aceptación
### Escenario 1
**Dado** evento con originales y reservas, **cuando** se consulta capacidad, **entonces** se devuelven consumo, reservas y disponible de forma consistente.

### Escenario 2
**Dado** consumo es cero, **cuando** se consulta, **entonces** se distingue cero real de carga/error.

### Escenario 3
**Dado** una reducción deja uso+reservas sobre el límite, **cuando** se consulta, **entonces** se muestran valores reales y capacidad disponible cero sin borrar archivos.

## Reglas de negocio
Originales físicamente existentes no purgados cuentan; GB decimales; reservas se muestran separadas y no son archivos confirmados.

## Validaciones y permisos
Owner del evento y admin autorizado; aislamiento por eventId.

## Casos de error y estados vacíos
Permiso denegado, snapshot inconsistente, error temporal y datos parciales no deben presentarse como cero.

## Datos / contratos afectados
CapacitySnapshot, StorageUsage, FileUsageSummary, effectiveLimits/reservations.

## Dependencias técnicas y funcionales
Plan efectivo EL-TK-134 y ledger de cuota EL-TK-136/137.

## Dependencias de tickets
- **depends_on:** EL-TK-134, EL-TK-136, EL-TK-137
- **blocks:** EL-TK-138, EL-TK-139, EL-TK-143, EL-TK-144, EL-TK-145

## Pruebas requeridas
Cero/normal/sobre límite, reservas, aislamiento, unidades y concurrencia.

## Observabilidad / auditoría
Métricas agregadas por evento sin object keys.

## Prioridad / estimación
P0 / M

## Traceability
DEC-079, DEC-080, DEC-100; EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-079/080/093..095/100..102 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011; sin componentes nuevos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
