# ADR propuesto — S3 como RecoveryAuthority y RPO multimedia Beta

Estado: **PROPOSED / NOT_ACCEPTED / TECHNICAL_GATES_PENDING**. Propuesta: 2026-10-14. Revisión correctiva: 2026-10-15 (resuelve documentalmente el dictamen preliminar CHANGES_REQUESTED). Trazabilidad: CR-011, EL-TK-245, EL-EP-020, DEC-112, DEC-113, AQR-001, AQR-004, ARCH-010, ARCH-011, TC-002, TC-003.

Alcance aprobado vigente (DEC-113): sólo S3 para backups externos y filesystem/EBS como almacenamiento operativo. DynamoDB, S3 como autoridad productiva y RPO media ≤1 h permanecen **PENDING**. Este documento diseña y acota lo no aprobado; no lo aprueba ni lo implementa.

Revisión correctiva (2026-10-15): resueltos P0-1 (reintentos CAS y candidatos inmutables), P0-2 (actualidad del ancla externa), P1-1 (lecturas y revocación) y P1-2 (watermark recuperable multimedia). Se **retira** la ventana de validez positiva de 1–5 s propuesta en la versión anterior por incompatibilidad con AQR-001. Dictamen preliminar CHANGES_REQUESTED atendido documentalmente; estado sigue **PROPOSED**, no aprobado.

## Clasificación

| Clase | Elemento |
|---|---|
| **CONFIRMED** | us-east-1; dos eventos simultáneos; EC2 única de aplicación; PostgreSQL Docker sobre EBS; media operativa filesystem/EBS sin gateway S3; destino S3 autorizado para backups externos |
| **RECOMMENDED** | S3 CAS como proveedor de autoridad de laboratorio (DynamoDB on-demand candidato preferido de implementación; mismo contrato AQR-001) |
| **RECOMMENDED** | RPO media ≤1 h medido como `now − W(now)` (último conjunto recuperable completo verificado), con alerta previa al límite |
| **RECOMMENDED** | Ancla de actualidad externalizada del bucket operativo; **no** en el mismo bucket ni en la misma cuenta de control-plane |
| **PENDING** | Aprobación de S3/DynamoDB como autoridad productiva; forma del ancla (segunda cuenta AWS vs control-plane externo); política de pérdida de originales confirmados; proveedor filesystem Beta; presupuesto e IAM/claves |
| **PENDING** | Retención efectiva y compatibilidad Object Lock ↔ purga ≤30 d (requiere decisión) |
| **BLOCKER** | Ancla de actualidad independiente **probada**; protocolo PREPARE→SQL→ACK con evidencia adversarial real; ausencia de ensayo PITR/antirollback efectivo |
| **BLOCKER** | Ninguna prueba de este documento ha sido ejecutada (todas NOT_EXECUTED); no acredita RPO/RTO ni capacidad |

## 1. Contexto

PostgreSQL y su PITR no pueden ser autoridad de revocaciones: restaurar a $T_{restore}$ resucitaría credenciales, sesiones, invitaciones y solicitudes de borrado canceladas entre $T_{restore}$ y $T_{crash}$ (AQR-001, DEC-112). La autoridad debe residir fuera de la línea temporal de restauración, con `PREPARE → SQL → ACK`, fail-closed y denegación conservadora de estados ambiguos.

La petición autoriza evaluar S3 Object Lock + Conditional Writes (CAS) como RecoveryAuthority productiva y formalizar RPO multimedia ≤1 h, conservando DEC-113.

Contrato de referencia (DEC-112, RECOMMENDED; implementación local verificada en `packages/identity/src/recovery-authority-adapter.ts`): volumen aislado + journal append-only encadenado + checkpoint atómico + `PREPARE/SQL/ACK` + fail-closed, con `receipt = rcpt-{operationId}` determinista. **Este ADR no modifica DEC-112**: propone un proveedor alterno del mismo puerto `RecoveryAuthorityPort` y sólo para Beta.

### 1.1 Semántica observada del adaptador local (base del diseño S3)

| Hecho verificado en código | Consecuencia para el diseño S3 |
|---|---|
| `prepare` añade una entrada `PREPARED` con `receipt = rcpt-{operationId}`; si ya existe, devuelve el mismo receipt si `subjectRef`+`type` coinciden (líneas 476–535) | El receipt es **determinista y derivable**; la idempotencia depende de `operationId`+contenido, no de un contador |
| `ackCommit` añade una **segunda** entrada `COMMITTED` con el mismo `receipt`/`operationId`; rechaza abortar un commit (líneas 537–585) | El journal es append-only con **dos entradas por operación**; la idempotencia del ACK en S3 debe derivarse del contenido, no de mutación en memoria |
| `entriesByOperationId` guarda la **última** entrada; conflicto si cambia `subjectRef`/`type` | El índice `operationId → último estado` es requisito del contrato, no un añadido |
| Gap de secuencia y cadena de hash rota ⇒ `GAP_DETECTED`/`CORRUPTED_ARTIFACT` (líneas 220–240) | Los mismos invariantes deben verificar en S3 antes de cualquier lectura |
| `resolveAbort` exige `receipt` y no se invoca por ausencia de fila (líneas 587–629) | `ABORTED` es una entrada explícita, nunca una inferencia |

## 2. Amenaza y modelo de fallo

| Escenario | Exigencia |
|---|---|
| Restore PG a un pasado | Reaplicar hechos `COMMITTED` posteriores; `PREPARED` sin ACK permanece con barrera |
| Rollback operativo accidental | Un checkpoint/hash válido pero antiguo no se acepta como vigente |
| Escritor honesto concurrente | Serialización de publicaciones; forks no publicados; huérfanos inertes |
| Escritor privilegiado comprometido | **Fuera de alcance**: CAS y hash no impiden que un escritor con IAM de control-plane publique datos falsos |
| Bucket recreado con el mismo nombre | Detección por ancla de encarnación independiente |
| Autoridad ausente/reemplazada/perdida | Servicio cerrado; sin bootstrap automático |
| Red incierta / ACK ambiguo | Relectura canónica; nunca éxito antes del ACK durable |
| Compactación concurrente | Idempotencia preservada por índice en checkpoints; nunca duplicar operación |

---

## Parte A — Protocolo S3 como RecoveryAuthority

## 3. Encarnación y ancla de actualidad (P0-2)

### 3.1 Objetos

