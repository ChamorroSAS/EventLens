# ADR propuesto — S3 como RecoveryAuthority y RPO multimedia Beta

Estado: **PROPOSED / NOT_ACCEPTED / TECHNICAL_GATES_PENDING**. Propuesta: 2026-10-15. Trazabilidad: CR-011, EL-TK-245, EL-EP-020, DEC-112, DEC-113, AQR-001, ARCH-010.

Alcance aprobado vigente (DEC-113): sólo S3 para backups externos y filesystem/EBS como almacenamiento operativo. DynamoDB, S3 como autoridad productiva y RPO media ≤1 h permanecen **PENDING**. Este documento diseña y acota lo no aprobado; no lo aprueba ni lo implementa.

## Clasificación


| Clase | Elemento |
|---|---|
| **CONFIRMED** | us-east-1; dos eventos simultáneos; EC2 única de aplicación; PostgreSQL Docker sobre EBS; media operativa filesystem/EBS sin gateway S3; destino S3 autorizado para backups externos |
| **RECOMMENDED** | Proveedor de autoridad: S3 CAS como alternativa de laboratorio, DynamoDB on-demand como candidato preferido de implementación (diseño geométrico común) |
| **RECOMMENDED** | RPO media ≤1 h medido desde el último original/manifest recuperable verificado, con alerta previa al límite |
| **PENDING** | Aprobación de S3 como autoridad productiva; ancla de actualidad y reconstrucción; política de pérdida de originales confirmados; proveedor filesystem Beta; presupuesto y IAM/claves |
| **BLOCKER** | Ancla de encarnación/actualidad independiente y probada; protocolo PREPARE→SQL→ACK con evidencia adversarial real; ausencia de ensayo PITR/antirollback efectivo |

## 1. Contexto

PostgreSQL y su PITR no pueden ser autoridad de revocaciones: restaurar a $T_{restore}$ resucitaría credenciales, sesiones, invitaciones y solicitudes de borrado canceladas entre $T_{restore}$ y $T_{crash}$ (AQR-001, DEC-112). La autoridad debe residir fuera de la línea temporal de restauración, con `PREPARE → SQL → ACK`, fail-closed y denegación conservadora de estados ambiguos.

La petición del usuario autoriza evaluar S3 Object Lock + Conditional Writes (CAS) como RecoveryAuthority productiva y formalizar RPO multimedia ≤1 h. Conserva DEC-113: media operativa en filesystem/EBS, S3 para backups externos.

Decisión adoptada de referencia (DEC-112, RECOMMENDED): volumen/directorio aislado + journal append-only encadenado + checkpoint atómico + protocolo PREPARE/SQL/ACK + fail-closed. **Este ADR no modifica DEC-112**: propone S3 como proveedor alterno del mismo contrato, y sólo para Beta.

## 2. Amenaza y modelo de fallo

| Escenario | Exigencia |
|---|---|
| Restore PG a un pasado | Reaplicar hechos COMMITTED posteriores; PREPARED sin ACK permanece con barrera |
| Rollback operativo accidental | Un checkpoint/hash válido pero antiguo no se acepta como vigente |
| Escritor honesto concurrente | Serialización de publicaciones; forks no publicados |
| Escritor privilegiado comprometido | **Fuera de alcance**: CAS y hash no impiden que un escritor con IAM de control‑plane publique datos falsos |
| Bucket recreado con el mismo nombre | Detección por ancla de encarnación independiente |
| Autoridad ausente/reemplazada/perdida | Servicio cerrado; sin bootstrap automático |
| Red incierta / ACK ambiguo | Relectura canónica; nunca éxito antes del ACK durable |

## 3. Protocolo S3 propuesto

### 3.1 Encarnación y ancla de actualidad (PENDING / BLOCKER)

1. `authority/incarnation/current.json` (fuera de PostgreSQL): `{incarnationId, epoch, account, bucket, region, boundaryDigest, activatedAt, activationTranscript}`. ARN/nombre no detectan recreación.
2. **Ancla externa** obligatoria: la prueba de vigente se conserva fuera del bucket operativo — segundo bucket en otra cuenta con Object Lock COMPLIANCE y rol separado, o registro del control‑plane con retención propia. Un bucket recreado con el mismo nombre no recupera la ancla; sin ancla concordante el servicio permanece cerrado.
3. Toda publicación y toda lectura declara `incarnationId`. Divergencia ⇒ `AUTHORITY_SUPERSEDED`.

