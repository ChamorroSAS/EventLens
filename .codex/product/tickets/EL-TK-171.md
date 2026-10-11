# EL-TK-171 — Ejecutar backups PostgreSQL y retención operativa mínima

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `PostgresBackupService`, `FilesystemProtectedBackupStorage` y `RealPostgresBackupSource` en `@eventlens/observability` conforme a los criterios de aceptación y DEC-034, DEC-062, Q-021:
- Automatización y ejecución de backups completos diarios (`executeDailyBackup`) generando artefactos comprimidos con checksum SHA-256 verificado, manifiesto inmutable y retención mínima de 7 días (`retentionUntil >= 7d`).
- Almacenamiento protegido externo desacoplado del host/contenedor efímero (`FilesystemProtectedBackupStorage`), verificando localidad off-host (`isOffHost = true`) y rechazando filesystems efímeros (`EPHEMERAL_STORAGE_FORBIDDEN`, Escenario 2).
- Soporte WAL y cobertura PITR (`evaluateWalCoverage`), extrayendo LSNs reales de PostgreSQL 16 (`pg_current_wal_lsn`), evaluando RPO objetivo ≤ 1h (`isWithinRpoTarget`) y detectando discontinuidades en la secuencia WAL (`WAL_GAP_DETECTED`).
- Poda de retención automática (`applyRetention` / `pruneExpired`), eliminando backups con `retentionUntil <= now` y manteniendo copias activas en disco.
- Verificación de integridad byte a byte (`verifyBackupIntegrity`), detectando discrepancias de checksum SHA-256 o corrupción en el stream gzip.
- Detección de fallos e integración con alertamiento operativo (`handleBackupSignal`), emitiendo `BackupExecutionSignal` y disparando alertas `CRITICAL` en `InfrastructureAlertService` con sanitización estricta de credenciales/DSN (Escenario 3).
- Control de acceso que restringe la ejecución de backups a actores autorizados (`SYSTEM`, `ADMIN`).
- Suite de pruebas completa: 10 pruebas (7 unitarias y 3 de integración contra PostgreSQL 16 real) con 100% de éxito.

## User story
**Como** sistema, **quiero** producir backups completos diarios y soporte PITR, **para** cumplir la base de recuperación de la Beta sin depender del host activo.

## Alcance funcional
Implementar/automatizar backups completos diarios con retención mínima de 7 días y soporte de WAL/PITR conforme RPO, manteniendo copias protegidas fuera del host app/DB.

## Fuera de alcance
Elegir proveedor definitivo de producción, restaurar automáticamente en incidente o certificar RTO sin prueba.

## Criterios de aceptación
### Escenario 1
**Dado** llega ventana diaria, **cuando** scheduler ejecuta, **entonces** se produce backup verificable y se aplica retención.

### Escenario 2
**Dado** el host Beta falla, **cuando** se evalúa ubicación, **entonces** existe copia protegida fuera del host.

### Escenario 3
**Dado** backup falla, **cuando** se ejecuta, **entonces** queda fallo detectable para alertamiento.

## Reglas de negocio
PITR producción obligatorio; RPO objetivo ≤1h; backup completo diario ≥7d. Datos persistentes no dependen de filesystem efímero.

## Validaciones y permisos
Credenciales/operación de backup restringidas.

## Casos de error y estados vacíos
Backup incompleto, WAL gap, destino no disponible, retención fallida y espacio insuficiente.

## Datos / contratos afectados
BackupRun, BackupArtifactRef, WAL checkpoint/coverage.

## Dependencias técnicas y funcionales
PostgreSQL 16, RecoveryAuthority y almacenamiento protegido externo.

## Dependencias de tickets
- **depends_on:** baseline EL-TD-008 y DEC-062
- **blocks:** EL-TK-172, EL-TK-174, EL-TK-176

## Pruebas requeridas
Backup éxito/fallo, retención, ubicación externa, WAL continuity y secretos.

## Observabilidad / auditoría
Métricas de duración/tamaño/resultado sin credenciales.

## Prioridad / estimación
P0 / M

## Traceability
Q-021; DEC-034, DEC-062; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