| Objeto | Semántica de escritura | Contenido |
|---|---|---|
| `authority/incarnation/current.json` | CAS `If-Match` | `incarnationId`, `epoch`, `account`, `bucket`, `region`, `boundaryDigest`, `activatedAt`, `activationTranscript` |
| `authority/head.json` | CAS `If-Match` (único punto de publicación) | `incarnationId`, `epoch`, `sequence`, `previousDigest`, `recordDigest`, `operationId`, `attemptId`, `checkpointSequence`, `recentOperations` |
| `anchor/{n}.json` (bucket externo) | `If-None-Match: *` (append-only, numerado) | `incarnationId`, `epoch`, `headSequence`, `headDigest`, `headEtag`, `observedAt`, `anchorSequence` |
| `anchor/current.json` (bucket externo) | CAS `If-Match`, avance monotónico | `n`, `anchorSequence`, `headSequence`, `headDigest`, `updatedAt` |

El ARN/nombre no detectan recreación; sólo `incarnationId` + ancla externa lo hacen.

### 3.2 Protocolo de avance HEAD → ancla

El avance es **asíncrono** y no entra en la ruta crítica de login:

1. La publicación normal sólo actualiza `authority/head.json` (latencia crítica).
2. Un `anchor-writer` con rol separado lee HEAD y publica `anchor/{n+1}.json` con `If-None-Match: *` (inmutable, huérfano si no se referencia).
3. Actualiza `anchor/current.json` con `If-Match`, exigiendo avance monotónico: `n`, `anchorSequence` y `headSequence` sólo crecen; `epoch` no decrece; `headDigest` debe corresponder a un HEAD realmente observado.
4. Cadencia propuesta (a aprobar): cada 60 s **o** cada M publicaciones, lo primero que ocurra; y **obligatoriamente antes de abrir cualquier scope tras un recovery**.

La verificación de actualidad ocurre al **arranque** y al **abrir scopes post-recovery**; no por request.

### 3.3 Fallos y ACK ambiguos por frontera

| Frontera | Fallo | Regla |
|---|---|---|
| HEAD publicado, anchor-writer no ejecutó | Retraso normal | `actualityLag = now − anchor.observedAt`. Tolerado hasta `ANCHOR_MAX_LAG` (a aprobar) para operación normal; **bloquea apertura post-recovery** si excede |
| `anchor/{n+1}` publicado, puntero `current` no | Ancla huérfana | `current` apunta a `n` (conservador); reintentar puntero. Nunca retroceder `current` |
| Timeout tras `If-Match` en `current` | ACK ambiguo | Releer `current`: si `current.n ≥ n+1` y el digest coincide con el ancla publicada ⇒ éxito; si `current.n = n` ⇒ reintentar (idempotente: `n+1` es única) |
| Bucket de ancla recreado | Ancla perdida | `current` ausente ⇒ **no se puede acreditar actualidad** ⇒ fail-closed |
| HEAD retrocedió | Rollback | Ver §3.4 |
| `incarnationId` distinto | Reemplazo | Ver §3.4 |

### 3.4 Reglas de detección

- **Rollback**: `head.sequence < anchor.headSequence`, **o** `head.sequence = anchor.headSequence ∧ head.recordDigest ≠ anchor.headDigest` ⇒ `ROLLBACK_DETECTED`.
- **Cambio de encarnación**: `head.incarnationId ≠ anchor.incarnationId` **o** `head.epoch < anchor.epoch` ⇒ `AUTHORITY_SUPERSEDED`.
- **Reemplazo de bucket**: nombre igual pero `incarnationId` distinto, o ancla inalcanzable ⇒ `AUTHORITY_SUPERSEDED`.
- En los tres casos: barrera activa, ninguna reapertura automática, escalado al control-plane.

### 3.5 Recuperación verificable vs reconstrucción imposible

| Situación | Clasificación | Acción |
|---|---|---|
| HEAD íntegro, cadena verifica, ancla presente y `anchor.headSequence ≤ head.sequence`, `incarnationId`/`epoch` concordantes | **Recuperación verificable** | Reconciliar y reabrir el scope tras ACK de reconciliación |
| Ancla ausente o inalcanzable | Reconstrucción imposible | Fail-closed; escalar |
| `head.sequence < anchor.headSequence` o digest divergente | Reconstrucción imposible | Fail-closed (`ROLLBACK_DETECTED`) |
| `incarnationId`/`epoch` divergentes | Reconstrucción imposible | Fail-closed (`AUTHORITY_SUPERSEDED`) |
| Cadena de hash rota o gap | Reconstrucción imposible | Fail-closed |
| Ancla `> head.sequence` | Reconstrucción imposible | Fail-closed |

**Regla dura**: *recuperación ≠ reconstrucción*. No se fabrica actualidad a partir de fecha del sistema, `versionId` S3, listado de claves ni del contenido del bucket operativo. La única fuente de actualidad es el ancla externa. Declarada la pérdida, se exige intervención autorizada del control-plane que reinstale un ancla nueva con registro de la decisión y nueva encarnación; nunca reapertura silenciosa.

### 3.6 Costo, latencia y consecuencias de dos buckets/cuentas

| Dimensión | Con dos buckets/cuentas (segunda cuenta AWS) | Alternativa control-plane externo |
|---|---|---|
| Latencia ruta crítica | 0 ms (anchor-writer asíncrono) | 0 ms |
| Requests | ~M PUT + M GET/h en bucket externo; M=60/h ⇒ ~43k PUT + 43k GET/mes ≈ **US$0.22/mes** + almacenamiento (KB) | Similar en orden |
| Costo operacional | **Cuenta AWS adicional**: IAM/MFA/claves propias, facturación separada, recuperación propia de acceso | Sin segunda cuenta; se apoya en un registro con retención de otro proveedor o en el historial de despliegue |
| Beneficio | Un atacante con la cuenta operativa **no** puede reescribir el ancla (barrera anti-rollback real) | Igual separación de confianza si el almacén es realmente independiente |
| Riesgo | Complejidad real para una Beta de un host; riesgo de perder la credencial del ancla | Dependencia de otro proveedor; debe acreditarse inmutabilidad/retención real |

**RECOMMENDED**: mantener el ancla fuera del bucket operativo y fuera de la cuenta del runtime. **PENDING**: elegir entre segunda cuenta AWS y control-plane externo. Poner el ancla en el mismo bucket o la misma cuenta **no sirve** (un operador con control-plane reescribe ambas).

## 4. Publicación CAS, identidad de operación e intento (P0-1)

### 4.1 Problema detectado en la versión anterior

El candidato era `journal/candidate/{operationId}.json` **inmutable**, a la vez que "contenía `sequence` pretendida" y los reintentos debían "recalcular `sequence`/`previousDigest`". Ambas cosas son incompatibles: un reintento con una secuencia nueva necesitaría otro contenido, pero `If-None-Match: *` impide reescribir la misma clave. El resultado sería: o bien el reintento falla siempre con 412, o bien se crearían candidatos múltiples con la misma identidad lógica ⇒ ambigüedad y riesgo de duplicación.

