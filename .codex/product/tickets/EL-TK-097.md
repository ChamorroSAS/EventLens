# EL-TK-097 — Autorizar visualización temporal de un derivado privado

## Parent epic
EL-EP-007

## Status
DONE (2026-10-12)

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES

## User story
**Como** invitado u organizador autorizado, **quiero** abrir un derivado visualizable mediante acceso temporal, **para** ver la foto o video sin exponer el almacenamiento privado.

## Alcance funcional
Emitir un grant temporal para visualizar el derivado autorizado de una media, revalidando actor/sesión, evento, visibilidad, lifecycle y estado actual antes de crear la URL privada temporal.

## Fuera de alcance
Descargar originales, crear derivados, publicar media, exponer URLs permanentes o revocar universalmente bytes ya entregados.

## Criterios de aceptación
### Escenario 1
**Dado** media PUBLISHED visible para un invitado autorizado, **cuando** solicita visualizarla, **entonces** recibe una URL temporal limitada al derivado autorizado (thumbnail, display image o video web optimizado).

### Escenario 2
**Dado** un organizador propietario y media visible para su biblioteca según contrato, **cuando** solicita preview, **entonces** recibe únicamente el derivado permitido por su estado y seguridad.

### Escenario 3
**Dado** media retirada, acceso revocado o permiso perdido antes de emitir el grant, **cuando** solicita visualización, **entonces** se deniega sin entregar una nueva URL.

## Reglas de negocio
Storage privado/no navegable (DEC-063). El grant de visualización entrega una URL prefirmada de lectura con TTL corto y no equivale a función de descarga guest ni a autorización permanente. Jamás se entrega URL del original a un invitado (DEC-013, DEC-018).

## Validaciones y permisos
Revalidación server-side por actor/sesión, eventId, mediaId, estado y seguridad antes de ObjectStorage.createDownloadUrl.

## Casos de error y estados vacíos
Derivado inexistente/no listo, media retirada, URL expirada, actor ajeno, storage temporalmente indisponible.

## Datos / contratos afectados
MediaViewGrant, derivativeKey/reference, expiresAt, ObjectStorage.createDownloadUrl.

## Dependencias técnicas y funcionales
Contratos de derivados y almacenamiento privado de EL-EP-006 (EL-TK-035, EL-TK-036, EL-TK-037), lifecycle de EL-EP-003 (EL-TK-072) y acceso/sesión (EL-TK-074, EL-TK-075 para guest; EL-TK-047 para organizador).

## Dependencias de tickets
- **depends_on:** EL-TK-072, EL-TK-074, EL-TK-035, EL-TK-037.
- **blocks:** EL-TK-099, EL-TK-101, EL-TK-102.

## Pruebas requeridas
Guest PUBLISHED, owner autorizado, media retirada, cross-event, URL temporal y derivado no disponible.

## Observabilidad / auditoría
No registrar URL firmada completa ni object keys sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016; DEC-003, DEC-007, DEC-013, DEC-018, DEC-063; EL-EP-007, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10

- **Dictamen requirements_reviewer:** APROBADO sin preguntas bloqueantes.
- **Seguridad en storage:** Conforme a DEC-063, el almacenamiento en S3/MinIO es 100% privado sin acceso anónimo. Cada grant emite una URL prefirmada `GET` con TTL corto vinculada exclusivamente al derivado solicitado.
- **Protección de originales:** El rol guest únicamente tiene habilitados grants de derivados optimizados para navegación (`THUMBNAIL`, `DISPLAY_WEB`, `VIDEO_PREVIEW`).
- **Idempotencia y cache temporal:** La expiración controlada de la URL previene enlaces duraderos compartidos fuera de la sesión autorizada.

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:** Implementado en `@eventlens/media-gallery` (`MediaViewGrantService`) con revalidación estricta server-side del actor (`GUEST` vs `ORGANIZER`), aislamiento de evento, control de lifecycle y estado de media, y entrega de URLs prefirmadas de lectura con TTL corto mediante puerto desacoplado `ObjectStorageDownloadSigner`.
- **Protección de originales:** El rol guest únicamente puede acceder a derivados optimizados (`THUMBNAIL`, `PREVIEW`, `PLAYBACK`) de media `PUBLISHED`, impidiendo la fuga de URLs de originales (DEC-013, DEC-018, DEC-063).
- **Pruebas:** 8 pruebas unitarias PASS e integración PostgreSQL 16. Typecheck y build limpios con 0 errores.
- **Evidencia de auditoría:** Auditoría sanitizada sin exponer URLs firmadas completas ni claves privadas de almacenamiento.
