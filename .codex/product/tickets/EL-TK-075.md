# EL-TK-075 — Validar PIN opcional y establecer una sesión anónima guest

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** invitado, **quiero** validar el PIN cuando el evento lo exige, **para** obtener una sesión anónima limitada al evento sin registrarme.

## Alcance funcional
Validar el PIN protegido, crear una sesión guest revocable y emitir credencial segura asociada al evento.

## Fuera de alcance
Recuperar una sesión perdida, registrar consentimiento o identidad de aportante.

## Criterios de aceptación
### Escenario 1
**Dado** un evento con PIN habilitado, **cuando** el invitado introduce el PIN correcto, **entonces** se crea una sesión guest limitada al evento.

### Escenario 2
**Dado** un PIN incorrecto, **cuando** se intenta validar, **entonces** se deniega sin revelar información adicional y aplica rate limiting.

### Escenario 3
**Dado** un evento sin PIN, **cuando** la credencial pública es válida, **entonces** puede establecerse la sesión según policy sin pedir PIN.

## Reglas de negocio
La sesión no autentica identidad personal y no autoriza recursos de otros invitados.

## Validaciones y permisos
PIN de seis dígitos conforme configuración vigente; rate limiting obligatorio.

## Casos de error y estados vacíos
PIN incorrecto, sesión revocada, evento no disponible o credencial pública inválida.

## Datos / contratos afectados
GuestSession, PIN hash/configuration, PublicAccessCredential.

## Dependencias técnicas y funcionales
Consume PIN configurado en EL-EP-002 y acceso público vigente.

## Dependencias de tickets
- **depends_on:** EL-TK-027, EL-TK-074.
- **blocks:** EL-TK-076, EL-TK-077, EL-TK-078, EL-TK-082, EL-TK-083.

## Pruebas requeridas
PIN correcto/incorrecto, sin PIN, rate limit, cookie/token seguro, aislamiento entre sesiones y revocación.

## Observabilidad / auditoría
No registrar PIN ni secreto de sesión; métricas de intentos/rate limit sanitizadas.

## Prioridad
P0

## Estimación
M

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
