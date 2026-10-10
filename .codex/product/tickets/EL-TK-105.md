# EL-TK-105 — Ocultar una media publicada sin eliminarla

## Parent epic
EL-EP-008

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** ocultar una media publicada, **para** retirarla de la galería manteniendo el recuerdo y su consumo.

## Alcance funcional
Transicionar PUBLISHED a HIDDEN de forma reversible y efectiva para nuevas consultas/grants de galería.

## Fuera de alcance
Borrar el original, enviarlo a papelera, resolver denuncias o invalidar bytes ya entregados.

## Criterios de aceptación
### Escenario 1
**Dado** una media propia PUBLISHED, **cuando** el organizador la oculta, **entonces** pasa a HIDDEN y deja de aparecer en nuevas consultas/grants guest.

### Escenario 2
**Dado** la media ya no está PUBLISHED, **cuando** se intenta ocultar, **entonces** se devuelve conflicto sin destruir información.

### Escenario 3
**Dado** la media queda HIDDEN, **cuando** se calcula consumo, **entonces** continúa contando mientras exista el original físico.

## Reglas de negocio
Ocultar no es eliminar y no reduce cuota. Nuevas autorizaciones de visualización deben respetar el cambio.

## Validaciones y permisos
Solo propietario del evento; bloqueos externos pueden restringir acciones posteriores.

## Casos de error y estados vacíos
No encontrada, actor ajeno, estado incompatible y carrera con retiro/moderación administrativa.

## Datos / contratos afectados
Media visibility command, publicationState HIDDEN, integration with EL-TK-101 revalidation.

## Dependencias técnicas y funcionales
Galería privada EL-EP-007 y consumo EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-101
- **blocks:** EL-TK-106, EL-TK-107, EL-TK-111, EL-TK-112

## Pruebas requeridas
Ocultar válido, desaparición de nuevas consultas, consumo intacto, actor ajeno y carrera.

## Observabilidad / auditoría
Auditar transición y resultado sin URLs firmadas.

## Prioridad / estimación
P0 / M

## Traceability
Q-006, Q-019; DEC-005, DEC-018, DEC-039; EL-EP-008, EL-EP-007.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