### 4.2 Separación identidad lógica / identidad de intento

| Identidad | Definición | Estabilidad | Función |
|---|---|---|---|
| `operationId` | Identidad lógica de negocio (AQR-001) | **Estable** entre reintentos | Idempotencia; `receipt = rcpt-{operationId}` |
| `fingerprint` | `SHA256(subjectRef ‖ type ‖ JSON-canónico(data))` | **Estable** para la misma operación | Detectar conflicto de contenido con igual `operationId` |
| `attemptId` | ULID/uuid v4 por intento de publicación | **Nueva** en cada intento | Dirección física del candidato; traza |

Una misma operación puede tener **N intentos**; sólo uno gana. Un intento **nunca** reutiliza la clave de otro.

### 4.3 Objetos del journal

| Objeto | Clave | Escritura | ¿Puede repetirse? |
|---|---|---|---|
| Preparación | `journal/prepared/{operationId}.json` | `If-None-Match: *` | No; conflicto si `fingerprint` difiere |
| Candidato de intento | `journal/candidate/{attemptId}.json` | `If-None-Match: *` | No; **una clave por intento** ⇒ sin colisión consigo mismo |
| Traza de intento | `journal/attempts/{operationId}/{attemptId}.json` | `If-None-Match: *` | No; append-only por clave única |
| HEAD canónico | `authority/head.json` | `If-Match: {etag leído}` | Sí; es el único punto de publicación |
| Checkpoint | `authority/checkpoint/{n}.json` | `If-None-Match: *` | No; inmutable y numerado |

**El candidato NO fija `sequence` ni `previousDigest` como identidad.** Guarda `sequencePretendida` sólo como traza; la secuencia efectiva se recalcula en cada intento contra el HEAD recién leído. `recordDigest` se calcula sobre campos canónicos (mismos que DEC-112 §4.1/`computeRecordHash`), **nunca sobre el ETag S3** (el ETag no es un checksum universal y varía con multipart/SSE).

### 4.4 Protocolo normal (mutación sensible)

```
N1. GET  journal/prepared/{operationId}.json
       · ausente           → continuar
       · fingerprint igual → reanudar (idempotente)
       · fingerprint distinto → CONFLICT_OPERATION (terminal, nunca sobrescribir)
N2. PUT  journal/prepared/{operationId}.json   If-None-Match: *
       · 412 → releer y comparar fingerprint (N1)
N3. GET  authority/head.json                   (lectura fuerte)
       · verificar incarnationId/epoch (Parte A §3)
       · si recentOperations[operationId] existe y fingerprint igual →
         devolver receipt original (idempotencia) — no republicar
N4. PUT  journal/candidate/{attemptId}.json    If-None-Match: *
       (contenido del hecho + sequencePretendida = head.sequence + 1)
N5. PUT  authority/head.json                   If-Match: {etag de N3}
       · 200 → publicado (COMMITTED del PREPARE)
       · 412 → ver §4.5 (reintento)
N6. (tx SQL — ver Parte A §6, nunca dentro de un lock remoto)
N7. ACK: repetir N3–N5 con la entrada COMMITTED (receipt y operationId iguales,
       dbRevision) — es una publicación nueva, con su propio attemptId
N8. PUT  journal/attempts/{operationId}/{attemptId}.json  (traza, tras el resultado)
```

### 4.5 Reintento tras 412 / 409 y resolución de ACK ambiguo

| Resultado | Interpretación | Acción |
|---|---|---|
| `412` por `If-Match` (HEAD) | Otro escritor publicó | Releer HEAD. Si `recentOperations[operationId]` (o el índice de checkpoint) contiene la operación ⇒ devolver receipt original (idempotente). Si no ⇒ nuevo `attemptId`, recomputar `sequence = head.sequence + 1` y `previousDigest = head.recordDigest`, reintentar |
| `412` por `If-None-Match: *` (prepared/candidate) | El objeto ya existía | Preparación: comparar `fingerprint`. Candidato: **no puede ocurrir** (clave por intento) |
| `409 Conflict` | Condición no-CAS (p. ej. bucket en transición) | Tratar como transitorio/configuración: reintento acotado con backoff; si persiste, `AUTHORITY_UNAVAILABLE` fail-closed. **Nunca** interpretar 409 como "ya publicado" |
| Timeout de `PUT` | ACK ambiguo | Releer HEAD. Si `head.attemptId == attemptId ∧ head.recordDigest == recordDigest` ⇒ éxito. Si `head.sequence` avanzó con otro `attemptId` ⇒ buscar `operationId` en índice; presente ⇒ idempotente; ausente ⇒ reintentar. **Nunca** decidir por la versión que se creyó escribir |
| Timeout de `GET` | Lectura incierta | Reintento acotado; si no se puede leer HEAD, fail-closed (no se asume estado) |

**ACK ambiguo del COMMIT**: tras timeout, releer HEAD y el índice. Si existe una entrada `COMMITTED` para `operationId` (mismo `receipt`) ⇒ éxito. Si sólo existe `PREPARED` ⇒ la operación queda **ambigua** ⇒ barrera conservadora y reintento del ACK con el mismo receipt determinista. La ausencia de una fila en la DB restaurada **no** prueba abort (AQR-001).

### 4.6 Idempotencia tras compactación

La compactación publica un checkpoint (CAS sobre el puntero de checkpoint) y poda candidatos/hechos antiguos. Debe **conservar**:

1. El **índice `operationId → sequence`** de todo rango compactado (en `checkpoint/{n}.json`).
2. Los hechos que sostienen **floors y barreras activas** (sin TTL).
3. El `journal/prepared/{operationId}.json` hasta que la operación esté resuelta y su índice esté por debajo del horizonte de retención.

Regla: si un reintento no puede verificar la operación en el índice del HEAD **ni** en ningún checkpoint **ni** en `prepared`, se rechaza con `UNKNOWN_OPERATION` (**fail-closed**). **Nunca** se recrea la operación: así no se duplican revocaciones ni purgas.

### 4.7 Prevención de operaciones duplicadas y forks publicados

- **Duplicadas**: idempotencia por `operationId` + `fingerprint`, verificada contra el índice (`recentOperations` del HEAD y `operationIndex` de checkpoints) antes de publicar.
- **Forks**: el HEAD es el único punto de publicación y cada publicación exige `previousDigest = recordDigest(HEAD leído)` bajo `If-Match` sobre su ETag. S3 garantiza lectura-fuerte tras escritura y condición atómica ⇒ dos escritores no pueden publicar con éxito sobre el mismo `previousDigest`.
- **Huérfanos**: un candidato cuya publicación pierde el CAS **no entra en la cadena** (nadie lo referencia como `previousDigest`). Lifecycle lo purga; **no cuenta como hecho**.

