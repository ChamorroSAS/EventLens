# EL-TK-096 — Consultar la galería guest de media publicada y autorizada

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** invitado autorizado, **quiero** consultar los recuerdos publicados del evento, **para** ver únicamente el contenido que la galería guest me permite.

## Alcance funcional
Exponer una consulta paginada de media visible para invitados, limitada al evento y a estado PUBLISHED, respetando guest_gallery_enabled, lifecycle y capacidades vigentes del acceso guest.

## Fuera de alcance
Media pendiente, oculta, rechazada, eliminada o en cuarentena; descargas guest; acciones de moderación; Mis aportes.

## Criterios de aceptación
### Escenario 1
**Dado** un evento con galería guest habilitada y acceso vigente, **cuando** el invitado consulta la galería, **entonces** recibe únicamente media PUBLISHED autorizada de ese evento.

### Escenario 2
**Dado** galería deshabilitada, lifecycle no compatible o acceso revocado, **cuando** consulta, **entonces** no recibe media privada y obtiene el estado público autorizado.

### Escenario 3
**Dado** una galería sin publicaciones, **cuando** consulta, **entonces** obtiene un resultado vacío distinguible de galería deshabilitada.

### Escenario 4
**Dado** múltiples páginas, **cuando** solicita el siguiente bloque, **entonces** no mezcla media de otros eventos ni repite resultados por una paginación estable.

## Reglas de negocio
Invitados solo ven PUBLISHED. Carga y galería son flags independientes. Una sesión válida para Mis aportes no habilita por sí sola la galería general.

## Validaciones y permisos
Credencial/sesión guest vigente cuando aplique, eventId resuelto por acceso autorizado y policy server-side.

## Casos de error y estados vacíos
Galería vacía, galería apagada, acceso revocado, evento no disponible y fallo temporal de consulta.

## Datos / contratos afectados
GuestGallerySnapshot, GalleryMediaSummary, pagination cursor/capabilities.

## Dependencias técnicas y funcionales
Acceso guest de EL-EP-004, lifecycle de EL-EP-003 y media procesada/publicable de EL-EP-006.

## Dependencias de tickets
- **depends_on:** EL-TK-074, EL-TK-072, contrato de media publicada de EL-EP-006.
- **blocks:** EL-TK-097, EL-TK-099, EL-TK-101.

## Pruebas requeridas
Aislamiento entre eventos, solo PUBLISHED, galería on/off, lifecycle, vacío, paginación y acceso revocado.

## Observabilidad / auditoría
Consulta normal sin registrar tokens completos ni identificadores sensibles innecesarios.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016; DEC-003, DEC-018, DEC-032, DEC-033, DEC-063, DEC-084; EL-EP-007, EL-EP-004, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
