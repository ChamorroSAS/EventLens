# Runbook Operacional: RecoveryAuthority Persistence (DEC-112, EL-TK-222)

## 1. Resumen y Principio de Operación

El adaptador `DurableRecoveryAuthorityAdapter` (`@eventlens/identity`) proporciona persistencia criptográfica e independiente del timeline de PostgreSQL para todas las operaciones sensibles (revocaciones de credenciales, rotaciones, revocaciones de sesión, elevación y provisionamiento).

**Principio de diseño:**  
El journal append-only (`recovery-journal.ndjson`) y los checkpoints consistentes (`recovery-checkpoint.json`) residen en un volumen de almacenamiento separado (`RECOVERY_JOURNAL_DIR`), garantizando que **ninguna restauración PITR de PostgreSQL (Point-in-Time Recovery) pueda resucitar credenciales o sesiones previamente revocadas**.

---

## 2. Despliegue Inicial

### 2.1 Requisitos de Infraestructura
- Directorio en volumen persistente montado independientemente de PostgreSQL (ej. `/var/lib/eventlens/recovery` o volumen EBS/Ceph dedicado).
- Permisos de sistema de archivos restringidos: `0700` (`rwx------`) para el proceso de Node.js (`node:node`).
- Fsync habilitado en el sistema de archivos subyacente.

### 2.2 Variables de Entorno
```bash
# Directorio donde se almacenará el journal y checkpoints
RECOVERY_JOURNAL_DIR=/var/lib/eventlens/recovery

# Fsync sincrónico en cada append de PREPARE y ACK (por defecto: true)
RECOVERY_STRICT_FSYNC=true

# Epoch inicial (solo en bootstrap inicial de infraestructura nueva)
RECOVERY_INITIAL_EPOCH=1
```

### 2.3 Inicialización
Al arrancar el servicio por primera vez:
1. Si el directorio `RECOVERY_JOURNAL_DIR` no existe, se crea automáticamente con permisos `0700`.
2. Si `recovery-journal.ndjson` no existe, el adaptador inicia con `sequence: 0n` y `lastRecordHash: 000...000` (hash Génesis).
3. Si existe un journal previo, se reproduce secuencialmente verificando:
   - Monotonicidad estricta de secuencias (`seq == expectedSeq`).
   - Encadenamiento criptográfico SHA-256 (`record.previousHash == previous.recordHash`).
   - Integridad del digest de cada registro.

---

## 3. Configuración Operacional

### 3.1 Integración en el Proceso API/Worker
```typescript
import { DurableRecoveryAuthorityAdapter, Mod001RecoveryCoordinator } from '@eventlens/identity';

const recoveryAuthority = new DurableRecoveryAuthorityAdapter({
  storageDir: process.env.RECOVERY_JOURNAL_DIR || '/var/lib/eventlens/recovery',
  strictFsync: process.env.RECOVERY_STRICT_FSYNC !== 'false'
});

await recoveryAuthority.initialize();
```

---

## 4. Verificación de Salud e Integridad

### 4.1 Health Check Automatizado
El adaptador expone el método `assertOperational()`, que valida:
- Inicialización correcta.
- Permisos de lectura/escritura en `RECOVERY_JOURNAL_DIR`.
- Ausencia de barreras activas no reconciliadas.

Comando CLI / diagnóstico:
```bash
# Inspeccionar estado de archivos del journal
ls -lha $RECOVERY_JOURNAL_DIR

# Comprobar últimas líneas del journal
tail -n 5 $RECOVERY_JOURNAL_DIR/recovery-journal.ndjson

# Inspeccionar último checkpoint
cat $RECOVERY_JOURNAL_DIR/recovery-checkpoint.json | jq .
```

---

## 5. Backup Independiente del Journal

**Regla de oro:** El backup del RecoveryAuthority **NUNCA** debe acoplarse ni incluirse en el dump/snapshot de PostgreSQL.

### 5.1 Procedimiento de Backup
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DEST="/mnt/secure-backups/recovery/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DEST"

# 1. Copiar checkpoint consistente primero
cp "$RECOVERY_JOURNAL_DIR/recovery-checkpoint.json" "$BACKUP_DEST/"

# 2. Copiar journal append-only
cp "$RECOVERY_JOURNAL_DIR/recovery-journal.ndjson" "$BACKUP_DEST/"

