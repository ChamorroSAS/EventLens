# EL-TK-079 — Cambiar el PIN de acceso y revocar sesiones guest existentes

## Parent epic
EL-EP-004

## Status
READY

## User story
**Como** organizador, **quiero** cambiar el PIN de acceso de mi evento, **para** cortar accesos anteriores cuando sea necesario.

## Alcance funcional
Actualizar el PIN protegido de un evento y revocar las sesiones guest existentes conforme DEC-083.

## Fuera de alcance
Regenerar la credencial pública, eliminar media ya aportada o revocar universalmente URLs/bytes ya emitidos.

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio con PIN, **cuando** el organizador cambia el PIN, **entonces** las sesiones guest existentes quedan revocadas y el nuevo PIN aplica a nuevas autorizaciones.

### Escenario 2
**Dado** una sesión anterior revocada, **cuando** intenta obtener nuevas capacidades, **entonces** se deniega aunque conserve una cookie/token antiguo.

## Reglas de negocio
Cambio de PIN revoca sesiones guest previas; no borra aportes existentes.

## Validaciones y permisos
Solo propietario autorizado; PIN cumple contrato vigente.

## Casos de error y estados vacíos
Conflicto de revisión, PIN inválido o actor no autorizado no producen revocación parcial.

## Datos / contratos afectados
PIN hash/configuration, GuestSession revocation generation.

## Dependencias técnicas y funcionales
Configuración de acceso de EL-EP-002 y sesiones guest.

## Dependencias de tickets
- **depends_on:** EL-TK-027, EL-TK-075.
- **blocks:** EL-TK-083.

## Pruebas requeridas
Cambio exitoso, sesiones anteriores revocadas, nuevo acceso, concurrencia y rollback.

## Observabilidad / auditoría
Auditar cambio/revocación sin registrar PIN ni tokens.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-014; DEC-004, DEC-013, DEC-083; EL-EP-004, EL-EP-002.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el cambio de PIN por el organizador y la revocación en cascada de generaciones de sesiones guest previas conforme a DEC-083, consumido por EventAccessSettings con advertencia de revocación y sin mostrar PIN almacenado.
