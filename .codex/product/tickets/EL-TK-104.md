# EL-TK-104 — Rechazar una media pendiente de revisión

## Parent epic
EL-EP-008

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** rechazar una media pendiente, **para** evitar que se publique sin eliminar necesariamente el original.

## Alcance funcional
Transicionar una media PENDING_REVIEW a REJECTED conservando el original y su consumo mientras exista físicamente.

## Fuera de alcance
Enviar a papelera, purgar, bloquear por seguridad o resolver denuncias graves.

## Criterios de aceptación
### Escenario 1
**Dado** una media propia en PENDING_REVIEW, **cuando** el organizador la rechaza, **entonces** pasa a REJECTED y no aparece en la galería guest.

### Escenario 2
**Dado** una media ya no pendiente, **cuando** se intenta rechazar, **entonces** se rechaza el comando sin sobrescribir el estado actual.

### Escenario 3
**Dado** una media REJECTED, **cuando** se consulta en biblioteca, **entonces** permanece visible al owner según capacidades vigentes y conserva consumo mientras exista.

## Reglas de negocio
REJECTED no equivale a DELETED. Puede ser elegible para papelera conforme DEC-096.

## Validaciones y permisos
Solo propietario del evento; no aplica a cuarentena ni media ajena.

## Casos de error y estados vacíos
No encontrada, actor ajeno, estado incompatible y conflicto concurrente.

## Datos / contratos afectados
Media moderation command, publicationState REJECTED, concurrency/version.

## Dependencias técnicas y funcionales
Biblioteca owner EL-EP-007 y reglas de consumo de EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-098
- **blocks:** EL-TK-107, EL-TK-111, EL-TK-112

## Pruebas requeridas
Rechazo válido, estados incompatibles, actor ajeno y permanencia del original/consumo.

## Observabilidad / auditoría
Auditar transición y actor; no registrar media.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019; DEC-005, DEC-039, DEC-096; EL-EP-008.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
