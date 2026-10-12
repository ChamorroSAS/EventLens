# EL-TK-101 — Revalidar visibilidad cuando cambia el acceso o la media

## Parent epic
EL-EP-007

## Status
DONE

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES

## User story
**Como** sistema, **quiero** revalidar el acceso antes de entregar nuevas autorizaciones de visualización, **para** evitar seguir exponiendo media retirada o permisos revocados.

## Alcance funcional
Aplicar revalidación server-side de acceso/estado al emitir nuevas URLs o cargar nuevos bloques de galería y responder de forma segura cuando media, sesión, lifecycle o galería dejan de estar autorizados.

## Fuera de alcance
Revocar universalmente bytes o URLs ya entregados, borrar cachés del navegador del cliente o ejecutar el retiro/moderación que originó el cambio.

## Criterios de aceptación
### Escenario 1
**Dado** contenido retirado o despublicado después de una consulta previa, **cuando** se solicita un nuevo grant o página, **entonces** ya no se entrega esa media ni se generan nuevas URLs temporales.

### Escenario 2
**Dado** acceso guest revocado o galería deshabilitada en tiempo real, **cuando** se solicita una nueva autorización, **entonces** se deniega conforme a la policy vigente.

### Escenario 3
**Dado** una URL temporal ya emitida, **cuando** cambia el permiso, **entonces** no se promete revocación universal física del byte ya entregado; las nuevas solicitudes de grant o navegación sí quedan bloqueadas.

## Reglas de negocio
La autoridad final es el estado vigente del servidor. Caching local o URLs previamente emitidas conservan limitaciones técnicas explícitas (DEC-063, DEC-084). Jamás se emiten nuevas autorizaciones si el contenido o la sesión perdieron validez.

## Validaciones y permisos
Revalidación por evento, media, actor/sesión y lifecycle antes de cada grant o nuevo bloque protegido.

## Casos de error y estados vacíos
Media ya no disponible, sesión revocada, galería apagada, evento cerrado/no disponible y cambio concurrente.

## Datos / contratos afectados
Gallery capabilities, MediaViewGrant authorization, current visibility/version checks.

## Dependencias técnicas y funcionales
EL-TK-096, EL-TK-097 y contratos propietarios de acceso/retiro/moderación (EL-TK-072, EL-TK-074, EL-TK-083).

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

## Readiness de implementación y UI/UX — 2026-10-10

- **Dictamen requirements_reviewer:** APROBADO sin preguntas bloqueantes.
- **Autoridad server-side:** Toda solicitud de nuevo grant de visualización (`MediaViewGrant`) o nuevo cursor de página comprueba en la base de datos:
  1. Que el `mediaId` continúe en estado `PUBLISHED`.
  2. Que `guest_gallery_enabled` permanezca activo en el evento.
  3. Que el lifecycle del evento no esté en un estado prohibitivo según EL-TK-072.
  4. Que la sesión guest no haya sido revocada (p. ej. cambio/desactivación de PIN en EL-TK-079 o regeneración en EL-TK-080).
- **Límites de revocación documentados:** No se falsea la seguridad prometiendo cancelación de transferencias HTTP en vuelo o borrado de memoria RAM/caché en el navegador del usuario. El control se ejerce mediante TTLs cortos y bloqueo inmediato de nuevas firmas.

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:** Implementado `MediaVisibilityRevalidator` en `@eventlens/media-gallery` (`packages/media-gallery/src/visibility-revalidator.ts`) con revalidación server-side de permisos, lifecycle de eventos, estado de sesión guest, conmutación de galería (`guest_gallery_enabled`), consistencia de versión/revisión concurrente (`expectedRevision`) y partición batch de visibilidad (`revalidateBatchVisibility`).
- **Límites de revocación respetados:** Conforme a DEC-063 y DEC-084, no se promete revocación física de bytes ya entregados en caché local; cualquier nueva solicitud de grant, navegación de cursor o batch de miniaturas es rechazada de inmediato al revocarse los permisos o retirarse el medio.
- **Pruebas:** 13 pruebas unitarias PASS e integración PostgreSQL 16 preparada. Typecheck y compilación con 0 errores.
- **Observabilidad:** Registro de eventos de auditoría sanitizados en `MediaGalleryAuditSink` con código de denegación sin exponer tokens ni secretos.
