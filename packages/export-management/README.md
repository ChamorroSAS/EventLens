# Export Management: MOD-005

`@eventlens/export-management` implementa la frontera de MOD-005 (Recuperación de originales por exportación) conforme a `EL-EP-010`, `DEC-046`, `DEC-047`, `DEC-048`, `DEC-049`, `DEC-063`, `DEC-064`, `DEC-079` y `DEC-090`.

El paquete es dueño de las tablas `export_request`, `export_request_item` y `export_part` (migraciones `202610120053..55`). No lee ni escribe tablas ajenas: consulta `event` y `media_catalog` solo para autorizar y congelar el manifiesto, y consume JobQueue y ObjectStorage mediante puertos.

## Capabilities

### 1. Solicitud de exportación con snapshot fijo (EL-TK-125)
- `ExportRequestService.requestExport`: solo el organizador propietario; eventos suspendidos o en eliminación se deniegan.
- El manifiesto se congela en una sola sentencia con media `PUBLISHED`/`HIDDEN` con original completo (DEC-046); la media posterior nunca lo amplía (DEC-090).
- Registra exclusiones por estado (y `MISSING_ORIGINAL`); sin media elegible responde `NO_ELIGIBLE_MEDIA` sin persistir nada.
- Idempotente por organizador y clave; una sola exportación activa por evento (`EXPORT_IN_PROGRESS`).

### 2. Preparación asíncrona multipartes (EL-TK-126)
- El job `EXPORT_PREPARE` (cola `exports`) se publica en la misma transacción de la solicitud.
- `ExportPreparationWorker`: reserva con lease/heartbeat, revalida permisos al preparar y antes de promover, planifica partes (~5 GB decimales configurables, archivos nunca partidos) y escribe cada parte como ZIP64 almacenado en streaming, verificando tamaño y SHA-256 contra el manifiesto.
- Salidas únicas por intento en un namespace privado de exports; cada parte se promueve con checkpoint fenced y las partes válidas se reutilizan en reintentos.
- Fallos transitorios con presupuesto de intentos (DEC-064); origen ausente o alterado → `FAILED`; media retirada o permiso revocado → `INVALIDATED`; las salidas de un intento fallido se eliminan.

### 3. Disponibilidad y expiración (EL-TK-127)
- `publishExportAvailability` / `ExportAvailabilityService`: `AVAILABLE` solo con todas las partes y el manifiesto consistentes, ventana de 48 h con el reloj de la base de datos (DEC-048); idempotente.
- `ExportExpiryReconciler`: `AVAILABLE` → `EXPIRED` con `SKIP LOCKED` y limpieza encolada de forma idempotente; `isExportAvailable` bloquea nuevos grants aunque el reconciliador se retrase.
- `ExportCleanupWorker`: elimina partes y manifiesto; agotados los reintentos queda `DEAD` sin deshacer la expiración.
- Aviso hacia EL-EP-013 mediante el puerto transaccional `ExportLifecycleNotifier` (sin dependencia del paquete de notificaciones).

## Estructura

| Archivo | Responsabilidad |
|---|---|
| `src/contracts.ts` | Tipos, errores y puertos públicos (`ExportObjectStorage`, `ExportJobPublisher`, `ExportRevalidator`, `ExportLifecycleNotifier`, `ExportAuditSink`) |
| `src/export-request.ts` | `ExportRequestService` (EL-TK-125) |
| `src/export-job.ts` | Constantes de cola/tipo, `exportJobSpec`, `exportCleanupJobSpec` y `ExportResourcePolicy` |
| `src/export-preparation.ts` | `ExportPreparationWorker` y `DefaultExportRevalidator` (EL-TK-126) |
| `src/planning.ts` / `src/zip.ts` | Planificación determinista de partes y escritor ZIP64 en streaming |
| `src/export-availability.ts` | Disponibilidad, expiración e `isExportAvailable` (EL-TK-127) |
| `src/export-cleanup.ts` | `ExportCleanupWorker` |

## Límites conocidos
- El puerto `ExportObjectStorage` se probó con un storage en memoria; no se evaluó un proveedor real ni multipart contra S3/MinIO ni volúmenes de ~5 GB (gate `EXPORT-001` permanece `NOT_EVALUATED`).
- Pendiente en otros tickets de EL-EP-010: invalidación de exportaciones ya disponibles (EL-TK-128), grants de descarga por parte (EL-TK-129), regeneración (EL-TK-130), consulta de estado (EL-TK-131) y UI/API HTTP (EL-TK-132).

## Pruebas
- `pnpm --filter @eventlens/export-management test:unit`
- `pnpm --filter @eventlens/export-management test:integration` (requiere `DATABASE_URL` de PostgreSQL 16 con las migraciones aplicadas).