### 4.8 Trazas reproducibles de ejecución concurrente

Cada `journal/candidate/{attemptId}.json` y `journal/attempts/{operationId}/{attemptId}.json` conserva: `attemptId`, `operationId`, `fingerprint`, `headReadEtag`, `headReadDigest`, `sequencePretendida`, `recordDigest`, `writerId`, `timestamp`, `result ∈ {PUBLISHED, CAS_412, TIMEOUT, ERROR}`, `winnerAttemptId`. Cada HEAD publicado referencia `winningAttemptId`.

Con esas trazas, dado un `seed` y `N` escritores, se reconstruye: qué intentos concurrieron sobre qué `headEtag`, quién ganó cada carrera, qué huérfanos quedaron y por qué ninguna operación se duplicó. Esto hace **reproducible** el ensayo multiwriter (Parte D).

## 5. Epoch, sequence, checkpoints y floors

- `epoch`: se incrementa antes de reabrir un scope post-PITR; invalida sesiones/leases/grants (`auth_time` anterior ⇒ `RECOVERY_EPOCH_SUPERSEDED`).
- `sequence`: monotónica global del journal; la secuencia por sujeto se deriva del índice.
- `checkpoint/{n}.json`: inmutable; contiene `epoch`, `checkpointSequence`, `lastRecordHash`, `checkpointDigest`, `barriers`, `revocationFloors`, `operationIndex`, `reconciledScopes`. Se publica vía CAS sobre el puntero de checkpoint y el HEAD referencia `checkpointSequence`+`checkpointDigest` (binding).
- `floors` (watermarks de revocación/revisión de credencial) y `barriers` (por scope) **sólo suben**. Un floor activo **no** recibe TTL automático.

## 6. Escritura, latencia y lectura: PREPARE → SQL → ACK sin locks remotos (P1-1)

### 6.1 Secuencia normal (mutación sensible)

```
API                     RecoveryAuthority (S3)         PostgreSQL
 │  N1–N3 (GET/PUT prepared, GET head)                       │
 │───────────────────────────────►                          │
 │  N4–N5 (candidate + PUT head @If-Match) ── PREPARE ──────►│  (fuera de tx)
 │  abrir tx SQL corta ──────────────────────────────────────►│
 │    aplicar cambio + audit/job + preparedReceipt           │
 │  commit tx ───────────────────────────────────────────────│
 │  N7 PUBLISH COMMITTED (receipt, dbRevision) ── ACK ──────►│  (fuera de tx)
 │  responder éxito SÓLO tras ACK durable                     │
```

Reglas:
1. **Ninguna llamada de red dentro de un lock/transacción SQL** (AQR-001 §34: "No se mantiene transacción SQL abierta durante llamadas externas").
2. El `PREPARE` ya instala la **barrera conservadora** sobre el sujeto: mientras no haya resolución segura, los permisos se deniegan (AQR-001 §34).
3. El éxito al usuario y los efectos programados se permiten **sólo después del ACK durable** (AQR-001 §34).

### 6.2 Lecturas de autorización y revocación — retirada de la caché positiva

**Hallazgo P1-1**: la versión anterior proponía una "ventana de validez corta (1–5 s) sólo para lecturas de sesión". Se **retira**: es incompatible con AQR-001.

| Cláusula del contrato | Por qué la caché positiva la viola |
|---|---|
| AQR-001 §34: el `PREPARED` instala barrera; "permisos se deniegan mientras no exista resolución segura" | Una caché positiva concedería durante la barrera |
| AQR-001 §38: "Source of truth normal: DB para dominio, **más RecoveryAuthority para versión mínima/revocación/barrera que no puede disminuir**" | Una copia local cacheada puede **disminuir** respecto de la autoridad durante el TTL |
| AQR-001 §40: "una credencial permanente solo es utilizable si `credentialRevision` coincide con authority" | Durante el TTL la credencial puede no coincidir y seguir siendo aceptada |
| AQR-001 §36: "no hay fail-open por indisponibilidad externa" | La caché convierte indisponibilidad/ambigüedad en una concesión temporal |

Consecuencia explotable: revocar y usar en < TTL produce una concesión indebida. **No se admite caché positiva de concesiones en Beta.**

**Sí se admiten** (no relajan garantías):
- **Caché negativa** (estado DENY conocido): denegar sin releer es fail-closed.
- **Caché de datos no vinculantes** (metadatos de checkpoint para UI/observabilidad), nunca para conceder.
- **Lectura fuerte mínima**: 1 `GET` de HEAD/floor por concesión; el resto de la cadena no se lee salvo recovery.

**Sin caché positiva, sin consultas remotas bajo lock**: el patrón es leer la revisión/floor **antes** de la tx (`S`), abrir la tx SQL corta, y **revalidar** que la revisión SQL sea `≥ S`; el `preparedReceipt` viaja en la tx. Si la autoridad avanzó entre la lectura y el commit, el ACK lo detecta y aplica barrera. Coste de latencia (~15–25 ms por `GET` fuerte de HEAD) **se asume y se mide** como parte del gate; no se disfraza con caché.

## 7. Recuperación de PostgreSQL sin restaurar revocaciones antiguas

1. Activar barrera de recuperación fuera del PITR y detener writers.
2. Reconciliar **desde la autoridad vigente** (nunca desde una copia del journal dentro de la DB restaurada): reaplicar hechos `COMMITTED` con secuencia posterior al snapshot.
3. `PREPARED` sin ACK permanece **ambiguo** ⇒ barrera conservadora; se resuelve por `ackCommit` con el receipt determinista o por `resolveAbort` **con prueba**, nunca por ausencia de fila.
4. Nuevo `recovery epoch`; invalidar leases restaurados, grants y sesiones previas; revisar emails/exports ya ejecutados.
5. Reconciliar objetos/refs/cuotas (inventario + tombstones; nunca liberar cuota automáticamente).
6. Verificación cruzada: ningún hash/epoch/revisión resucitado. Si la autoridad no está vigente ⇒ permanecer cerrado aunque PG esté sano.
7. `ackReconciled(scope, epoch, checkpoint, digest)` cierra el scope reconciliado.

## 8. Autoridad perdida, ausente o reemplazada

| Situación | Comportamiento |
|---|---|
| Timeout/403/404/5xx | Cerrado; sin bootstrap; sin caché positiva |
| Bucket recreado (mismo nombre) | `incarnationId` disconforme ⇒ `AUTHORITY_SUPERSEDED` |
| Ancla ausente/inalcanzable | Fail-closed; reconstrucción imposible sin control-plane |
| HEAD < ancla | `ROLLBACK_DETECTED`; fail-closed |
| Réplica incompleta | Tratada como autoridad ausente |

