# EL-TK-162 — Generar avisos de cuenta, seguridad y cambios del evento

## Parent epic
EL-EP-013

## Status
DRAFT

## User story
**Como** sistema, **quiero** informar hitos de cuenta y cambios operativos relevantes, **para** mantener al organizador informado sin exponer detalles sensibles.

## Alcance funcional
Crear avisos para recuperación/seguridad de cuenta, evento próximo, cambios autorizados, suspensión/reactivación y eventos de acceso pertinentes.

## Fuera de alcance
Implementar auth, lifecycle o revelar razones internas de seguridad/investigación.

## Criterios de aceptación
### Escenario 1
**Dado** ocurre un hecho de seguridad notificable, **cuando** se procesa, **entonces** comunica al owner con copy sanitizado.

### Escenario 2
**Dado** evento se suspende/reactiva, **cuando** se confirma dominio, **entonces** se genera aviso sin revelar motivo restringido.

### Escenario 3
**Dado** hecho se revierte/queda obsoleto, **cuando** se presenta, **entonces** solo queda vigente la comunicación aplicable.

## Reglas de negocio
Avisar intervención salvo razón legal/seguridad; el motivo sensible puede suprimirse.

## Validaciones y permisos
Destinatario autorizado; hechos provenientes de dominios dueños.

## Casos de error y estados vacíos
Destinatario no vigente, supresión requerida, replay y fallo delivery.

## Datos / contratos afectados
Account/EventNotificationFacts, suppression reason/ref.

## Dependencias técnicas y funcionales
EL-EP-001 y EL-EP-003/012.

## Dependencias de tickets
- **depends_on:** EL-TK-156; contratos EL-EP-001, EL-EP-003, EL-EP-012
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Seguridad, suspensión/reactivación, supresión, dedupe y privacidad.

## Observabilidad / auditoría
No almacenar motivos sensibles en copy/logs cuando estén suprimidos.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-081; EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
