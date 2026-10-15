# DEC-112 — Mecanismo de persistencia duradera, journal append-only y checkpoints de RecoveryAuthority fuera del timeline de PostgreSQL

**Fecha:** 2026-10-13  
**Estado:** RECOMMENDED (Propuesta técnica formal y arquitectura de referencia para EL-TK-222)  
**Alcance:** MOD-001 (Identidad y Acceso), MOD-009 (Operaciones y Recuperación), DR-001, AQR-001  
**Trazabilidad:** EL-EP-019, EL-TK-217, EL-TK-221, EL-TK-222, DEC-045, DEC-062, DEC-092, DEC-106, ARCH-010, `event-control-panels-contract.md`

---

## 1. Contexto y problema

En EventLens, PostgreSQL es el almacén primario del dominio y de las colas de trabajo. La estrategia de recuperación ante desastres (DR) para la base de datos se fundamenta en copias de seguridad continuas y recuperación en el tiempo (PITR - Point-in-Time Recovery, DEC-062).

Cuando ocurre un incidente operacional o corrupción de datos que obliga a restaurar PostgreSQL a un snapshot $T_{restore}$, cualquier mutación de seguridad ocurrida entre $T_{restore}$ y el momento de caída $T_{crash}$ se pierde en la base de datos restaurada.

Si las validaciones de sesión, credenciales y autorizaciones dependieran exclusivamente del estado de las tablas de PostgreSQL (`admin_principal`, `admin_credential`, `admin_session`, `organizer_credential`, `organizer_session`):
1. **Resurrección de credenciales revocadas:** Un administrador o credencial revocado a las 14:00 volvería a aparecer como `ACTIVE` si la base de datos se restaura a un snapshot de las 12:00.
2. **Resurrección de sesiones:** Sesiones revocadas por incidentes de seguridad o rotación de contraseñas volverían a considerarse válidas.
3. **Resurrección de solicitudes de eliminación canceladas:** Purgas irreversibles podrían ejecutarse contra eventos cuya solicitud había sido legítimamente cancelada.

Para garantizar los invariantes de seguridad AQR-001, DEC-045 y ARCH-010, EventLens exige que la autoridad de recuperación (`RecoveryAuthorityPort`) resida **estricta y físicamente fuera de la línea temporal de restauración de PostgreSQL**.

---

## 2. Comparación de alternativas evaluadas

| Criterio | Opción A: Tabla o esquema en PostgreSQL | Opción B: Bucket S3 directo exclusivo | Opción C: Journal append-only en volumen dedicado + Checkpoint (DEC-112) |
|---|---|---|---|
| **Independencia de timeline PITR** | ❌ Nula. El restore de PG sobreescribe las tablas de recuperación. | ✅ Alta. S3 tiene ciclo de vida independiente del RDBMS. | ✅ Total. Reside en volumen/directorio aislado sin acoplamiento a los dumps de PG. |
| **Atomicidad y semántica append-only** | ⚠️ Atómico en transacciones PG, pero revertible con PITR. | ❌ S3 estándar no tiene `O_APPEND`. Requiere un objeto por registro o emulación pesada. | ✅ `O_APPEND` / `fsync` estricto en disco con encadenamiento SHA-256. |
| **Latencia en PREPARE / ACK** | ✅ Sub-milisegundo. | ❌ 30-80 ms por llamada HTTP/TLS a S3 (inadmisible en login sensible). | ✅ Sub-milisegundo (operación de I/O secuencial local con `fsync`). |
| **Complejidad operacional Beta** | ✅ Mínima. | ⚠️ Requiere credenciales IAM, configuración de red, manejo de timeouts de API S3. | ✅ Mínima. Directorio configurable local o volumen montado (Docker volume o mount point). |
| **Detección de gaps y corrupción** | ❌ Depende del WAL de PG. | ⚠️ Requiere listing consistente ordenado por prefijo. | ✅ Detección inmediata en tiempo de arranque mediante hash chain monotónico. |
| **Comportamiento fail-closed** | ❌ Falso positivo (restaura estado antiguo y cree que es válido). | ✅ Puede fallar cerrado ante 5xx o timeout. | ✅ Falla cerrado inmediatamente ante cualquier corrupción, gap o desconexión. |
| **Costo** | Cero adicional. | Costo por peticiones PUT/GET en cada mutación de seguridad. | Cero adicional en infraestructura Beta. |

---

## 3. Decisión adoptada (DEC-112)

