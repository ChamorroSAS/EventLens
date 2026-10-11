# EL-TK-140 — Responder una solicitud de información adicional de ampliación

## Parent epic
EL-EP-011

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** responder dentro de la misma solicitud, **para** continuar la revisión sin abrir un caso duplicado.

## Alcance funcional
Añadir respuesta textual al historial de una solicitud en INFORMATION_REQUESTED y devolverla a PENDING_REVIEW.

## Fuera de alcance
Crear otra solicitud, adjuntar archivos o modificar límites.

## Criterios de aceptación
### Escenario 1
**Dado** solicitud requiere información, **cuando** owner responde, **entonces** se agrega al historial y vuelve a PENDING_REVIEW.

### Escenario 2
**Dado** se repite la misma respuesta por retry, **cuando** se procesa, **entonces** no duplica entradas.

### Escenario 3
**Dado** la solicitud ya no admite respuesta, **cuando** se envía, **entonces** se rechaza con estado actual.

## Reglas de negocio
La misma solicitud permanece abierta y bloquea nuevas solicitudes.

## Validaciones y permisos
Owner del evento/solicitud.

## Casos de error y estados vacíos
Estado incompatible, actor ajeno, texto inválido, replay y conflicto.

## Datos / contratos afectados
ExtensionRequestHistoryEntry, response command, status transition.

## Dependencias técnicas y funcionales
Solicitud EL-TK-139.

## Dependencias de tickets
- **depends_on:** EL-TK-139
- **blocks:** EL-TK-141, EL-TK-143, EL-TK-144, EL-TK-145

## Pruebas requeridas
Respuesta válida, historial, replay, estado concurrente y aislamiento.

## Observabilidad / auditoría
Auditar autor/fecha/referencia; minimizar contenido en logs.

## Prioridad / estimación
P0 / M

## Traceability
DEC-094, DEC-101; EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
