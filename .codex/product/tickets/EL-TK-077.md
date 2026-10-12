# EL-TK-077 — Registrar nombre o apodo del aportante en la sesión guest

## Parent epic
EL-EP-004

## Status
DONE

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

## Prioridad / estimación
P0 / S

## Traceability
Q-014, Q-025; DEC-013, DEC-041; EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la asociación de nombre o apodo sanitizado de presentación en la sesión guest sin crear perfil nominal, consumido por GuestIdentityForm («¿Quién aporta?») conforme al handoff UI/UX de EL-EP-004.