### 3.2 Publicación CAS (dos objetos)

- **Candidato**: `journal/candidate/{operationId}.json` con `If-None-Match: *`. Contiene hechos, fingerprint, sequence pretendida. Perdedor de la carrera = huérfano, no PREPARE.
- **HEAD canónico**: `authority/head.json` con `If-Match: {etag del HEAD leído}`. Es el único punto de publicación. Pierde ⇒ 412 ⇒ releer HEAD, y:
  - si la operación ya está publicada (mismo `operationId`/fingerprint), devolver el receipt original (idempotencia);
  - si no, reintentar contra el nuevo HEAD sin reenviar material sensible.

`previousDigest`, `sequence`, `epoch` y `checkpointSequence` se verifican en aplicación: `sequence(nuevo)=sequence(HEAD)+1`, `epoch` no decreciente, `previousDigest=digest(HEAD)`. **No** se usa LIST "mayor secuencia", `versionId` ni timestamp como orden lógico.

### 3.3 Epoch, sequence, checkpoints y floors

- `epoch`: se incrementa antes de reabrir un scope post‑PITR; valida sesiones/leases/grants (`auth_time` anterior ⇒ `RECOVERY_EPOCH_SUPERSEDED`).
- `sequence`: monotónica global del journal; `sequence` por sujeto derivada del head del sujeto.
- `checkpoint/{n}.json`: objeto inmutable con `checkpointSequence`, digest del último registro, floors y barreras; se publica por HEAD. El checkpoint no se crea reescribiendo objetos previos.
- `floors` (watermarks de revocación/credential revision) y `barriers` (por scope) sólo suben, nunca bajan. Un floor activo no recibe TTL automático.

### 3.4 Writer único lógico

- HEAD global serializa las publicaciones; no se admite dual‑write improvisado ni dos autoridades activas.
- El **primer** escritor de cada `operationId` gana; el segundo reintenta con idempotencia por fingerprint.
- Contención medida en laboratorio: p50/p95/p99 de reintentos por evento (2 y 8 escritores). Coste de contención asumido en el escenario C.

### 3.5 Reintentos idempotentes y ACK ambiguos

- `operationId` + fingerprint determinista: repetir PREPARE/ACK no crea restricción nueva.
- ACK perdido (timeout tras PUT): releer HEAD canónico; sólo el ACK publicado cuenta. Un ACK ausente deja la operación en estado ambiguo ⇒ barrera conservadora, nunca reapertura ni purga.
- Abort: requiere prueba del intento original. La ausencia de una fila en la DB restaurada **no** prueba abort.

### 3.6 Fail-closed

`HEAD` ausente, timeout, digest inválido, encarnación cambiada, frontera/epoch desconocido o gap ⇒ `AUTHORITY_UNAVAILABLE | CORRUPTED_ARTIFACT | GAP_DETECTED | AUTHORITY_SUPERSEDED` y denegación de sesión/verificación. `If-None-Match: *` **no** se usa como recuperación automática: una clave borrada con delete marker se ve ausente.

## 4. Recuperación de PostgreSQL sin restaurar revocaciones antiguas

1. Activar barrera de recuperación fuera del PITR; detener writers.
2. Reconciliar **desde la autoridad vigente** (nunca desde un backup del journal): hechos COMMITTED con `sequence > sequence del snapshot` se reaplican (`ADMIN_PRINCIPAL_REVOKED`, `CREDENTIAL_ROTATED`, `SESSION_REVOKED`, MOD-002/003/008).
3. PREPARED sin ACK: barrera sobre el sujeto; sólo resolución autorizada o ACK diferido con evidencia.
4. Nuevo `recovery epoch`; invalidar leases restaurados, grants y sesiones previas; revisar emails/exports ya ejecutados.
5. Reconciliar objetos/refs/quotas (inventario + tombstones; nunca liberar cuota automáticamente).
6. Verificación cruzada: hash/epoch/revision ninguno resucitado. Si la autoridad no está vigente ⇒ permanecer cerrado aunque PG esté sano.

