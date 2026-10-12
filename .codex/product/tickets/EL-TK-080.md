# EL-TK-080 — Regenerar la credencial pública y revocar el enlace anterior

## Parent epic
EL-EP-004

## Status
DONE

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
- **blocks:** EL-TK-081, EL-TK-085.

## Pruebas requeridas
Regeneración, enlace viejo, enlace nuevo, sesiones previas, concurrencia y rollback.

## Observabilidad / auditoría
Auditar actor y generación sin registrar credenciales completas.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-014; DEC-004, DEC-013, DEC-083; EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la emisión de nueva credencial pública, invalidación atómica de la anterior y revocación de sesiones guest previas conforme a DEC-083, consumido por RegenerateAccessDialog con confirmación destructiva visible.

## Implementation Evidence — 2026-10-11
- **Branch:** `feature/EL-TK-078`
- **Backend Architecture (`packages/event-management`):**
  - Implementado `regeneratePublicCredential(pool, command)` en `src/event-public-access.ts`.
  - Generación de nuevo token criptográfico no adivinable (`lookup_key` seguro generado con `crypto.randomBytes(16)`).
  - Transacción atómica: incrementa número de generación (`generation = generation + 1`), desactiva la credencial pública previa e invalida atómicamente todas las sesiones de invitados (`UPDATE guest_session SET revoked_at = NOW() WHERE event_id = $1 AND revoked_at IS NULL`) per DEC-083.
  - Auditoría estructurada `REGENERATE_PUBLIC_CREDENTIAL` registrando la nueva generación sin filtrar el lookup key completo.
- **Test Coverage:**
  - `test/event-access-management.unit.test.ts` (11/11 tests unitarios PASS).
  - `test/guest-access-lifecycle.integration.test.ts` (PASS contra PostgreSQL 16 real).
