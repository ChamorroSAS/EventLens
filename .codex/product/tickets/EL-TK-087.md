# EL-TK-087 — Emitir una URL temporal para carga directa al object storage privado

## Parent epic
EL-EP-005

## Status
READY

## User story
**Como** invitado con un intento autorizado, **quiero** obtener una URL temporal de carga, **para** transferir el original directamente al almacenamiento privado sin pasar los bytes por la aplicación.

## Alcance funcional
Emitir una autorización temporal de carga ligada a un UploadAttempt vigente, evento, sesión, objeto esperado y límites declarados usando el contrato neutral de ObjectStorage.

## Fuera de alcance
Seleccionar proveedor S3 definitivo, confirmar el objeto, procesar multimedia o exponer buckets públicos.

## Criterios de aceptación
### Escenario 1
**Dado** un intento autorizado y vigente, **cuando** solicita transferencia, **entonces** recibe una URL/credencial temporal limitada al objeto esperado.

### Escenario 2
**Dado** un intento cancelado, vencido o cuya sesión ya no tiene capacidad, **cuando** solicita una nueva URL, **entonces** no se emite autorización nueva.

### Escenario 3
**Dado** un reintento elegible, **cuando** se renueva la autorización temporal, **entonces** conserva el mismo intento y reserva sin duplicarlos.

## Reglas de negocio
Storage privado/no navegable; la app no sirve bytes permanentes. La autorización temporal no equivale a aceptación del archivo.

## Validaciones y permisos
Intento vigente, sesión autorizada y object key perteneciente al intento/evento.

## Casos de error y estados vacíos
Intento inexistente, expirado, cancelado, storage indisponible o conflicto de versión.

## Datos / contratos afectados
ObjectStorage.createUploadUrl, UploadAttempt, objectKey, expiresAt.

## Dependencias técnicas y funcionales
Contrato ObjectStorage de DEC-063 y reserva de EL-TK-086.

## Dependencias de tickets
- **depends_on:** EL-TK-086.
- **blocks:** EL-TK-088, EL-TK-091, EL-TK-094, EL-TK-095.

## Pruebas requeridas
Scope de URL, expiración, renovación, intento cancelado, aislamiento entre eventos y no exposición pública.

## Observabilidad / auditoría
No registrar URL firmada completa ni credenciales de storage.

## Prioridad / estimación
P0 / S

## Traceability
Q-008, Q-014; DEC-013, DEC-063, DEC-080, DEC-085; EL-EP-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la emisión de URLs firmadas temporales delegadas al contrato neutral ObjectStorage (DEC-063), permitiendo transferencia directa sin pasar bytes por la aplicación.