## 5. Autoridad perdida, ausente o reemplazada

| Situación | Comportamiento |
|---|---|
| Timeout/403/404/5xx | Cerrado; sin bootstrap; sin caché positiva TTL que simule vigencia |
| Bucket recreado (mismo nombre) | Ancla externa no concuerda ⇒ `AUTHORITY_SUPERSEDED`; requiere autorización del control‑plane |
| Autoridad reemplazada/probada | Reemplazo **no** bootstrap: se exige cadena íntegra + prueba externa de actualidad. Restaurar backup de PG no reinicia floors |
| Réplica incompleta | Tratada como autoridad ausente |

Reconstrucción (propuesta, PENDING): compuesta por (a) ancla externa conservada, (b) checkpoint compactado + cola posterior de hechos, (c) prueba de continuidad por digest entre checkpoint y head escrita por **un auditor con rol distinto del runtime**. Sin los tres, no hay reapertura de credenciales.

## 6. Protección IAM, Object Lock y política de retención

- **Roles separados**: runtime (publicación CAS, lectura head/facts/checkpoint), backup writer, restore reader, purge/compactador, control‑plane (ancla, IAM, lifecycle). Runtime sin `DeleteObject`, sin lifecycle sobre el HEAD canónico, sin control‑plane.
- **Política de bucket**: exige conditional writes (`x-amz-*`); deniega PUT incondicional sobre `authority/head.json`, `DeleteObject`/`DeleteObjectVersion` del HEAD, copy sobre objetos publicados, lifecycle sobre HEAD, bypass de retención.
- **Object Lock**: **sólo** donde sea compatible con purga y compactación, con retención finita alineada al horizonte PITR ≥7 d y a los plazos DEC-092/097..099 (principal ≤7 d, técnica ≤30 d). No activar legal hold automático. Versioning no impide nuevos PUT ni delete markers.
- **Compactación**: poda por checkpoint verificada, con retención mínima de hechos que sostienen floors activos; sin TTL a floors.
- **Límite declarado**: la política no valida que el JSON del nuevo HEAD avance secuencia; un escritor privilegiado con permiso de PUT condicional sigue siendo amenaza.

## 7. Latencia y coste esperados

- Publicación de PREPARE ≈ 2 llamadas S3 (candidato + HEAD) y ACK otras 2: 4 PUT por operación lógica, más 1–2 lecturas fuertes de HEAD por validación. Modelo S3 autoridad: **US$0.42/2.85/14.12** por mes (A/B/C) + almacenamiento de versiones 1/2/5 GB. No es equivalencia funcional con DynamoDB; replay/contención multiplican.
- **Latencia dentro de la transacción SQL es inaceptable** (AQR-001): la lectura de autoridad debe salir de la transacción; se propone ventana de validez corta (por ejemplo 1–5 s) sólo para lecturas de sesión con verificación conservadora, y publicación CAS fuera de la transacción. *Riesgo*: toda optimización de lectura debe probarse contra reapertura por relectura.
- Coste DynamoDB on-demand (candidato preferido): 16 WRU/operación lógica ⇒ **US$0.28/1.70/7.15** (A/B/C) + storage/PITR. Decisión de proveedor sigue PENDING; este ADR no fija precio como contrato.

## 8. RPO multimedia ≤1 h

### 8.1 Semántica de durabilidad y confirmación

- Confirmado al usuario = persistido en el almacenamiento operativo (EBS) y con receipt. **No** duplica.
- Duradero externamente = presente en S3 con manifiesto verificable (identidad lógica, receipt, hash y archivo exacto).
- RPO medido = edad del **último original/manifest recuperable verificado**. No es la frecuencia del cron ni un job verde.

### 8.2 Alternativas

| Opción | Promete realmente | Coste/impacto |
|---|---|---|
| Backup periódico (objetivo ≤1 h) | Puede perderse lo confirmado tras el último punto verificado | Menor complejidad; RPO requiere medición bajo carga/outage |
| Copia exterior antes de confirmar durabilidad | Cero pérdida de originales confirmados dentro del modelo de fallo | Cambia el flujo de confirmación y la latencia; **no** convierte a S3 en almacenamiento operativo |
| Snapshot periódico como único respaldo | Sólo último punto consistente | Insuficiente: no acredita PITR ni atomicidad receipt/media |

