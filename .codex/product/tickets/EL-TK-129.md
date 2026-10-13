# EL-TK-129 — Autorizar la descarga temporal de una parte de exportación

## Parent epic
EL-EP-010

## Status
DONE

## User story
**Como** organizador propietario, **quiero** descargar una parte disponible de mi exportación, **para** recuperar el paquete sin exponer storage públicamente.

## Alcance funcional
Emitir URL temporal de lectura para una ExportPart AVAILABLE tras revalidar owner, exportación, expiración e invalidación actual.

## Fuera de alcance
Descarga guest, URLs permanentes, reactivar una exportación expirada o servir partes no disponibles.

## Criterios de aceptación
### Escenario 1
**Dado** exportación AVAILABLE y vigente, **cuando** owner solicita una parte, **entonces** recibe grant temporal para esa parte.

### Escenario 2
**Dado** exportación EXPIRED/INVALIDATED/FAILED, **cuando** solicita, **entonces** no se emite URL.

### Escenario 3
**Dado** actor de otro evento, **cuando** solicita, **entonces** se deniega sin filtrar metadata.

## Reglas de negocio
48h es vigencia de la exportación; el grant individual puede tener TTL técnico menor.

## Validaciones y permisos
Owner del evento y exportación; autorización revalidada.

## Casos de error y estados vacíos
Parte inexistente, export inválido, actor ajeno, URL signing error y expiración concurrente.

## Datos / contratos afectados
ExportPartDownloadGrant, partId, expiresAt técnico.

## Dependencias técnicas y funcionales
EL-TK-127, EL-TK-128 y ObjectStorage.createDownloadUrl.

## Dependencias de tickets
- **depends_on:** EL-TK-127, EL-TK-128
- **blocks:** EL-TK-132, EL-TK-133

## Pruebas requeridas
Disponible, expirada, invalidada, cross-event, TTL y carrera.

## Observabilidad / auditoría
No loggear URL firmada ni object key.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-048, DEC-063, DEC-090; EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-009/013/046..049/063/064/075/079/090 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §9.1..8; sin componentes nuevos ni centros de exportación paralelos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Evidencia de implementación y verificación — 2026-10-13

- **Servicio y contratos:** `ExportPartDownloadGrantService` en `@eventlens/export-management` (`src/export-part-grant.ts`); tipos `RequestExportPartDownloadGrantCommand`, `ExportPartDownloadGrant` y puerto desacoplado `ExportPartDownloadSigner` (`src/contracts.ts`).
- **Reglas y seguridad:**
  - Solo el organizador propietario del evento y de la exportación puede solicitar grants; actor ajeno o evento no coincidente devuelven `UNAUTHORIZED` sin enumeración.
  - Evento en estado `SUSPENDED`, `PENDING_DELETION`, `ARCHIVED` o `DELETED` deniega con `EVENT_NOT_ELIGIBLE`.
  - Revalidación obligatoria previa a la emisión del grant (DEC-090 / EL-TK-128): si se detecta retiro de medio (`MEDIA_WITHDRAWN`) o revocación, la exportación pasa inmediatamente a `INVALIDATED` y se deniega con `EXPORT_INVALIDATED`.
  - Ventana de vigencia (48 h, DEC-048): evaluada con `isExportAvailable`; exportación vencida o con status `EXPIRED` deniega con `EXPORT_EXPIRED`.
  - Parte validada: debe existir, corresponder a la generación actual y estar en estado `READY` con `object_key`; de lo contrario responde `PART_NOT_FOUND`.
  - URL temporal de 60 a 3600 segundos (default 900 s / 15 min), con descarga forzada y nombre de archivo canónico `event-<id>-export-part-<num>.zip`.
- **Auditoría:** emite `EXPORT_PART_GRANT_ISSUED` con conteos y bytes, sin registrar URLs firmadas ni object keys de storage.
- **Pruebas:** `test/export-part-grant.unit.test.ts` (7/7 unitarias PASS). Build de `@eventlens/export-management` limpio.
- **Desbloquea:** EL-TK-132 (integración en biblioteca y cliente Angular) y EL-TK-133 (validación integrada E2E).
