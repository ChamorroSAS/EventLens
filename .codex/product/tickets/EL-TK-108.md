# EL-TK-108 — Restaurar una media de papelera respetando bloqueos vigentes

## Parent epic
EL-EP-008

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** restaurar una media antes de vencer su ventana, **para** recuperar su estado previo sin publicar ni liberar contenido indebidamente.

## Alcance funcional
Restaurar TRASHED a previous_state durante la ventana válida, revalidando seguridad, retiro y reglas de moderación actuales.

## Fuera de alcance
Restaurar contenido purgado, liberar cuarentena, cancelar retiro irreversible o publicar automáticamente.

## Criterios de aceptación
### Escenario 1
**Dado** una media TRASHED dentro de siete días y sin nuevos bloqueos, **cuando** el owner restaura, **entonces** recupera su previous_state.

### Escenario 2
**Dado** previous_state era PENDING_REVIEW, **cuando** se restaura, **entonces** vuelve a PENDING_REVIEW y no se publica.

### Escenario 3
**Dado** la ventana venció o la media fue purgada, **cuando** se intenta restaurar, **entonces** se deniega sin recrear contenido.

## Reglas de negocio
DEC-086: restaurar conserva estado previo pero no evade moderación, cuarentena, seguridad ni retiro.

## Validaciones y permisos
Solo propietario y dentro de ventana vigente.

## Casos de error y estados vacíos
Ventana vencida, purgado, bloqueo vigente, actor ajeno y carrera con purga.

## Datos / contratos afectados
RestoreMedia command, previousState, restoreDeadline, blockers, version.

## Dependencias técnicas y funcionales
Papelera EL-TK-107 y contrato de purga EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-107
- **blocks:** EL-TK-111, EL-TK-112

## Pruebas requeridas
Restauración por cada previous_state, vencida, purgada, bloqueada y carrera con purge.

## Observabilidad / auditoría
Auditar estado restaurado o razón de denegación.

## Prioridad / estimación
P0 / M

## Traceability
Q-019; DEC-022, DEC-086, DEC-096; EL-EP-008, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