Reconstrucción (PENDING, requiere aprobación): (a) ancla externa conservada, (b) checkpoint compactado + cola posterior, (c) prueba de continuidad por digest escrita por un **auditor con rol distinto del runtime**. Sin los tres, no hay reapertura.

## 9. Protección IAM, Object Lock y política de retención

- **Roles separados**: runtime (publicación CAS + lectura HEAD/facts/checkpoint), anchor-writer, backup writer, restore reader, purge/compactor, control-plane (ancla, IAM, lifecycle). Runtime **sin** `DeleteObject`, sin lifecycle sobre HEAD, sin control-plane.
- **Política de bucket**: exige conditional writes; deniega `PUT` incondicional sobre `authority/head.json`, `DeleteObject`/`DeleteObjectVersion` del HEAD, copy sobre objetos publicados, lifecycle sobre HEAD, bypass de retención y de Object Lock.
- **Object Lock**: sólo donde sea compatible con purga y compactación. Retención finita alineada al horizonte PITR ≥7 d y a los plazos DEC-092/097..099 (principal ≤7 d, técnica ≤30 d). Sin legal hold automático (DEC-092). **PENDING**: retención efectiva exacta y prueba de compatibilidad con la purga ≤30 d; si es incompatible, se rechaza.
- **Límite declarado**: la política no valida que el JSON del nuevo HEAD avance secuencia; un escritor privilegiado con permiso de PUT condicional sigue siendo amenaza.

## 10. Reconstrucción de la autoridad

Propuesta (PENDING): ancla externa conservada + checkpoint compactado + cola posterior de hechos + prueba de continuidad por digest escrita por un rol distinto del runtime. Sin los tres componentes, no se reabre ningún scope. Sustituir la autoridad **nunca** es un bootstrap.

## 11. Latencia y coste esperados

- Publicación: 4 PUT por operación lógica (PREPARE = prepared + candidate + HEAD ≈ 3; ACK = candidato + HEAD ≈ 2; contabilidad gruesa del informe técnico: 4 PUT), más 1–2 lecturas fuertes de HEAD por validación.
- **Modelo S3 autoridad: US$0.42 / 2.85 / 14.12** por mes (escenarios A/B/C) + versiones 1/2/5 GB. Totales equivalentes US$43.72/57.13/116.28. Es **modelo de requests**, no equivalencia funcional; replay y contención pueden multiplicarlo.
- **Ancla externa**: +US$0.22/mes en segunda cuenta (M=60/h) + costo de administrar una cuenta adicional (§3.6).
- **DynamoDB on-demand** (candidato preferido): 16 WRU/operación ⇒ **US$0.28/1.70/7.15** + storage/PITR.
- **Latencia**: `PREPARE` y `ACK` son 3–5 round trips TLS a S3 in-region (≈30–90 ms p50 según el informe); la lectura de autoridad sale de la transacción. **La lectura por concesión no se cachea positivamente**: ~1 GET (≈15–25 ms). Este coste debe medirse y aprobarse; es un coste de diseño, no un defecto.
- Decisión de proveedor sigue **PENDING**; este ADR no fija precio como contrato.

---

## Parte B — RPO multimedia ≤1 h (P1-2)

## 12. Semántica de durabilidad y confirmación

| Concepto | Definición | No es |
|---|---|---|
| **Confirmado al usuario** | Bytes persistidos en almacenamiento operativo (EBS) + receipt durable | No implica copia externa |
| **Durable externamente** | Presente en S3 con manifiesto verificable (identidad lógica, receipt, hash, archivo exacto) | No es "job de backup verde" |
| **Punto recuperable completo `W(T)`** | Mayor `t ≤ T` tal que **todo** el conjunto recuperable `RS(t)` está presente y verificado | No es el último archivo copiado |
| **RPO** | `now − W(now)` | No es el intervalo del cron |

## 13. Conjunto recuperable `RS(T)` y watermark `W(T)`

`RS(T)` es el conjunto mínimo que, junto, permite reconstruir el estado multimedia confirmado a `T` de forma verificable:

| Componente | Contenido | Verificación |
|---|---|---|
| **SQL@T** | base backup + WAL hasta `T` | Restaurable a un target exacto |
| **Originales** | Objetos referenciados por receipts con `received/committed ≤ T`, **incluyendo estados `CONFIRMING`** | `sha256` del objeto = `sha256` del manifest |
| **Manifests** | `mediaRef`, `generation`, `sha256`, `bytes`, `intentId`, `receipt`, `objectKey`, `replicatedAt` | Concordancia con PG y con el objeto |
| **Tombstones** | Purgas/borrados con `purge_started_at ≤ T` | Impide resucitar purgados |
| **Inventario/ledger** | Consumo de referencia en `T` | Permite reconstruir sin liberar cuota |

`W(T) = max{ t ≤ T : RS(t) completo y verificado }`. Si falta un original, un manifest o un receipt, o un hash no coincide, `W` **retrocede** al último conjunto completo.

**Corrección respecto a la versión anterior**: el RPO se calcula sobre el **último conjunto recuperable completo**, no sobre "el último original/manifest recuperable". Un archivo reciente sin su receipt o sin su manifest **no** hace recuperable un punto.

**Estados `CONFIRMING`**: un original en `CONFIRMING` puede necesitar completarse tras un restore, por lo que **se respalda igual** que un `CONFIRMED`. No se trata como staging descartable.

**Missing y tombstones**: `Missing` verificado = inconsistencia P1 (nunca archivo vacío ni `DELETED` por timeout). Los tombstones se conservan para que una restauración no reintroduzca contenido purgado, y su consumo no se libera automáticamente.

## 14. Cadencia, verificación e inventario

- Cadencia candidata: **replicación por objeto poco después del sellado** (reduce el hueco a minutos) **+** full diario/WAL de PostgreSQL (pgBackRest) hacia S3 Standard cifrado, en bucket **separado** del de autoridad.
- Verificación en dos fases: (1) checksum/manifest en escritura; (2) validación de restore periódica (inicial antes de Beta, luego mensual y tras cambios sustanciales).
- El cálculo de `W(now)` debe ser **observable** (métrica expuesta), no inferido de un job verde.

## 15. Compatibilidad restauración multimedia ↔ PITR SQL

1. Recuperar PG al target y el conjunto multimedia/manifests.
2. Consultar la autoridad vigente **independiente**.
3. Reconciliar `COMMITTED`/`PREPARED`, epochs, revisiones y barreras (Parte A §7).
4. Reconciliar inventario: receipt sin original ⇒ inconsistencia; original con hash incorrecto ⇒ **no publicar**.
5. Reconstruir el ledger de consumo desde inventario confirmado + tombstones; **no** liberar cuota automáticamente.
6. Recalcular `W` y comparar con el objetivo.

