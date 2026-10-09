# EL-TK-026 — Establecer la portada de un borrador

## Parent epic

EL-EP-002

## Status

SUPERSEDED


**CONFIRMED:** requirements_reviewer aprobó este ticket sin hallazgos pendientes. Véase [dictamen final](../sessions/2026-10-07-el-ep-002-ticket-final-review.md). READY conserva las dependencias de ejecución.

## User story

**Como** organizador propietario, **quiero** establecer una portada válida en mi borrador, **para** personalizar su presentación.

## Criterios de aceptación

**Dado** un organizador activo, DRAFT propio y JPEG/JPG, PNG, HEIC/HEIF o WebP de hasta 25.000.000 bytes, **cuando** la portada queda READY y segura, **entonces** se asigna de forma privada. Tipo real inválido, tamaño superior a 25.000.000 bytes, archivo inseguro, actor no propietario o fallo de carga/proceso no reemplazan la portada vigente.

## Validaciones y permisos

Solo organizador activo y propietario, con propósito `EVENT_COVER`; QR/PIN, flags de invitado y cuenta ajena no autorizan. No define recorte, dimensiones, publicación ni comportamiento posterior a DRAFT/SCHEDULED.

## Datos / contratos afectados

`EventAsset` privado `EVENT_COVER`, referencia/versionado de portada y derivado READY; asignación CAS sin sobrescribir conflicto y cleanup asíncrono que conserva el activo. Véase AQR-002, `media-and-jobs-architecture.md` §Portada.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** ninguno.
- **can_parallelize_with:** EL-TK-021..025, EL-TK-027..031.

## Pruebas requeridas

Formatos válidos, límite, tipo inválido y aislamiento de propietario.

## Observabilidad / auditoría

Auditar cambio y rechazo sin registrar contenido de imagen.

## Prioridad / estimación

P0 / S

## Traceability

Q-004, Q-036, Q-039; DEC-071, DEC-074; AQR-002; EL-EP-002.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Disposición de sustitución — 2026-10-08

**CONFIRMED:** remediación autorizada de gaps 06/07/08/09 de EL-EP-002. EL-TK-026 permanece histórico, no implementado, con criterios y aprobación de 2026-10-07 intactos. No es predecesora de ejecución vigente. Sustituyen su responsabilidad anterior: [EL-TK-049](EL-TK-049.md) carga/confirmación EVENT_COVER → [EL-TK-050](EL-TK-050.md) integración procesamiento seguro → [EL-TK-051](EL-TK-051.md) asignación CAS → [EL-TK-052](EL-TK-052.md) cleanup asíncrono. No se reutiliza 026 ni se reescriben referencias históricas de otros tickets/épicas.
