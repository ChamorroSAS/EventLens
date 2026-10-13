# EL-TK-126 — Encolar y preparar una exportación asíncrona multipartes

## Parent epic
EL-EP-010

## Status
DONE

## User story
**Como** sistema, **quiero** preparar una exportación en background, **para** empaquetar grandes volúmenes sin bloquear la aplicación.

## Alcance funcional
Publicar job idempotente, revalidar permisos/selección antes de preparar y generar partes ZIP numeradas de tamaño objetivo ~5 GB configurable usando storage de exports separado.

## Fuera de alcance
Servir la descarga al usuario, definir infraestructura/proveedor definitivo o incluir contenido invalidado.

## Criterios de aceptación
### Escenario 1
**Dado** ExportRequest válido, **cuando** worker lo procesa, **entonces** genera manifiesto y partes numeradas en storage privado.

### Escenario 2
**Dado** el volumen supera tamaño de parte, **cuando** se empaqueta, **entonces** se divide en múltiples ZIP sin alterar originales.

### Escenario 3
**Dado** el job se reintenta, **cuando** se ejecuta, **entonces** no duplica partes válidas ni pierde trazabilidad.

## Reglas de negocio
Exportación total es asíncrona; ~5GB es tamaño objetivo configurable. Storage temporal operacional no cuenta a cuota comercial.

## Validaciones y permisos
Sistema revalida la autorización actual antes de preparar.

## Casos de error y estados vacíos
Media faltante, storage lleno/temporal error, job replay, permiso revocado y fallo de empaquetado.

## Datos / contratos afectados
ExportJob, ExportManifest, ExportPart, JobQueue, ObjectStorage exports.

## Dependencias técnicas y funcionales
JobQueue PostgreSQL, ObjectStorage privado y snapshot EL-TK-125.

## Dependencias de tickets
- **depends_on:** EL-TK-125, EL-TK-055
- **blocks:** EL-TK-127, EL-TK-128, EL-TK-130, EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
Job async, multipart, replay, fallo parcial, revalidación y cleanup de outputs fallidos.

## Observabilidad / auditoría
Métricas de job/bytes/partes sin nombres sensibles en logs.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-047, DEC-049, DEC-063, DEC-064, DEC-079, DEC-090; EL-EP-010.

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

## Evidencia de implementación y verificación — 2026-10-12

- **Paquete:** `@eventlens/export-management` (MOD-005). Migración `202610120054_export_preparation`: columnas de generación/manifiesto/fallo en `export_request`, `part_number` en `export_request_item`, índice media→exports y tabla `export_part` (checkpoint por parte con estado, key, tamaño y SHA-256). Dependencias nuevas: `@eventlens/job-queue` y `fflate` (solo pruebas, lector ZIP independiente); lockfile actualizado.
- **Job idempotente:** `ExportRequestService` publica `EXPORT_PREPARE` (cola `exports`, dedup `export-prepare:{id}:g1`) en la misma transacción que la solicitud (EL-TK-125); si la solicitud se revierte no queda job. `ExportResourcePolicy` usa la fila del export como recurso del JobQueue: un export terminal o de otra generación no se puede reservar ni reanudar.
- **Preparación (`ExportPreparationWorker`):** reserva con lease y heartbeat periódico; revalida permisos al empezar y de nuevo justo antes de promover; planifica partes de forma determinista (~5 GB decimales configurable, archivos nunca partidos, un archivo mayor al objetivo ocupa su parte); escribe cada parte como ZIP64 almacenado en streaming (memoria acotada, CRC-32 y verificación de tamaño/SHA-256 contra el manifiesto), en una key única por intento dentro de un namespace privado de exports; promueve cada parte con `checkpoint` con fencing; reutiliza partes válidas en reintentos; escribe un manifiesto sin nombres de archivo; completa el job de forma atómica con el efecto de dominio. Deja `prepared_at` y el manifiesto; la disponibilidad (AVAILABLE/48h) la publica EL-TK-127 de forma atómica en la misma finalización del job.
- **Errores:** transitorios -> RETRYING con backoff y presupuesto de intentos (DEC-064), agotado -> DEAD/FAILED `RETRIES_EXHAUSTED`; origen ausente o que no coincide con el manifiesto -> FAILED terminal; permiso revocado o media retirada -> INVALIDATED (distinto de FAILED); lease perdido -> el worker se abstiene y borra solo su salida no promovida. Toda salida de un intento fallido y todas las de un export terminal se eliminan del storage.
- **Pruebas:** `export-preparation.unit.test.ts` (11/11: planificación, nombres, ZIP64 leído con `fflate`, CRC, checksum/tamaño, NOT_FOUND vs TEMPORARY, cancelación, trozos acotados) y `export-preparation.integration.test.ts` (11/11, PostgreSQL 16 real + storage en memoria). Paquete completo 39/39 y `scripts/workspace.mjs build` OK.
- **Límites declarados:** el puerto `ExportObjectStorage` está probado con un storage en memoria; no se evaluó un proveedor real ni multipart contra MinIO/S3, ni volúmenes de ~5 GB (gate EXPORT-001 permanece NOT_EVALUATED). La revalidación incluida (evento/owner y media retirada) cubre el caso previo a preparar; la invalidación de exports ya AVAILABLE y de grants es EL-TK-128.