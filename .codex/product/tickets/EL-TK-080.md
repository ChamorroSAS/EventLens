# EL-TK-080 — Regenerar la credencial pública y revocar el enlace anterior

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** organizador, **quiero** regenerar el enlace/QR de acceso de mi evento, **para** invalidar una credencial pública filtrada.

## Alcance funcional
Emitir una nueva PublicAccessCredential, invalidar la anterior y revocar sesiones guest existentes conforme DEC-083.

## Fuera de alcance
Borrar contenido aportado o garantizar revocación de bytes/URLs previamente entregados.

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio, **cuando** el organizador confirma la regeneración, **entonces** recibe una nueva credencial pública y la anterior deja de autorizar nuevos accesos.

### Escenario 2
**Dado** sesiones creadas con la credencial anterior, **cuando** se regenera, **entonces** quedan revocadas para nuevas autorizaciones.

### Escenario 3
**Dado** una carrera entre credencial anterior y regeneración, **cuando** se confirma el cambio, **entonces** la generación vigente prevalece sin ventana inconsistente.

## Reglas de negocio
La nueva credencial es aleatoria, sin PII y no reutiliza la anterior.

## Validaciones y permisos
Solo propietario autorizado; confirmación destructiva/revocatoria explícita.

## Casos de error y estados vacíos
Fallo de persistencia no deja dos generaciones activas.

## Datos / contratos afectados
PublicAccessCredential generation, GuestSession revocation generation.

## Dependencias técnicas y funcionales
Acceso público y sesión guest.

## Dependencias de tickets
- **depends_on:** EL-TK-074, EL-TK-075.
- **blocks:** EL-TK-081, EL-TK-083.

## Pruebas requeridas
Regeneración, enlace viejo, enlace nuevo, sesiones previas, concurrencia y rollback.

## Observabilidad / auditoría
Auditar actor y generación sin registrar credenciales completas.

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