**Recomendación para revisión**: si la Beta admite explícitamente perder hasta una hora de recuerdos ya confirmados, adoptar backup periódico y **medir**; si es inaceptable, diseñar durabilidad exterior antes del éxito. **No** aprobar ≤1 h por conveniencia de coste.

### 8.3 Cadencia, verificación, inventario y checksums

- Cadencia continua por objeto (candidata) + full diario/WAL de PostgreSQL (pgBackRest) hacia S3 Standard cifrado, separado del bucket de autoridad.
- Verificación en dos fases: checksum/manifest en escritura y validación de restore periódica (inicial antes de Beta, luego mensual y tras cambios sustanciales).
- Inventario: originales sellados y manifiestos con `mediaRef`, `generation`, `sha256`, `bytes`, `intentId`, `receipt`, `objectKey`, `replicatedAt`. Los originales **CONFIRMING** también se respaldan cuando la operación debe poder completarse.

### 8.4 Compatibilidad restauración media/PITR SQL

1. Recuperar PG al target y media/manifiestos.
2. Consultar autoridad vigente independiente.
3. Reconciliar COMMITTED/PREPARED, epochs, revisiones y barreras.
4. Reconciliar inventario: recibos sin original ⇒ inconsistencia; original con hash incorrecto ⇒ no publicar.
5. Reconstruir ledger de consumo desde inventario confirmado + tombstones; **no** liberar cuota automáticamente.

### 8.5 Missing y tombstones

- `Missing` verificado = inconsistencia + alerta P1; nunca generar archivo vacío ni marcar DELETED por timeout.
- Tombstones y purga: las copias técnicas rotan/purgan con evidencia ≤30 d desde `purge_started_at` (ancla UTC). Versioning no elimina al borrar la clave: usar inventario, eliminación explícita y verificación.

### 8.6 Alertas y RPO incumplido

| Métrica | Umbral | Acción |
|---|---|---|
| Edad del último original/manifest recuperable | advertencia 45 min, **incumplimiento 60 min** | P1, runbook, decisión de recuperación |
| Retraso de replicación/backup | cerca del límite | Alerta + escalado |
| Fallo de verificación/manifest | inmediato | Bloqueo de publicación hasta reconciliar |
| Restore drill | fuera de ventana | P1; no declarar RTO |

Un RPO incumplido se registra con evidencia (timestamps UTC, inventario, hashes) y bloquea la promoción; no se rellena con valores inventados.

### 8.7 Retención, eliminación y purga

S3 backups con versionado requiere expiración explícita de *todos* los objetos versionados (incluidas copias técnicas) dentro del plazo ≤30 d; los packs/restic se eliminan por contenido, no por nombre de archivo. Objetos bajo retención/Object Lock incompatibles con purga se prueban o se rechazan.

### 8.8 Ensayo de pérdida de EBS

Destruir únicamente entorno desechable autorizado; host limpio desde runbook; recuperar PG (PITR), media e inventario desde S3; reconciliar autoridad; RTO ≤4 h cronometrado incluyendo reconciliación. **NOT_EXECUTED**: el ensayo no se ha ejecutado; no se declara RTO/RPO alcanzado.

## 9. Matriz de impacto contractual

| Contrato | Impacto propuesto | Preservado |
|---|---|---|
| TC-002 / DEC-062 | S3 cambia destino de backup, no relaja full diario + WAL continuo, ≥7 d, RPO DB ≤1 h, RTO ≤4 h | ✅ |
| TC-003 / DEC-063 | Excepción Beta explícita para filesystem operativo; ObjectStorage neutral, grants, hash/version/receipt, cuotas, privacidad, purga | ✅ (requiere aprobación) |
| DEC-061 / TC-001 | 2 simultáneos no acredita capacidad; límites de archivos/bytes siguen vigentes | ✅ |
| DEC-061/063, EL-TD-008 | La petición como autoridad necesita decisión explícita; no se infiere de "media externa" | ⚠️ PENDING |
| DEC-112 | Mantiene RECOMMENDED; S3 es proveedor alterno del mismo contrato, no una relajación | ✅ |
| ARCH-010 / ARCH-011 | PREPARE→SQL→ACK y separación API/worker/scheduler preservados; sin commit distribuido | ✅ |
| DEC-092/097/098/099 | Purga ≤30 d; sin legal hold automático; ancla UTC | ✅ |
| DEC-113 | Ampliación a autoridad/RPO requiere aprobación expresa adicional | ⚠️ PENDING |
| AQR-001 / AQR-004 | Denegación conservadora, reconciliación y métricas de recuperación intactas | ✅ |
| EL-TK-222 / EL-TK-252 | Evidencia SQL simulada no se reetiqueta; la autoridad Beta sigue sin despliegue acreditado | ✅ |
| EL-TK-257 / 258 / 262 | Destino S3 desbloqueado; restore real y antirollback siguen PENDING | ⚠️ |