## 16. Alertas y comportamiento ante RPO incumplido

| Métrica | Umbral | Acción |
|---|---|---|
| `now − W(now)` | **advertencia 45 min** | Alerta, revisar cadencia/replicación |
| `now − W(now)` | **incumplimiento 60 min** | P1 + runbook + registrar evidencia (timestamps UTC, `W`, componentes faltantes, hashes) |
| Retraso de replicación/backup | cerca del límite | Alerta + escalado |
| Fallo de verificación/manifest | inmediato | Bloqueo de publicación hasta reconciliar |
| Restore drill | fuera de ventana | P1; no declarar RTO |

Al incumplir: se registra la evidencia, **se bloquea la promoción del gate** y se abre incidente con runbook. No se rellena con valores supuestos. Si persiste, la Beta **no** puede declarar RPO ≤1 h; se documenta la desviación y se requiere decisión.

## 17. Retención, eliminación y purga

Las copias técnicas (incluidas versiones S3) rotan/purgan con evidencia dentro de ≤30 d desde `purge_started_at` (ancla UTC, DEC-092/097..099). Versioning **no** elimina al borrar la clave: hace falta expiración explícita de **todas** las versiones. Objetos bajo retención/Object Lock incompatibles con la purga se prueban o se **rechazan** (PENDING).

## 18. Ensayo real de pérdida de EBS y PITR (escenarios a demostrar)

| # | Escenario | Qué demuestra |
|---|---|---|
| E1 | Cargar N originales → replicación + manifests + receipts → PITR a un target intermedio → destruir EBS operativo | `RS(W)` se restaura completo; RPO ≤1 h; RTO ≤4 h |
| E2 | Un upload queda en `CONFIRMING` en `T` | Su original está respaldado; tras restore la operación se completa o se cierra sin resucitar |
| E3 | Purgar un evento antes del target de PITR → restore | El purgado **no** resucita; su consumo no se libera automáticamente |
| E4 | Simular pérdida de un manifest (o de un original) entre dos ciclos | `W` retrocede; se dispara la alerta de 60 min; no se publica un punto incompleto |
| E5 | Borrar/cancelar **después** del target | El restore no reintroduce la purga cancelada ni la revierte |
| E6 | Copia truncada (copia parcial) | El hash no coincide ⇒ el punto no es recuperable ⇒ `W` retrocede |

Cada escenario con: commit/seed, digests, timestamps UTC, target PITR, secuencias/receipts, métricas, trazas sanitizadas, hashes de corpus, assertions y costo. Estado de todos: **NOT_EXECUTED**.

**Recomendación para revisión**: si la Beta admite explícitamente perder hasta una hora de recuerdos ya confirmados, adoptar backup periódico **midiendo `W`**; si es inaceptable, diseñar durabilidad exterior antes de confirmar el éxito al usuario. **No** aprobar ≤1 h por conveniencia de coste.

---

# Parte C — Contratos, hallazgos y pruebas

## 19. Matriz de impacto contractual

| Contrato | Impacto propuesto | Preservado |
|---|---|---|
| TC-002 / DEC-062 | S3 cambia destino de backup; no relaja full diario + WAL continuo, ≥7 d, RPO DB ≤1 h, RTO ≤4 h | ✅ |
| TC-003 / DEC-063 | Excepción Beta explícita para filesystem operativo; ObjectStorage neutral, grants, hash/version/receipt, cuotas, privacidad, purga | ✅ (requiere aprobación) |
| DEC-061 / TC-001 | 2 simultáneos no acredita capacidad; límites de archivos/bytes vigentes | ✅ |
| DEC-061/063, EL-TD-008 | La petición como autoridad necesita decisión explícita; no se infiere de "media externa" | ⚠️ PENDING |
| DEC-112 | Mantiene RECOMMENDED; S3 es proveedor alterno del **mismo** puerto; el adaptador local permanece válido y verificable | ✅ |
| AQR-001 | `prepare/ackCommit/resolveAbort/readCheckpoint/readFacts/setRecoveryBarrier/ackReconciled`; receipt determinista; PREPARE→SQL→ACK; fail-closed; **sin caché positiva** | ✅ (corregido P1-1) |
| ARCH-010 | RecoveryAuthority neutral, escritor serializado, facts mínimos, sin 2PC | ✅ |
| DEC-092/097/098/099 | Purga ≤30 d; sin legal hold automático; ancla UTC | ✅ |
| DEC-113 | Ampliación a autoridad/RPO requiere aprobación expresa adicional | ⚠️ PENDING |
| AQR-004 | Métricas de recuperación; denominadores intactos | ✅ |
| EL-TK-222 / EL-TK-252 | Evidencia SQL simulada no se reetiqueta; autoridad Beta sin despliegue acreditado | ✅ |
| EL-TK-257 / 258 / 262 | Destino S3 desbloqueado; restore real y antirollback siguen PENDING | ⚠️ |

Ningún contrato aceptado se modifica. El ADR no supersede EL-TD-001..008.

## 20. Matriz de hallazgos y resoluciones (P0-1, P0-2, P1-1, P1-2)

