# EL-TK-084 — Emitir la credencial pública inicial y publicar el acceso de un evento

## Parent epic
EL-EP-004

## Status
DONE

## User story
**Como** organizador propietario, **quiero** emitir la credencial pública inicial de mi evento al publicarlo o preparar su acceso, **para** que los invitados cuenten con un enlace y QR difícil de adivinar sin exponer el identificador interno ni PII.

## Alcance funcional
Generar de manera segura y determinista la primera PublicAccessCredential aleatoria asociada al evento, inicializar la generación de acceso en estado activo y vincular el estado de protección por PIN (desactivado o inicial según EL-TK-027).

## Fuera de alcance
Resolver la credencial por un invitado (EL-TK-074), regenerar la credencial tras filtración (EL-TK-080), generar la imagen o payload de QR (EL-TK-081) o alterar el lifecycle temporal del evento (EL-EP-003).

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio sin credencial pública previa y sin PIN configurado, **cuando** el organizador emite o habilita el acceso inicial, **entonces** se genera y persiste una PublicAccessCredential única, no indexable y con generation=1, disponible para compartir.

### Escenario 2
**Dado** un evento propio que tiene un PIN inicial configurado en EL-TK-027, **cuando** se emite el acceso inicial, **entonces** la credencial pública queda vinculada a la exigencia de PIN para las sesiones guest.

### Escenario 3
**Dado** un evento que ya posee una credencial pública vigente, **cuando** se solicita la emisión inicial, **entonces** la operación es idempotente y no sobreescribe la credencial existente (la sustitución requiere regeneración explícita vía EL-TK-080).

## Reglas de negocio
La credencial es aleatoria, difícil de adivinar y no contiene identificadores internos predecibles ni PII. La emisión inicial fija generation=1. No indexable.

## Validaciones y permisos
Solo el organizador propietario autenticado puede emitir o publicar el acceso inicial. Operación atómica y fail-closed ante errores de concurrencia.

## Casos de error y estados vacíos
Evento inexistente, actor no autorizado o conflicto de concurrencia devuelven error estándar sanitizado sin exponer secretos.

## Datos / contratos afectados
PublicAccessCredential (lookup key, token hash, eventId, generation=1, pinRequired, createdAt, revokedAt=null).

## Dependencias técnicas y funcionales
Evento creado en EL-EP-002 (EL-TK-020) y PIN inicial opcional (EL-TK-027).

## Dependencias de tickets
- **depends_on:** EL-TK-020, EL-TK-027.
- **blocks:** EL-TK-074, EL-TK-081, EL-TK-085.

## Pruebas requeridas
Generación criptográfica aleatoria, persistencia con y sin PIN, idempotencia ante reintento, aislamiento de actor y no indexabilidad.

## Observabilidad / auditoría
Auditar emisión de acceso inicial con actor y eventId, sin registrar el secreto completo de la credencial en logs operativos.

## Prioridad / estimación
P0 / S

## Traceability
Q-005, Q-037; DEC-004, DEC-013, DEC-072; EL-EP-004, EL-EP-002.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el comando de emisión inicial de PublicAccessCredential e inicialización de acceso del evento, consumido por la acción de publicar/compartir del organizador conforme a DEC-072.
