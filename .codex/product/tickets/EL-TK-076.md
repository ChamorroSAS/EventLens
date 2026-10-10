# EL-TK-076 — Registrar consentimiento versionado antes de la primera carga

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** invitado, **quiero** aceptar explícitamente las condiciones aplicables antes de mi primera carga, **para** que mi consentimiento quede trazable sin crear una cuenta.

## Alcance funcional
Presentar/aceptar la versión vigente de condiciones y privacidad antes de habilitar la primera carga de una sesión guest.

## Fuera de alcance
Aprobación jurídica final, reconsentimiento automático por toda actualización documental o eliminación de contenido.

## Criterios de aceptación
### Escenario 1
**Dado** una sesión guest que aún no aceptó la versión requerida, **cuando** intenta iniciar la primera carga, **entonces** debe aceptar explícitamente antes de continuar.

### Escenario 2
**Dado** aceptación válida, **cuando** se registra, **entonces** se conserva versión, fecha/hora, evento y sesión de forma mínima y auditable.

### Escenario 3
**Dado** que el invitado cancela, **cuando** no acepta, **entonces** no se registra consentimiento ni se habilita la carga.

## Reglas de negocio
Leer documentos no equivale a aceptar. Checkbox/acción no preseleccionada.

## Validaciones y permisos
Solo sesión guest vigente del evento; no asociar identidad fuerte inexistente.

## Casos de error y estados vacíos
Versión documental no disponible, sesión revocada o conflicto de versión impide registrar aceptación parcial.

## Datos / contratos afectados
ConsentAcceptance, documentVersion, acceptedAt, eventId, guestSessionId.

## Dependencias técnicas y funcionales
Contratos legales versionados y sesión guest.

## Dependencias de tickets
- **depends_on:** EL-TK-075.
- **blocks:** consumidores de primera carga en EL-EP-005, EL-TK-083.

## Pruebas requeridas
Primera aceptación, cancelación, versión distinta, sesión revocada e idempotencia.

## Observabilidad / auditoría
Auditar versión y resultado sin almacenar contenido legal duplicado ni secretos de sesión.

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