| ID | Sev. | Hallazgo | Resolución propuesta | Sección |
|---|---|---|---|---|
| P0-1 | Alta | `candidate/{operationId}.json` inmutable **y** reintentos que recalculan `sequence`/`previousDigest` son incompatibles | Separar `operationId` (lógica, con `fingerprint` y `receipt = rcpt-{operationId}`) de `attemptId` (intento). Candidato por intento: `candidate/{attemptId}.json`. La secuencia se recalcula en cada intento contra el HEAD | §4.1–§4.4 |
| P0-1 | Alta | Idempotencia indefinida tras 412/timeout | Releer HEAD + índice (`recentOperations`, `operationIndex`). `attemptId`/`recordDigest` coincidentes ⇒ éxito; índice contiene `operationId` ⇒ idempotente; si no ⇒ reintento | §4.5 |
| P0-1 | Media | Idempotencia tras compactación | Índice `operationId → sequence` preservado en checkpoints; `prepared` conservado hasta resolución; si no verificable ⇒ `UNKNOWN_OPERATION` fail-closed | §4.6 |
| P0-1 | Media | Forks publicados / operaciones duplicadas | HEAD único punto de publicación; `If-Match` + `previousDigest`; huérfanos inertes; `409 ≠ publicado` | §4.7 |
| P0-1 | Media | Trazas concurrentes no reproducibles | Candidato/attempt conserva `headReadEtag`, `headReadDigest`, `result`, `winnerAttemptId`, `writerId`, `timestamp` | §4.8 |
| P0-2 | Alta | No había protocolo de avance HEAD→ancla | Ancla append-only numerada + puntero CAS con avance monotónico; anchor-writer asíncrono con rol separado | §3.1–§3.2 |
| P0-2 | Alta | Fallos/ACK ambiguos por frontera sin definir | Tabla de fronteras con regla por caso (§3.3) | §3.3 |
| P0-2 | Alta | Rollback/encarnación/reemplazo sin reglas | `ROLLBACK_DETECTED` / `AUTHORITY_SUPERSEDED` con predicados explícitos | §3.4 |
| P0-2 | Media | "Recuperación" y "reconstrucción" mezcladas | Tabla verificable vs imposible; *recuperación ≠ reconstrucción*; ancla nueva sólo por control-plane | §3.5 |
| P0-2 | Media | Costo/latencia de dos cuentas no evaluado | Tabla de costo/latencia/consecuencias + alternativa control-plane externo | §3.6 |
| P1-1 | Alta | Caché positiva de 1–5 s incompatible con AQR-001 | **Retirada.** Permitidas sólo caché negativa y datos no vinculantes; 1 GET fuerte por concesión; coste medido, no disfrazado | §6.2 |
| P1-1 | Media | Riesgo de lock SQL durante llamadas remotas | PREPARE fuera de tx; tx SQL corta; ACK fuera de tx; sin red dentro del lock | §6.1 |
| P1-2 | Alta | RPO definido como "último archivo", no como conjunto | `RS(T)` + `W(T)`; `RPO = now − W(now)`; CONFIRMING respaldado; manifests/receipts/tombstones obligatorios | §12–§13 |
| P1-2 | Media | Alertas 45/60 y comportamiento sin definir | Umbrales + bloqueo de promoción + evidencia + incidente P1 | §16 |
| P1-2 | Media | Sin escenarios de demostración con pérdida de EBS + PITR | E1–E6 con invariantes medibles | §18 |

## 21. Matriz de pruebas adversariales reproducibles

Todas **NOT_EXECUTED**. Cada ensayo exige: commit, semilla, digests, timestamps UTC, target PITR, secuencias/receipts, métricas, trazas sanitizadas, hashes de corpus, assertions y costo del ensayo.

| ID | Ensayo | Fixture / inyección | Criterio verificable |
|---|---|---|---|
| T1 | S3 adversarial | Delete marker, replay de versión antigua, PUT sin CAS, headers ausentes, bucket recreado, HEAD ausente | Denegación IAM; detección de encarnación/frontera; nunca bootstrap automático; límites ante escritor privilegiado documentados |
| T2 | Ancla externa | Ancla perdida, ancla adelantada, digest divergente, `incarnationId` distinto, ACK ambiguo del puntero | `ROLLBACK_DETECTED`/`AUTHORITY_SUPERSEDED`; fail-closed; sin reapertura sin control-plane |
| T3 | Multiwriter | 2 y 8 escritores, misma/diferente revisión, miles de carreras con semilla | Un HEAD/cadena canónicos; secuencias únicas; floors no decrecen; huérfanos no publicados; ninguna operación duplicada; trazas reproducibles |
| T4 | Fronteras PREPARE/SQL/ACK | kill/timeout antes y después de cada confirmación durable y del commit SQL; reintento con mismo `operationId` | Una operación lógica; nunca éxito antes del ACK durable; receipt/revisión correctos; ambigüedad ⇒ barrera |
| T5 | Idempotencia tras compactación | Compactar con operación en vuelo; reintentar operación compactada | No duplica; `UNKNOWN_OPERATION` si no verificable; floors/barreras conservados |
| T6 | Checkpoints | Truncar/corromper/sustituir prefijo, digest, checkpoint; crash durante compactación | Fail-closed y alarma; no aceptar cadena antigua como vigente |
| T7 | PITR real | Full diario + WAL; t0 backup, t1 target, t2 revocar sesión/invitación/cuenta/admin | Autoridad en t2; deny de credenciales revocadas; `PREPARED` conservador; RPO≤1 h/RTO≤4 h cronometrados |
| T8 | Lectura/revocación | Revocar y usar inmediatamente; autoridad no disponible | Sin concesión por caché positiva; DENY ante indisponibilidad; sin lock SQL durante red |
| T9 | Media + SQL | Mismatch de inventario, receipt `CONFIRMING`, copia parcial, hash incorrecto, purge posterior al target | RPO = `now − W(now)`; W retrocede ante hueco; no publicar corruptos/ausentes ni resucitar purgados |
| T10 | Pérdida de EBS | Escenarios E1–E6 (Parte B §18) | RS completo restaurado; RTO ≤4 h; alertas 45/60 correctas; no liberar cuota |
| T11 | IAM/cifrado | Matriz allow/deny runtime/backup/restore/purge/control-plane; claves ausentes/rotadas | Sin lectura pública; sin borrado de autoridad por runtime; restore descifrable; logs sanitizados |
| T12 | Retención/purga | Anclas UTC, delete markers, packs, bordes 7/30 d, Object Lock compatible o no | Bytes/versiones elegibles inaccesibles y eliminados antes de plazo; sin romper PITR ni floors |
| T13 | Presupuesto/DR | Host limpio desde runbook + Cost Explorer del ensayo | RTO ≤4 h; RPO probado; costo recalculado; sin declarar capacidad por build exitoso |

## 22. Criterios de aceptación para el gate arquitectónico

1. Aprobación expresa del proveedor de autoridad (S3 o DynamoDB) y de la política de pérdida de originales confirmados.
2. Ancla de actualidad externa, probada, con reconstrucción auditada; decisión registrada sobre segunda cuenta vs control-plane externo.
3. Evidencia adversarial real (T2–T5) sin SQL simulado ni mocks que acrediten garantías AWS.
4. Excepción DEC-063/TC-003 aprobada con preservación de ObjectStorage/grants/purga.
5. Política de retención/Object Lock resuelta y compatible con la purga ≤30 d.
6. `W(t)` observable y RPO medido en los escenarios E1–E6.
7. Presupuesto completo (incluidos recursos temporales de ensayo) dentro del objetivo o con desviación aprobada.
8. Ningún ticket promovido a READY/DONE ni contrato histórico modificado por este ADR.

## 23. Riesgos residuales