Se adopta la **Opción C**: Una arquitectura modular de `DurableRecoveryAuthorityAdapter` respaldada por:
1. **Un volumen o directorio persistente independiente del tablespace de PostgreSQL** (ruta configurable mediante variable de entorno `RECOVERY_JOURNAL_DIR`, por defecto `/var/lib/eventlens/recovery` o ruta aislada de la aplicación).
2. **Journal de registros append-only encadenados criptográficamente (`recovery-journal.log`)**: Cada registro contiene una secuencia monotónica incremental, epoch, tipo de hecho, datos sanitizados, identificador de operación, estado (`PREPARED`, `COMMITTED`, `ABORTED`), el hash del registro anterior y el hash propio calculado con SHA-256.
3. **Checkpoints atómicos e íntegros (`recovery-checkpoint.json`)**: Generados mediante escritura a archivo temporal y reemplazo atómico (`atomic rename`). Contienen el epoch activo, la secuencia máxima confirmada, el digest del último registro, las barreras de recuperación vigentes por scope y los pisos de revocación (watermarks) de cada principal.
4. **Protocolo estricto `PREPARE → SQL → ACK`**:
   - `PREPARE`: La autoridad registra la intención durable en disco con `fsync()` antes de que PostgreSQL inicie su transacción SQL.
   - `SQL`: PostgreSQL ejecuta la mutación y persiste el identificador del recibo emitido.
   - `ACK`: PostgreSQL confirma el commit y la autoridad marca el registro como `COMMITTED` con `fsync()`.
   - En caso de aborto SQL, la autoridad registra `ABORTED`.
   - Si ocurre una caída antes del `ACK`, el registro permanece `PREPARED`, lo que impone una barrera conservadora preventiva sobre el sujeto y **falla cerrado**.
5. **Fail-Closed sin excepciones**:
   - Si el directorio o archivo del journal está corrupto, presenta gaps en la secuencia numérica o discrepancias en la cadena de hashes, el adaptador lanza de inmediato `RecoveryError('CORRUPTED_ARTIFACT' | 'GAP_DETECTED' | 'AUTHORITY_UNAVAILABLE')`.
   - Todas las consultas de sesión y verificaciones de credenciales deniegan el acceso (`AuthenticationError('AUTHORITY_UNAVAILABLE')`), impidiendo cualquier bypass de seguridad.

---

## 4. Contrato operacional y formatos

### 4.1 Estructura del registro del Journal (`JournalRecord`)
```json
{
  "sequence": 1,
  "epoch": 1,
  "operationId": "0dec9ad4-5006-4081-bcb3-a699918314e3",
  "subjectRef": "usr-admin-001",
  "type": "ADMIN_PRINCIPAL_REVOKED",
  "state": "COMMITTED",
  "revision": 2,
  "data": { "reason": "SECURITY_ROTATION" },
  "timestamp": "2026-10-13T21:40:00.000Z",
  "previousHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "recordHash": "a3b2c1..."
}
```

**Cálculo de Hash del Registro:**
$$\text{recordHash} = \text{SHA256}(\text{previousHash} \parallel \text{sequence} \parallel \text{epoch} \parallel \text{operationId} \parallel \text{subjectRef} \parallel \text{type} \parallel \text{state} \parallel \text{revision} \parallel \text{JSON.stringify(data)})$$

### 4.2 Estructura del Checkpoint (`CheckpointData`)
```json
{
  "epoch": 1,
  "checkpointSequence": 42,
  "lastRecordHash": "a3b2c1...",
  "checkpointDigest": "f8e7d6...",
  "barriers": {
    "MOD-001": false
  },
  "revocationFloors": {
    "usr-admin-001": 2
  },
  "reconciledScopes": {
    "MOD-001": {
      "reconciledAt": "2026-10-13T21:45:00.000Z",
      "checkpointSequence": 42,
      "digest": "f8e7d6..."
    }
  },
  "updatedAt": "2026-10-13T21:45:00.000Z"
}
```

---

## 5. Reconciliación post-PITR

Cuando PostgreSQL es restaurado a un snapshot histórico:
1. El operador o proceso de recuperación invoca `Mod001RecoveryCoordinator.reconcileMod001()`.
2. La autoridad lee su checkpoint y valida la cadena completa de hechos desde la secuencia 1 hasta `checkpointSequence`.
3. Para cada hecho confirmado:
   - Si `type === 'ADMIN_PRINCIPAL_REVOKED'`: actualiza el principal a `status = 'REVOKED'`.
   - Si `type === 'CREDENTIAL_ROTATED'`: revoca cualquier credencial restaurada con `revision < fact.revision`.
   - Si `type === 'SESSION_REVOKED'`: revoca sesiones con watermark anterior al registrado.
4. Enforce del Epoch: Invalida cualquier sesión cuyo `auth_time` sea anterior al epoch actual (`RECOVERY_EPOCH_SUPERSEDED`).
5. Tras concluir la transacción SQL de reconciliación, emite `ackReconciled()` confirmando que la base restaurada ya no viola las barreras externas.
6. Si la reconciliación falla o el journal está inaccesible, el sistema permanece bloqueado (`AUTHORITY_UNAVAILABLE`).
