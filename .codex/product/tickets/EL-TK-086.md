# EL-TK-086 — Autorizar un intento de carga y reservar capacidad del evento

## Parent epic
EL-EP-005

## Status
DRAFT

## User story
**Como** invitado autorizado, **quiero** iniciar una carga reservando capacidad para mi archivo, **para** evitar competir de forma insegura con otras cargas simultáneas.

## Alcance funcional
Crear un intento de carga para un archivo seleccionado, validar sesión/capacidades/lifecycle/configuración de uploads y reservar atómicamente un cupo de archivo y los bytes declarados conforme DEC-080.

## Fuera de alcance
Transferir bytes al object storage, confirmar el original, procesar multimedia o reanudar cargas tras cerrar el navegador.

## Criterios de aceptación
### Escenario 1
**Dado** una sesión guest vigente, uploads habilitados y capacidad disponible, **cuando** se autoriza un archivo elegible, **entonces** se crea un intento único y se reservan bytes y un cupo de archivo.

### Escenario 2
**Dado** capacidad insuficiente o límite de archivos alcanzado, **cuando** se solicita autorización, **entonces** se rechaza sin crear una reserva parcial ni afectar cargas ya confirmadas.

### Escenario 3
**Dado** dos autorizaciones concurrentes cercanas al límite, **cuando** compiten, **entonces** la reserva se serializa sin sobrepasar la capacidad efectiva.

## Reglas de negocio
La cuota comercial cuenta originales de aportes. MB/GB son decimales. Una reserva no concede continuidad contra permisos o lifecycle posteriores.

## Validaciones y permisos
Sesión guest autorizada, uploads habilitados, lifecycle compatible y límites del plan vigentes.

## Casos de error y estados vacíos
Sesión revocada, uploads deshabilitados, evento no disponible, cuota insuficiente, archivo ya reservado o conflicto concurrente.

## Datos / contratos afectados
UploadAttempt/UploadIntent, reservationBytes, reservationFileSlot, eventId, guestSessionId, declaredSize, declaredType, status.

## Dependencias técnicas y funcionales
Capacidades guest de EL-EP-004, policy de lifecycle de EL-EP-003 y contrato de capacidad de EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-075, EL-TK-072, contrato EL-EP-011.
- **blocks:** EL-TK-087, EL-TK-090, EL-TK-091, EL-TK-092, EL-TK-093, EL-TK-094, EL-TK-095.

## Pruebas requeridas
Autorización válida, límites, reserva atómica, concurrencia, sesión revocada y rollback.

## Observabilidad / auditoría
Registrar intento y resultado sin secretos, URL firmada ni datos binarios.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-011; DEC-010, DEC-011, DEC-079, DEC-080, DEC-085; EL-EP-005, EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