| # | Riesgo residual | Mitigación propuesta | Estado |
|---|---|---|---|
| R1 | Escritor privilegiado con IAM de control-plane publica datos falsos | Separación de roles, ancla externa, auditoría; **no** eliminable por CAS/hash | Declarado |
| R2 | Latencia por ausencia de caché positiva | Medir y aprobar como coste de diseño; 1 GET por concesión | PENDING medición |
| R3 | Complejidad operacional de una segunda cuenta AWS | Evaluar control-plane externo; decidir forma del ancla | PENDING decisión |
| R4 | Object Lock podría impedir la purga ≤30 d | Ensayo T12; rechazar configuración incompatible | BLOCKER si no se prueba |
| R5 | RPO real no demostrado (ninguna prueba ejecutada) | E1–E6 + métrica `W` | NOT_EXECUTED |
| R6 | Compactación vs idempotencia histórica | Índice en checkpoints + `UNKNOWN_OPERATION` fail-closed | Propuesta, sin probar |
| R7 | Coste DynamoDB/S3 sin equivalencia funcional | Modelo de requests + ensayo de presupuesto | PENDING |
| R8 | Reconciliación de `CONFIRMING` tras restore | E2; respaldo obligatorio de CONFIRMING | Propuesta, sin probar |
| R9 | Deriva entre ancla y HEAD bajo carga | Cadencia adaptable + alerta de `actualityLag` | Propuesta, sin probar |

## 24. Decisiones que necesitan aprobación

| # | Decisión | Consecuencia si no se aprueba |
|---|---|---|
| D1 | Proveedor de autoridad productivo: S3 CAS u objetivo DynamoDB on-demand | El protocolo no se puede implementar; gate bloqueado |
| D2 | Forma del ancla: segunda cuenta AWS vs control-plane externo | Sin ancla independiente no hay detección de rollback; BLOCKER |
| D3 | Política de pérdida de originales confirmados (0 vs hasta 1 h) | El RPO objetivo no es decidible |
| D4 | Aprobación de S3 como autoridad productiva (DEC-113 es sólo backups) | El scope aprobado no cubre autoridad |
| D5 | Retención/Object Lock compatible con purga ≤30 d | Riesgo de incumplir DEC-092 |
| D6 | Cadencia del anchor-writer y `ANCHOR_MAX_LAG` | `actualityLag` no calibrable |
| D7 | Presupuesto (incluye recursos temporales de ensayo) | Sin laboratorio no hay evidencia |
| D8 | Aceptación del coste de latencia sin caché positiva | Alternativa sería relajar AQR-001 (rechazado) |

## 25. Secuencias de operación (normal, concurrente, fallida)

### 25.1 Normal — alta sensible con ACK

```
Cliente → API: operación sensible (p.ej. revocar sesión)
API → S3: GET prepared/{operationId}                 (N1)
API → S3: PUT prepared/{operationId} If-None-Match:* (N2)
API → S3: GET head.json                              (N3)
API → S3: PUT candidate/{attemptId} If-None-Match:*  (N4)
API → S3: PUT head.json If-Match:{etag}   ── PREPARE ──► 200
API → PG: BEGIN; aplicar cambio + audit + preparedReceipt; COMMIT
API → S3: PUT candidate/{attemptId2} / PUT head.json  ── ACK ──► 200
API → S3: PUT attempts/...                            (traza)
API → Cliente: éxito  (sólo tras ACK durable)
```

### 25.2 Concurrente — dos escritores, misma operación y distinta operación

```
W1: GET head @etag=E1, seq=40
W2: GET head @etag=E1, seq=40
W1: PUT candidate/a1 ; PUT head If-Match:E1 → 200 (seq=41, op=OP-A)
W2: PUT candidate/a2 ; PUT head If-Match:E1 → 412
W2: GET head @E2 → seq=41, recentOperations={OP-A:41}
     · si W2.operationId == OP-A → devolver receipt (idempotente)
     · si W2.operationId == OP-B → PUT head If-Match:E2 → 200 (seq=42, op=OP-B)
Huérfano: candidate/a2 (no referenciado) → lifecycle; NO es hecho
```

Resultado: una única cadena, secuencias únicas, ninguna operación duplicada, huérfano inerte.

### 25.3 Fallida — ACK ambiguo del COMMIT

```
API → S3: PUT head If-Match:E5 (COMMITTED, receipt=rcpt-OP-X) → TIMEOUT (sin respuesta)
API → S3: GET head.json
     · head.recentOperations[OP-X] == COMMITTED  → éxito (ACK resuelto)
     · sólo PREPARED presente                    → ambigua ⇒ barrera conservadora
                                                   + reintentar ACK con mismo receipt
     · índice no verificable                     → UNKNOWN_OPERATION (fail-closed)
API → PG: NO se reabre nada; NO se invoca resolveAbort por ausencia de fila
```

### 25.4 Fallida — rollback del bucket y ancla adelantada

```
API → S3: GET head.json → seq=120, digest=D120, incarnation=I1
API → S3(ancla): GET anchor/current.json → headSequence=131, headDigest=D131, incarnation=I1
Comparación: head.sequence(120) < anchor.headSequence(131) ⇒ ROLLBACK_DETECTED
Acción: barrera activa; no reapertura; escalar al control-plane; reinstalar ancla con registro
```

## 26. Registro

Sin ejecución de infraestructura AWS, Terraform ni recursos. Sin asignación ni delegación de responsabilidades. Todas las pruebas (T1–T13, E1–E6) están **NOT_EXECUTED**; ninguna cifra de coste es una medición. Fuentes: `docs/aws-beta-technical-evaluation.md`, `docs/aws-beta-ticket-closure-plan.md`, `docs/adr/beta-backups-and-recovery-authority.proposed.md`, `.codex/context/dec-112-recovery-authority-persistence.md`, `.codex/context/operations-and-recovery.md`, `.codex/context/media-and-jobs-architecture.md`, `.codex/context/architecture-decisions.md`, `packages/identity/src/recovery-authority-adapter.ts`.

## 27. Dictamen de preparación para el gate arquitectónico

**Dictamen: NO LISTO — CHANGES_REQUESTED atendido documentalmente; pendiente de re-revisión y de aprobaciones.**

| Hallazgo previo | Estado documental | Bloqueo restante |
|---|---|---|
| P0-1 reintentos CAS / candidatos inmutables | **RESUELTO** en el ADR | Requiere prueba T3/T5 |
| P0-2 actualidad del ancla externa | **RESUELTO** en el ADR | BLOCKER: forma del ancla (D2) y prueba T2 |
| P1-1 caché de lecturas vs revocación | **RESUELTO**: caché positiva retirada | Requiere prueba T8 y aceptación del coste (D8) |
| P1-2 watermark recuperable multimedia | **RESUELTO** en el ADR | BLOCKER: RPO no medido (E1–E6, R5) |

Condiciones para pasar a **READY_FOR_ARCHITECTURE_GATE**: D1–D8 decididas; ancla externa probada (T2); protocolo con evidencia adversarial real (T3–T5); RPO medido (E1–E6); retención/Object Lock compatibles con purga (T12). Hasta entonces, EL-TK-245 permanece **DRAFT**, REQUIREMENTS_READY conforme a su estado actual, READY_FOR_IMPLEMENTATION: **NO**, y **no se promueve ningún ticket**.