## 10. Matriz de pruebas (propuesta)

| Ensayo | Criterio verificable | Estado |
|---|---|---|
| S3 adversarial: delete marker, replay versión antigua, PUT sin CAS, headers ausentes, bucket recreado, HEAD ausente | Denegación IAM; detección de encarnación/frontera; nunca bootstrap automático | NOT_EXECUTED |
| Multiwriter 2/8 con misma revisión y operaciones iguales/distintas | Una cadena/head canónicos; secuencias únicas; floors no decrecen; huérfanos no publicados | NOT_EXECUTED |
| Fronteras PREPARE/SQL/ACK (kill/timeout antes/después de cada confirmación) | Una operación lógica; nunca éxito previo al ACK durable; receipt/revisión correctos | NOT_EXECUTED |
| PITR real post-revocación (t0 backup, t1 target, t2 revocar) | Autoridad permanece en t2; deny de credenciales revocadas; PREPARED conservador; RPO≤1h/RTO≤4h cronometrados | NOT_EXECUTED |
| Pérdida de autoridad (timeout/403/404, bucket/tabla ausente, réplica incompleta, ancla antigua) | Servicio cerrado; sólo reconstrucción con actualidad demostrada | NOT_EXECUTED |
| Checkpoints (truncar/corromper/sustituir prefijo/digest) | Fail-closed y alarma; sin aceptar cadena antigua como vigente | NOT_EXECUTED |
| Media+SQL (mismatch inventario, receipt CONFIRMING, copia parcial, hash incorrecto, purge posterior al target) | No publicar corruptos/ausentes ni resucitar purgados | NOT_EXECUTED |
| Pérdida de EBS + recuperación | RTO completo ≤4 h; inventario y receipts reconciliados; coste del ensayo registrado | NOT_EXECUTED |
| IAM/cifrado (matriz allow/deny; claves ausentes/rotadas) | Sin lectura pública; restore descifrable; runtime sin borrado de autoridad | NOT_EXECUTED |
| Retención/purga (anclas UTC, delete markers, packs, bordes 7/30 d) | Bytes/versiones elegibles inaccesibles y eliminados antes de plazo; sin romper PITR ni floors | NOT_EXECUTED |

## 11. Criterios de aceptación para el gate arquitectónico

1. Aprobación expresa del proveedor de autoridad (S3 o DynamoDB) y de la política de pérdida/RPO.
2. Ancla de encarnación/actualidad externa, probada, con reconstrucción auditada.
3. Evidencia adversarial real (multiitem/CAS, ACK ambiguo, PITR post‑revocación) sin SQL simulado.
4. Excepción DEC-063/TC-003 aprobada con preservación de ObjectStorage/grants/purga.
5. Presupuesto completo (incluidos recursos temporales de ensayo) dentro del objetivo o con desviación aprobada.
6. Ningún ticket promovido a READY/DONE ni contrato histórico modificado por este ADR.

## 12. Registro

Sin ejecución de infraestructura AWS, Terraform ni recursos. Sin asignación ni delegación de responsabilidades. Todas las pruebas listadas están **NOT_EXECUTED**; ninguna cifra de coste es una medición. Fuentes: `docs/aws-beta-technical-evaluation.md`, `docs/aws-beta-ticket-closure-plan.md`, `docs/adr/beta-backups-and-recovery-authority.proposed.md`, `.codex/context/dec-112-recovery-authority-persistence.md`, `.codex/context/operations-and-recovery.md`.