# 3. Generar checksums SHA-256
sha256sum "$BACKUP_DEST"/* > "$BACKUP_DEST/checksums.sha256"

echo "Backup de RecoveryAuthority completado en $BACKUP_DEST"
```

---

## 6. Restauración Independiente

En caso de pérdida o migración del host del RecoveryAuthority:
1. Asegurar que los servicios de EventLens estén detenidos (`dev:down` o parar contenedores).
2. Restaurar los archivos en `RECOVERY_JOURNAL_DIR`:
   ```bash
   cp -p /mnt/secure-backups/recovery/<snapshot>/* $RECOVERY_JOURNAL_DIR/
   sha256sum -c $RECOVERY_JOURNAL_DIR/checksums.sha256
   ```
3. Iniciar el servicio y verificar logs para confirmar que `initialize()` reconstruye el estado en memoria sin advertencias ni errores `CORRUPTED_ARTIFACT`.

---

## 7. Procedimiento ante Corrupción o Gaps (`CORRUPTED_ARTIFACT` / `GAP_DETECTED`)

Si al inicializar o reconciliar se detecta un gap de secuencia o hash inválido:
1. El sistema **falla cerrado inmediatamente** (`fail-closed`), rechazando cualquier sesión o mutación sensible (`BARRIER_ACTIVE` / `CORRUPTED_ARTIFACT`).
2. **Precondición de triage:** NO sobrescribir el archivo corrupto.
3. Copiar el journal corrupto a un área forense:
   ```bash
   cp $RECOVERY_JOURNAL_DIR/recovery-journal.ndjson /tmp/recovery-forensic-$(date +%s).ndjson
   ```
4. Ejecutar herramienta de validación de registros línea por línea para identificar la primera secuencia dañada.
5. Si la corrupción se debe a una terminación abrupta en la última línea (escritura incompleta en apagón repentino sin fsync):
   - Inspeccionar la última línea: si está truncada, truncar el archivo al último registro intacto con digest SHA-256 válido.
   - Si un registro intermedio fue alterado, restaurar desde el último backup no corrupto del RecoveryAuthority y avanzar un nuevo Epoch (`setRecoveryBarrier(nextEpoch, 'MOD-001')`).

---

## 8. Manejo de Transacciones Inciertas (ACK Incierto / Timeout)

Cuando ocurre un fallo de red o timeout durante `ackCommit`:
1. El coordinador registra `state: PREPARED` en el journal, pero no el `state: COMMITTED`.
2. **Reintento Idempotente:**
   - La aplicación reintenta `executeSensitiveTransaction` utilizando el mismo `operationId`.
   - `prepare(cmd)` detecta `existing.operationId` y devuelve el mismo `receipt` original sin asignar nueva secuencia.
   - El reintento de `ackCommit(receipt, revision)` completa la confirmación de manera idempotente.
3. **Si el reintento no llega:**
   - La operación permanece en `state: PREPARED`.
   - En caso de aborto explícito, `resolveAbort(receipt, reason)` marca el registro como `ABORTED`.
   - Una operación no confirmada **nunca** se proyecta como autorizada o reconciliada.

---

## 9. Actuación ante Indisponibilidad de la Persistencia Independiente

Si el volumen de almacenamiento independiente se desmonta o falla por E/S:
1. `DurableRecoveryAuthorityAdapter` lanza `AUTHORITY_UNAVAILABLE`.
2. Todas las rutas de autenticación de admin y validación de sesiones fallan de inmediato con error 503 / `SESSION_REVOKED` / `AUTHORITY_UNAVAILABLE`.
3. **No existe bypass:** Bajo ninguna circunstancia se debe degradar a validar sesiones confiando únicamente en la base de datos PostgreSQL.
4. Una vez restablecido el almacenamiento:
   - Reiniciar el proceso o llamar a `initialize()`.
   - El sistema reanuda la operación normal sin requerir cambios de código.

---

## 10. Validación Posterior a una Restauración de PostgreSQL (PITR)

Cuando el equipo de base de datos restaura un snapshot o realiza un PITR de PostgreSQL:

### 10.1 Precondición
- El almacenamiento `RECOVERY_JOURNAL_DIR` NO debe haber sido alterado ni restaurado junto con PostgreSQL.

### 10.2 Procedimiento de Reconciliación
1. Arrancar el servicio de EventLens.
2. Comprobar que las sesiones y credenciales revocadas en el journal son **inmediatamente rechazadas** en tiempo real al evaluar el `watermark` externo contra el registro restaurado de PostgreSQL (verificado por Escenario A).
3. Ejecutar la reconciliación forzada:
   ```bash
   pnpm admin:recover
   # o invocar Mod001RecoveryCoordinator.reconcileMod001('MOD-001')
   ```
4. El coordinador:
   - Lee todos los hechos del journal hasta el último checkpoint.
   - Aplica en PostgreSQL las restricciones necesarias:
     `UPDATE admin_principal SET status = 'REVOKED' WHERE id = ...`
     `UPDATE admin_credential SET status = 'REVOKED' WHERE ...`
     `UPDATE admin_session SET revoked_at = NOW() WHERE session_watermark < ...`
   - Emite `ackReconciled('MOD-001', epoch, checkpointSequence, digest)`.
   - Levanta la barrera de recuperación (`isRecoveryBarrierActive = false`).
5. Verificar auditoría y estado:
   ```bash
   pnpm admin:status
   ```
