# EL-TK-101 — Revalidar visibilidad cuando cambia el acceso o la media

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** sistema, **quiero** revalidar el acceso antes de entregar nuevas autorizaciones de visualización, **para** evitar seguir exponiendo media retirada o permisos revocados.

## Alcance funcional
Aplicar revalidación de acceso/estado al emitir nuevas URLs o cargar nuevos bloques de galería y responder de forma segura cuando media, sesión, lifecycle o galería dejan de estar autorizados.

## Fuera de alcance
Revocar universalmente bytes o URLs ya entregados, borrar caches del navegador o ejecutar el retiro/moderación que originó el cambio.

## Criterios de aceptación
### Escenario 1
**Dado** contenido retirado después de una consulta previa, **cuando** se solicita un nuevo grant o página, **entonces** ya no se entrega esa media.

### Escenario 2
**Dado** acceso guest revocado o galería deshabilitada, **cuando** se solicita una nueva autorización, **entonces** se deniega conforme a la policy vigente.

### Escenario 3
**Dado** una URL temporal ya emitida, **cuando** cambia el permiso, **entonces** no se promete revocación universal del byte ya entregado; las nuevas autorizaciones sí quedan bloqueadas.

## Reglas de negocio
La autoridad es el estado vigente del servidor. Caching/URLs previamente emitidas conservan limitaciones técnicas explícitas.

## Validaciones y permisos
Revalidación por evento, media, actor/sesión y lifecycle antes de cada grant/nuevo bloque protegido.

## Casos de error y estados vacíos
Media ya no disponible, sesión revocada, galería apagada, evento cerrado/no disponible y cambio concurrente.

## Datos / contratos afectados
Gallery capabilities, MediaViewGrant authorization, current visibility/version checks.

## Dependencias técnicas y funcionales
EL-TK-096, EL-TK-097 y contratos propietarios de acceso/retiro/moderación.

## Dependencias de tickets
- **depends_on:** EL-TK-096, EL-TK-097, EL-TK-072, EL-TK-074.
- **blocks:** EL-TK-099, EL-TK-102.

## Pruebas requeridas
Retiro concurrente, galería off, revocación de acceso, cross-event y nueva autorización posterior al cambio.

## Observabilidad / auditoría
Registrar denegaciones agregadas/sanitizadas sin URL ni secreto.

## Prioridad / estimación
P0 / S

## Traceability
Q-005, Q-016; DEC-013, DEC-018, DEC-083, DEC-084; EL-EP-007, EL-EP-004, EL-EP-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
