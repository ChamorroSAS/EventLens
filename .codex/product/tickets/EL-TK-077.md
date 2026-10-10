# EL-TK-077 — Registrar nombre o apodo del aportante en la sesión guest

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** invitado, **quiero** indicar un nombre o apodo para mis aportes, **para** identificarlos dentro del evento sin crear una cuenta.

## Alcance funcional
Capturar y asociar a la sesión guest una identidad de presentación mínima para futuras cargas.

## Fuera de alcance
Verificación de identidad, correo, teléfono, documento o perfil nominal.

## Criterios de aceptación
### Escenario 1
**Dado** una sesión guest vigente, **cuando** el invitado guarda un nombre/apodo válido, **entonces** queda asociado a esa sesión para sus nuevos aportes.

### Escenario 2
**Dado** una entrada vacía o inválida, **cuando** intenta continuar, **entonces** se rechaza sin crear datos parciales.

## Reglas de negocio
El nombre/apodo no prueba identidad personal ni titularidad legal.

## Validaciones y permisos
Solo la sesión guest propietaria; aplicar límites de longitud y sanitización de presentación.

## Casos de error y estados vacíos
Sesión revocada, valor vacío o contenido inválido.

## Datos / contratos afectados
GuestIdentity/DisplayName asociado a GuestSession.

## Dependencias técnicas y funcionales
Sesión guest vigente.

## Dependencias de tickets
- **depends_on:** EL-TK-075.
- **blocks:** integración de carga EL-EP-005, EL-TK-078, EL-TK-083.

## Pruebas requeridas
Persistencia, sanitización, aislamiento entre sesiones y revocación.

## Observabilidad / auditoría
No registrar el valor completo en logs operativos.

## Prioridad
P0

## Estimación
S

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
