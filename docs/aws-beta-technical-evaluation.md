# Phoeve — Evaluación técnica de EL-TK-245 / CR-011

Actualización 2026-10-15: el usuario aprobó sólo S3 para backups y filesystem/EBS operativo; autoridad y RPO siguen pendientes. Ver [aprobación parcial y cierre de tickets](aws-beta-ticket-closure-plan.md) y DEC-113. Standard continúa recomendada; no se adoptó DynamoDB. El análisis de abajo conserva la evaluación original, sin promover gates.

Fecha local: 2026-10-14. Estado: **PROPOSED / FOR_REVIEW**. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
Evaluación propia; no equivale a los gates independientes requeridos. Sin delegación ni asignación de responsabilidades. No se ejecutó Terraform ni se crearon recursos AWS. La consulta de precios fue HTTP público, sin credenciales.

## 1. Recomendación y decisiones

Recomendar **S3 Standard para backups externos** y **DynamoDB Standard on-demand como candidato para RecoveryAuthority**. Mantener multimedia operativa en filesystem/EBS. S3 como autoridad es técnicamente evaluable mediante un protocolo propio de publicación CAS, pero Versioning + Object Lock no constituyen por sí solos un journal monotónico. La diferencia de costo inicial no justifica asumir equivalencia ni simplificar las garantías.

| Clasificación | Decisión / alcance | Consecuencia |
|---|---|---|
| CONFIRMED | us-east-1; dos eventos simultáneos de prueba | Región cerrada; volumen, rotación mensual y retención de eventos aún requieren validación |
| CONFIRMED | Una EC2; PostgreSQL Docker y multimedia en EBS; media operativa filesystem, sin gateway S3 | No sustituir por MinIO en producción ni poner development para eludir guards |
| CONFIRMED | Terraform + GitHub Actions; phoeve.com y beta.phoeve.com previstos | No acredita compra/control DNS ni autorización de apply |
| CONFIRMED | Evaluar S3 para backups y autoridad | Autoriza evaluación; no adopta S3 ni cambia DEC aceptadas |
| RECOMMENDED | Backups S3 Standard, cifrados, separados de autoridad | Menor complejidad de restauración caliente; verificar purga y versiones |
| RECOMMENDED | Autoridad DynamoDB on-demand, lecturas fuertes y transacciones condicionales | Implementación y evidencia de antirollback pendientes |
| RECOMMENDED | t4g.medium candidata, concurrencia pesada inicial 1 | No constituye capacidad aprobada; ARM64 nativo y presión de memoria pendientes |
| RECOMMENDED | RPO media de laboratorio ≤1 h; alarmas antes del límite | Requiere aprobación; no prometer pérdida cero tras confirmar una carga |
| PENDING | Proveedor definitivo de autoridad, ADR y excepción filesystem | No modificar DEC/ARCH/TC hasta aprobación expresa |
| PENDING | RPO media, retención efectiva, cuotas operativas y presupuesto completo | El objetivo US$35–50 sólo resulta plausible en carga ligera |
| PENDING | DNS, credenciales de recuperación, ancla vigente, gates HCP/GitHub | No confundir previsión de dominio o tier gratuito con disponibilidad acreditada |

Propuesta para revisar: [ADR](adr/beta-backups-and-recovery-authority.proposed.md). Los contratos aceptados siguen vigentes mientras permanezca PROPOSED.

## 2. Evidencia del repositorio y límites

| Fuente inspeccionada | Hallazgo verificable / límite |
|---|---|
| `.codex/product/tickets/EL-TK-245.md`, `changes/CR-011.md`, `epics/EL-EP-020.md` | Planificación DRAFT; 245 no acredita infraestructura ni despliegue |
| `.codex/context/operations-and-recovery.md` | Full PostgreSQL diario, WAL continuo, horizonte ≥7 días, copias exteriores; RPO DB ≤1 h, RTO servicio ≤4 h incluyendo reconciliación |
| `.codex/context/architecture-decisions.md`, `technical-baseline.md`, `.codex/product/decisions.md`, `changes/CR-002.md` | TC y DEC aceptados; no se reescriben en esta evaluación |
| `packages/identity/src/contracts.ts` | RecoveryAuthorityPort tiene PREPARE, ACK, abort, checkpoint, facts, barrera y reconciliación; métodos opcionales no prueban wiring productivo |
| `packages/identity/src/recovery-authority-adapter.ts` | Journal local/checkpoint con fsync y estado en memoria; sin CAS distribuido entre procesos |
| `apps/api/src/identity/local-admin-authority.ts` | Wrapper local exige journal/checkpoint existentes; no atribuirle bootstrap vacío automático |
| `packages/identity/src/authentication.ts`, `refreshSession` | Lecturas de autoridad dentro de transacción SQL; reemplazar memoria local por llamadas remotas cambia latencia y tiempo de locks |
| `packages/identity/test/recovery-scenarios.unit.test.ts` | SimulatedPostgresWithSnapshot; no demuestra restore PostgreSQL real con WAL |
| `apps/api/src/app.module.ts`, `docs/aws-beta-audit.md` | Wiring local de desarrollo; no evidencia suficiente de autoridad Beta completa para todos los módulos |
| `docs/aws-beta-audit.md`, `docs/aws-beta-plan.md` y transferencia EL-TK-265 | Transferencia real privada en MinIO de desarrollo hasta CONFIRMING; no demuestra proveedor filesystem Beta, aceptación, worker ni publicación |

Verificación estructural: grafo EventLens consultado, índice sin cobertura de los archivos de identidad utilizados; conclusiones obtenidas leyendo fuente directamente, no por ausencia de resultados del grafo. Configuración y contratos documentales se leyeron directamente. No se ejecutaron pruebas cloud, ARM64, PITR ni benchmarks en esta evaluación.

DEC-112 figura RECOMMENDED mientras EL-TK-222 aparece DONE y su evidencia A–G incluye SQL simulado. Reconciliar mediante decisión/evidencia prospectiva; conservar historia y no presentar ese DONE como aprobación de recuperación productiva. El adaptador local no es una autoridad independiente del host si se despliega en el mismo EBS.

## 3. Autoridad: comparación de garantías

Modelo de fallo: restore PostgreSQL a un pasado, pérdida del host, escritores concurrentes honestos, procesos obsoletos, red incierta y rollback operativo accidental. Ninguna alternativa garantiza por sí sola resistencia a un administrador AWS plenamente comprometido o a código autorizado malicioso. La cadena hash detecta alteraciones internas; no demuestra que una cadena antigua sea la más reciente.

| Dimensión | S3 Versioning + Object Lock + conditional writes | DynamoDB propuesto |
|---|---|---|
| 1. PREPARE → SQL → ACK | Publicar PREPARE mediante CAS de HEAD antes de SQL; publicar ACK separado después. Subir un objeto candidato no basta | TransactWrite publica PREPARE antes de SQL y otro publica ACK después; no es transacción distribuida con PostgreSQL |
| 2. Monotonicidad | Secuencia/digest deben validarse en aplicación; ETag es token CAS opaco, no secuencia ni SHA-256 | Update condicional de secuencia/epoch y alta de fact en una transacción; validación de esquema y digest sigue siendo necesaria |
| 3. Concurrencia | Un HEAD global serializa; conflicto 412/409 exige releer y reintentar. Varias claves no tienen transacción conjunta | Head global con condición serializa; fact, operación y floor/barrier actualizados atómicamente. Medir contención |
| 4. Durabilidad antes del éxito | PREPARE sólo durable/autoritativo tras publicación del HEAD; éxito de revocación sólo tras ACK publicado | PREPARE y ACK sólo tras confirmación durable de sus transacciones; no confirmar sólo por commit SQL |
| 5. Idempotencia / ACK incierto | Operación y fingerprint en historia canónica; releer tras timeout. Objetos huérfanos no son hechos publicados | Registro durable de operationId/fingerprint; ClientRequestToken tiene ventana de 10 minutos y no reemplaza ese registro |
| 6. Checkpoints | Objeto inmutable con secuencia/digest referenciado por HEAD; verificar cadena y frontera compactada | Checkpoint ligado a head/epoch y floors, lectura consistente; no aceptar exportación antigua como autoridad vigente |
| 7. Rollback / delete markers | Object Lock protege versiones, no impide nuevas versiones ni delete markers. Denegar deletes/overwrite sin CAS y comprobar encarnación | Sin versiones S3; denegar borrado, TTL de floors y cambio de tabla; protección de borrado no equivale a WORM |
| 8. Pérdida / indisponibilidad / reconstrucción | Fail-closed. Bucket inexistente/recreado o HEAD ausente no autoriza bootstrap. Necesita prueba independiente de actualidad | Fail-closed. Restore PITR crea tabla nueva; cambiar a ella no acredita actualidad. Necesita ancla y reconstrucción probadas |
| 9. PostgreSQL restaurado | Reaplicar COMMITTED y tratamiento conservador de PREPARED desde autoridad actual, nunca desde backup antiguo del journal | Igual; DynamoDB no se restaura junto con PostgreSQL como si fuese una proyección SQL |
| 10. IAM | Separar runtime, backup writer, restore reader, purge y control-plane. Denegar bypass retention y deletes del HEAD | Acciones subyacentes GetItem/Query/PutItem/UpdateItem/ConditionCheckItem limitadas a tabla y transacciones; sin DeleteItem/control-plane runtime |
| 11. Retención / purga | Lock finito puede impedir purga; no activar legal hold. No mezclar media/PII con floors durables | Floors mínimos sin TTL mientras necesarios; TTL es asíncrono y no sirve para plazos legales estrictos |
| 12. Costos | Almacenamiento barato; GET por validación y ≥4 PUT por operación lógica del modelo, más conflictos/checkpoints | WRU/RRU y transacciones; en modelo pequeño cuesta centavos–pocos dólares. Tamaños/reintentos alteran costo |

Fuentes de garantías: [consistencia S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel), [conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [transacciones DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), [lecturas consistentes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html). La composición del protocolo descrita aquí es una propuesta propia, no garantía turnkey de AWS.

### Protocolo S3 candidato: condiciones necesarias, no implementadas

1. Provisionar explícitamente una encarnación UUID y ancla de confianza independiente de PostgreSQL; registrar cuenta, bucket, región, epoch y prueba de frontera vigente. ARN/nombre solos no detectan recreación con el mismo nombre.
2. Crear objeto candidato inmutable con `If-None-Match: *`: encarnación, epoch, secuencia, predecessor/digest, operationId, phase, fingerprint y hechos mínimos. Un candidato que pierde la carrera queda huérfano, no es PREPARE válido.
3. Publicar su referencia mediante `If-Match` sobre el ETag del único HEAD canónico. Ese CAS es el punto de publicación. Un perdedor relee historia canónica; si la operación ya está publicada retorna el receipt original, si no genera otro candidato con predecessor vigente.
4. PREPARE publicado impone barrera/floor; SQL persiste receipt/revisión; ACK agrega otro hecho y CAS. Un ACK perdido se resuelve leyendo la operación durable. No resolver abort porque falte una fila tras PITR; exigir prueba de aborto del intento original.
5. Checkpoint immutable con digest y fronteras de floors/idempotencia, publicado por HEAD. Nunca elegir «mayor secuencia del LIST»: puede ser candidato huérfano. Tampoco usar fecha/versionId como orden lógico.
6. Lecturas verifican HEAD fuerte y snapshot coherente de epoch/floors. Cache positiva con TTL no demuestra revocación inmediata; definir validación de vigencia y fencing. Separar IO remoto de locks SQL sin abrir carrera de autorización.
7. Política exige conditional headers; prohíbe DeleteObject/DeleteObjectVersion del HEAD, copy/put incondicional, lifecycle sobre HEAD y bypass de retención al runtime. La política no valida que el JSON del nuevo HEAD avance secuencia. Lectura de versión antigua y re-PUT con ETag actual sigue siendo amenaza si el escritor está comprometido.
8. HEAD ausente, timeout, hash inválido, encarnación cambiada o frontera desconocida mantienen barrera. `If-None-Match: *` considera ausente una clave cuyo current es delete marker: jamás usarlo como recuperación automática. Object Lock no prueba cuál es el HEAD actual. Reconstrucción exige cadena completa y prueba externa de actualidad; sin ella no reabrir credenciales.

[Enforcement de conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html) y [gestión de Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html) sustentan las limitaciones. El ancla de actualidad, su actualización y su recuperación son **PENDING** en ambas alternativas; no se resuelve ese requisito copiando checkpoints al mismo backup de PostgreSQL.

### Modelo DynamoDB recomendado para probar

Tabla regional Standard on-demand con head global, facts inmutables, idempotencia durable y floors/barriers por sujeto. PREPARE transaccional: Update head con condición de revisión + Put fact si ausente + registro de operación + floor/barrier. ACK usa patrón equivalente y receipt SQL comprobado. No combinar ConditionCheck y Update del mismo item en una transacción. Respetar límites de 100 items distintos/4 MB por transacción y 400 KB por item; dividir operaciones multisujecto exige diseño explícito, no fragmentación silenciosa.

Get/Query fuertes sobre tabla base, no GSI eventualmente consistente ni Streams como fuente de autorización. IAM utiliza acciones de items y `dynamodb:EnclosingOperation` cuando corresponda; no inventar una autorización aislada `TransactWriteItems`. Runtime no puede borrar tabla/items, restaurar/importar, desactivar protección ni reasignar autoridad. [IAM transaccional](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

PITR de DynamoDB es auxiliar: [restaura una tabla nueva](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_RestoreTableToPointInTime.html). No autorizar un switch a un estado anterior como respuesta automática a un incidente. [TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html) no es borrado puntual garantizado. No declarar DynamoDB aprobado sólo por disponer de transacciones.

## 4. Backups y restauración

**PostgreSQL:** candidato pgBackRest con full diario y WAL continuo; mantener cadenas recuperables de ≥7 días. Probar `archive_timeout` de 300 s, cola/spool acotada, alarmas y margen de reintentos para RPO ≤1 h. Upload de WAL sólo se considera archivado tras persistencia exterior confirmada. Verificar WAL del período inactivo, corrupción, pérdida del host y saturación de disco. `pg_dump` y snapshots EBS son complementarios, no PITR. [PostgreSQL continuous archiving](https://www.postgresql.org/docs/16/continuous-archiving.html), [pgBackRest](https://pgbackrest.org/user-guide.html).

**Media:** candidato restic cifrado hacia S3 con inventario y manifests que enlacen identidad lógica, receipt, hash y archivo exacto. Respaldar originales sellados todavía CONFIRMING cuando sean necesarios para recuperar operaciones; no clasificarlos automáticamente como staging descartable. Derivados regenerables sólo pueden omitirse si se demuestra su reconstrucción dentro del RTO. El backup no sustituye el proveedor operativo filesystem pendiente. [Repositorios restic S3](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).

Bucket backup distinto de la autoridad, Block Public Access, TLS obligatorio, cifrado y permisos separados. Base de costos: SSE-S3 para objetos y cifrado cliente de backups; secretos de descifrado y recuperación fuera del host, sin versionarlos. EBS cifrado. SSE-KMS/CMK opcional cambia costo y permisos. Una única instancia con instance profile no aísla identidades por contenedor: un host comprometido hereda permisos del perfil; minimizarlo y definir acceso a credenciales, restauración y purga. OIDC CI no da aislamiento automático al runtime.

Las copias técnicas deben desaparecer ≤30 días calendario UTC desde `purge_started_at`; la purga principal ≤7 días, sin legal hold automático. Versioning no elimina versiones no actuales al borrar la clave. Lifecycle es asíncrono: usar inventario, eliminación/verificación explícita y evidencia antes del límite. Deduplicación restic y cadenas PostgreSQL necesitan expiración/compactación coherente; borrar sólo el nombre de una imagen no elimina sus bytes en packs. No imponer Object Lock genérico a repositorios sin probar locks, manifests, pruning y plazos: una retención que se reinicia al reempaquetar puede violar el plazo original. [Lifecycle/versiones](https://docs.aws.amazon.com/AmazonS3/latest/userguide/lifecycle-expire-general-considerations.html).

Journal: floors antirollback mínimos pueden necesitar vivir más que el horizonte PITR mientras existan credenciales afectadas. No aplicar TTL de 7/30 días indiscriminadamente. Minimizar identificadores/datos personales y aprobar política de compactación/purga sin bajar floors. No guardar media ni credenciales en hechos WORM.

Restauración: mantener tráfico cerrado → recuperar PG al target y media/manifests → consultar autoridad vigente independiente → reconciliar COMMITTED/PREPARED, epochs, revisiones y barreras → demostrar deny de credenciales revocadas después del target → comprobar receipts/media y reapertura controlada. Si autoridad no está disponible/vigente, permanecer cerrado aunque PG esté saludable. Presupuesto de laboratorio propuesto: infraestructura 45 min + PG 35 + media 60 + reconciliación 30 + smoke 20 + margen 50 = 240 min. Es un objetivo a medir, no evidencia de RTO.

### Clases de almacenamiento

| Clase | Precio almacenamiento us-east-1 | Compatibilidad / recomendación |
|---|---:|---|
| Standard | US$0.023/GB-mes | Recomendada para WAL, fulls y media de recuperación caliente |
| Standard-IA | US$0.0125/GB-mes + US$0.01/GB recuperado | Acceso inmediato; mínimo facturable 30 días/128 KB. Poco ahorro en horizonte corto/WAL pequeño; probar RTO y costo de restore |
| Glacier Instant Retrieval | US$0.004/GB-mes + US$0.03/GB recuperado | Acceso inmediato, mínimo facturable 90 días/128 KB; no prohibición de borrado temprano, pero sí cargo mínimo |
| Glacier Flexible Retrieval | No presupuestada como fuente caliente | Restore estándar 3–5 h antes de transferencia/reconciliación pone en riesgo RTO 4 h; expedited requiere análisis de disponibilidad y costo |
| Deep Archive | No presupuestada como fuente caliente | Restore estándar ~12 h incompatible con fuente única para RTO 4 h |
| One Zone-IA | Descartada como única copia exterior | No protege por sí sola frente a pérdida de AZ |

[Clases y mínimos](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html), [tiempos de recuperación](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects-retrieval-options.html). Mínimo de facturación no equivale a retención legal obligatoria; Object Lock sí puede impedir borrar. A 75 GB, ahorro bruto Standard→IA ≈US$0.79/mes antes de requests/recuperación/mínimos: no justifica comprometer recuperación.

## 5. Capacidad: dos eventos simultáneos

Supuestos para modelar, no nuevos límites de producto: TC-001 contempla 20–200 invitados/evento, objetivo 100 conectados/subiendo, 1,500 archivos y 10 GB/evento; fotos hasta 25 MB, videos hasta 500 MB/5 min. Concurrencia de conexiones no equivale a transcodificaciones simultáneas. Los límites de archivos y bytes aplican conjuntamente.

| Supuesto | Ligero A | Pareja exigente B | Rotación C |
|---|---|---|---|
| Eventos simultáneos / totales mes | 2 / 2 | 2 / 2 | 2 / 8 (4 parejas) |
| Invitados por evento | 20 | 150 | 150 |
| Conexiones activas agregadas de prueba | 40 | 100 | 100; probar además 100/evento para resolver interpretación del objetivo |
| Archivos/evento | 500 fotos ×4 MB +20 videos ×100 MB | 1,200 fotos ×4 MB +40 videos ×125 MB | Igual B |
| Originales/evento / ingreso mensual | 4 GB / 8 GB | 9.8 GB /19.6 GB | 9.8 GB /78.4 GB |
| gp3 root / DB / media provisionado | 20/20/40 =80 | 20/20/80 =120 | 20/40/160 =220 |
| Backup PG promedio | 7×1.5 GB full +7×0.25 GB WAL +0.75 =13 | 7×5 +7×1 +3 =45 GB | 7×10 +7×2 +2 =86 GB |
| Backup media promedio incl. churn/versiones | 10 GB | 30 GB | 70 GB |
| Backup S3 promedio total | 23 GB | 75 GB | 156 GB |

Volúmenes EBS se seleccionan en GiB; costos usan el valor provisionado facturable. Tamaños de archivos son MB/GB decimales para supuestos; medir bytes y convertir a unidades de facturación antes de cotizar. Fulls diarios se cuentan siete veces, no sólo el tamaño vivo de PG. Compresión, deduplicación y promedios de retención son supuestos por verificar. La retención efectiva debe fijarse: dos eventos simultáneos no limita automáticamente los eventos históricos almacenados.

t4g.medium ofrece 2 vCPU/4 GiB ARM64. Presupuesto tentativo RAM: SO/Docker/agentes 0.5, edge 0.1, API 0.35, PG 0.65, scheduler/control 0.15, slot pesado 1.5, margen 0.75 GiB =4.0. **No son mediciones.** ClamAV, ffmpeg/libheif, decodificación, buffers, hash, ZIP y backups pueden excederlo. Comenzar pruebas con un slot pesado y dos streams de transferencia; no reducir el límite válido de archivos para hacer pasar el benchmark.

Necesario: manifests ARM64 de todas las imágenes fijadas por digest, instalación de dependencias nativas y corpus real HEIC/video, escaneo, reintentos y restore en ARM64 nativo. QEMU/build multiarch sólo valida construcción parcialmente. Medir RSS/cgroup OOM, disco/scratch, IOPS, backlog, latencia, créditos CPU y RTO bajo carga. `media_required = originales retenidos + sellados en tránsito + derivados + ZIP + scratch + huérfanos + margen`; no asignar sólo 2×10 GB.

## 6. Costos mensuales

USD, sin impuestos, 730 h, Linux on-demand. Tarifas EC2/S3/DynamoDB consultadas en catálogo público; evidencia fechada UTC 2026-10-15 (noche local del 14), con SKU/rateCode/hash: [JSON](evidence/aws-beta-prices-us-east-1.json). Reproducir consulta: `node docs/research/aws-beta-pricing.mjs` (sólo HTTP público); `--write` actualiza evidencia, no recursos. Cálculo offline: `node docs/research/aws-beta-cost-scenarios.mjs`.

| Concepto mensual | A ligero | B pareja exigente | C rotación |
|---|---:|---:|---:|
| EC2 t4g.medium, US$0.0336/h | 24.53 |24.53|24.53|
| EBS gp3, US$0.08/unidad provisionada-mes |6.40|9.60|17.60|
| Una IPv4 pública, US$0.005/h |3.65|3.65|3.65|
| Route53 zona + 100k/250k/1M queries |0.54|0.60|0.90|
| S3 backups almacenamiento |0.53|1.73|3.59|
| S3 backups PUT/GET/LIST presupuestados |0.05|0.58|2.90|
| DynamoDB autoridad: requests + storage + PITR |0.28|1.70|7.15|
| Snapshots EBS: 20/40/80 GB promedio incremental |1.00|2.00|4.00|
| Provisión logs/métricas/alarmas |2.00|3.00|6.00|
| Provisión auditoría/eventos |0.10|0.50|1.50|
| Internet egress, según allowance compartida |0|0|18.00|
| Sensibilidad créditos CPU Unlimited |0|1.60|8.00|
| Provisión CI/registry/SMTP/servicios externos |3.00|5.00|10.00|
| Provisión dominio anual amortizado |1.50|1.50|1.50|
| **Total calculado sin redondear partidas** |**43.58**|**55.98**|**109.32**|

Los últimos conceptos de provisión son reservas, no cotizaciones de planes ni contratación. No se compró dominio. HCP state remoto sin bucket del proyecto puede tener costo 0 sólo si la cuenta/tier y funciones de gates son elegibles; confirmar plan HCP/GitHub y sustituir reservas por cotizaciones. Si no, sumar suscripción real. Sin ALB/NAT; puertos públicos sólo edge 80/443, PG y puertos internos no publicados. SSM para operación, sin abrir SSH; detallar endpoint/conectividad y sus cargos antes de aprobar Terraform. Snapshots no son PITR ni fuente de autoridad.

Tarifas auxiliares: [EBS](https://aws.amazon.com/ebs/pricing/), [IPv4](https://aws.amazon.com/vpc/pricing/), [Route53](https://aws.amazon.com/route53/pricing/), [EC2 transferencia/créditos](https://aws.amazon.com/ec2/pricing/on-demand/). No incluye impuestos, soporte pagado, multi-región, réplicas, endpoints privados con cargo, recursos de ensayos duplicados ni horas humanas; son adicionales si se adoptan. Las provisiones de logs/auditoría deben revisarse con bytes/eventos y retención reales.

Supuestos variables y fórmulas:

- S3 Standard: US$0.023/GB-mes, PUT/COPY/POST/LIST US$0.005/1k, GET US$0.0004/1k. Backups A/B/C: 10k/100k/500k PUT y 10k/200k/1M GET. Requests adicionales por versiones, multipart, listing, purga, checkpoints y reintentos se suman. Object Lock/Versioning no eliminan el costo de versiones almacenadas.
- Autoridad DynamoDB: 4 items de ≤1 KB por fase, escritura transaccional cobra doble; PREPARE+ACK =16 WRU/operación lógica. 10k/100k/500k operaciones, 0.5M/2M/10M lecturas fuertes ≤4 KB. US$0.625/M WRU, US$0.125/M RRU; storage bruto US$0.25/GB-mes y PITR US$0.20/GB-mes sobre 0.25/1/2 GB. No descontar los 25 GB gratuitos compartidos sin verificar elegibilidad/consumo. Checkpoint/index/abort/retries incrementan unidades; no se incluye cada GET interno de cada algoritmo como una sola lectura mágica.
- Alternativa autoridad S3: 4 PUT/operación (candidato+HEAD por cada fase), mismas lecturas, 1/2/5 GB de versiones: **US$0.42/2.85/14.12**. Totales equivalentes **US$43.72/57.13/116.28**. Sólo modelo de requests, no equivalencia funcional; replay y contención pueden multiplicarlo.
- Egress 20/80/300 GB, con 100 GB/mes de allowance AWS compartida disponible: US$0/0/18 a US$0.09/GB adicional. Si otra carga consume la allowance, sumar hasta US$1.80/7.20/9.00 respectivamente. Downloads, galerías, ZIP y restores fuera de AWS cuentan; tráfico same-region a servicios debe verificarse para la ruta seleccionada, sin asumir cross-AZ gratuito.
- CPU surplus 0/40/200 vCPU-h ×US$0.04 =0/1.60/8: sensibilidad elegida, no pronóstico de benchmark. t4g.medium gana 24 créditos/h, baseline agregado 0.4 vCPU. CPU sostenida puede volver inviable el presupuesto; medir CPUCreditBalance y CPUSurplusCreditsCharged. [Créditos](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/burstable-credits-baseline-concepts.html).
- SSE-S3 no agrega tarifa de cifrado. CMK opcional cuesta desde US$1/clave-mes más requests; backups y autoridad con claves separadas aumentan costo y recuperación debe conservar las claves. [KMS](https://aws.amazon.com/kms/pricing/), [SSE-S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingServerSideEncryption.html).
- Prueba de restore exige EC2/EBS temporales y transferencia: reserva aparte, no ocultarla en operación normal. EBS provisionado cobra aun vacío; snapshots por bloques almacenados/churn, no por tamaño aparente de archivos. Umbrales de presupuesto recomendados: aviso 40/45, revisión antes de 50 USD; aprobación de tope pendiente.

## 7. Impacto contractual: qué requiere aprobación

| Contrato | Impacto propuesto / preservado |
|---|---|
| TC-001 / DEC-061 | Concretar topología Beta y cohortes; 2 simultáneos no acredita capacidad ni sustituye objetivos de invitados/archivos. Revisar excepción técnica de media externa |
| TC-002 / DEC-062 | Preservar full diario/WAL continuo, ≥7 días, RPO DB ≤1 h, RTO ≤4 h. S3 cambia destino, no relaja garantía; snapshots sólo complemento |
| TC-003 / DEC-063 | Filesystem operativo exige excepción Beta explícita conservando ObjectStorage neutral, privacidad, hash/version/receipt, cuotas, grants y purga. S3 backup no satisface por sí solo direct upload al storage operativo |
| TC-004 / DEC-064; ARCH-005 | Preservar cola durable, leases/fencing y separación lógica API/worker/scheduler aunque compartan EC2 |
| DEC-106; EL-TD-008 | Co-localización PG Beta ya contemplada; no extrapolarla a excepción de media ni autoridad en mismo EBS |
| DEC-112; ARCH-010/011; EL-TK-218/221/222 | Formalizar proveedor y protocolo, autoridad independiente y evidencia antirollback actual. No reabrir baseline global ni reetiquetar pruebas simuladas |
| DEC-092/097/098/099 | Purga principal ≤7 días y técnica ≤30 desde ancla UTC; revisar Versioning/Object Lock/compactación, sin legal hold automático |
| ARCH-015/016 | ffmpeg/libheif/ClamAV aceptados; verificar ARM64/memoria sin eliminarlos para ahorrar |

No se editaron decisiones aceptadas. El ADR propuesto debe identificar sustituciones precisas y fecha de adopción futura, preservando historia y baseline EL-TD-001..007.

## 8. Dependencias y bloqueantes de EL-TK-245

Orden lógico, sin asignación de personas ni delegación:

1. Revisar esta evaluación y ADR: confirmar proveedor backup/autoridad y política de pérdida/reconstrucción; definir ancla vigente y RPO media. Región y simultaneidad ya resueltas; volumen, rotación, retención y presupuesto aún no.
2. Resolver excepción DEC-063/TC-003 y reconciliación DEC-112/222 mediante aprobación expresa; gates requirements/architecture aplicables. Definir amenaza, IAM/purga y claves recuperables.
3. Diseñar adaptadores/wiring reales de autoridad y filesystem, frontera transaccional de autenticación, aceptación/media y procesos durables. Aprobación documental no acredita implementación de 251/252/253/257/258.
4. Especificar fixtures, scripts de fallos y restores reproducibles; sólo después autorizar un laboratorio AWS acotado por tiempo/costo y sin datos reales. La solicitud actual no autoriza crearlo.
5. Ejecutar evidencia real ARM64/carga/PITR/antirollback/purga, después gates de evidencia y promoción explícita. 258 depende de 251/252/257; cierre 262 depende de 250/251/253/256/258/260/261. No generar tickets duplicados.

Bloqueantes transversales pendientes: control DNS; elegibilidad backend remoto/gates GitHub; acceso y recuperación de claves; provider filesystem Beta; pipeline después de CONFIRMING; autoridad vigente para todos los módulos; costos medidos; ausencia actual de DR real. 245 puede cerrar su alcance documental sólo tras aprobaciones/evidencias propias; ello no cierra los tickets de implementación ni habilita despliegue.

## 9. Laboratorio y pruebas reproducibles — NOT_EXECUTED

Preparación sin nube: fijar commit, lockfile, versiones PostgreSQL/herramientas/SDK, digests ARM64, corpus sintético sin PII y semilla. Conservar manifiesto por archivo con bytes/SHA-256/formato y resultados esperados. Variables no secretas de escenarios A/B/C en el calculador; credenciales fuera del repositorio. El protocolo debe publicar una CLI de pruebas y fault hooks antes de ejecutar el laboratorio; **no existen comandos cloud ensayados en esta evaluación**.

| Ensayo futuro | Procedimiento reproducible | Criterio / evidencia |
|---|---|---|
| ARM64 y procesamiento | Build/run nativo, corpus fotos JPEG/HEIC y videos hasta límites, escaneo y transcode; concurrencias 1/2/4 | Digests/arquitectura/versiones, outputs/hash, p50/p95/p99, RSS/CPU/créditos, fallos; sin OOM ni archivos aceptados fuera de contrato |
| Dos eventos | Semilla A/B; rampa 40→100 conexiones, luego 100/evento; red lenta, retries, archivo máximo, backup simultáneo; soak ≥24 h | No pérdida de receipts ni escape de cuotas; medir backlog y estabilidad, definir/aprobar SLO de latencia antes de PASS |
| Fronteras PREPARE/SQL/ACK | Inyectar kill/timeout antes/después de cada confirmación durable y commit SQL; reintentar operationId/fingerprint | Una operación lógica, denegación conservadora, receipt/revisión correctos, nunca éxito previo al ACK durable |
| Multiwriter | 2 y 8 escritores con misma revisión y operaciones iguales/distintas, miles de carreras con semilla | Una cadena/head canónicos, secuencias únicas, floors no decrecen, huérfanos no publicados, ningún doble éxito conflictivo |
| Checkpoints | Truncar/corromper/sustituir prefijo, digest, checkpoint; reproducir crash durante compactación | Fail-closed y alarma, sin aceptar cadena antigua válida como vigente; conservar pruebas/operaciones necesarias |
| S3 adversarial | Ensayar delete marker, replay de versión vieja, PUT sin CAS, headers ausentes, bypass, bucket recreado y HEAD ausente | Denegación IAM donde corresponda; detección de encarnación/frontera, nunca bootstrap automático; documentar límites frente a escritor privilegiado |
| DynamoDB adversarial | Stale condition, timeout transaccional, retry pasados 10 min, GSI obsoleto, intento DeleteItem/TTL y restore a tabla nueva | Idempotencia durable/fuerte, sin reapertura por tabla antigua, denegación runtime; evidencia IAM real |
| PITR real | Full diario+WAL; t0 backup, t1 target, t2 revocar sesión/invitación/cuenta/admin; destruir sólo entorno desechable autorizado; PG nuevo a t1 | Autoridad permanece en t2; deny de todas las credenciales revocadas, PREPARED conservador, ningún hash/epoch resucitado; RPO≤1h/RTO≤4h cronometrados |
| Media + SQL | Restore con mismatch de inventario, receipt CONFIRMING, copia parcial, hash incorrecto y purge posterior a target | No publicar corruptos/ausentes ni resucitar purgados; reconciliar autoridad, inventario y recibos antes de abrir |
| Pérdida autoridad | Timeout/403/404, journal/bucket/tabla ausentes, réplica incompleta, ancla antigua | Servicio cerrado; sólo reconstrucción con actualidad demostrada. Restaurar backup de PG no reinicia floors |
| Retención/purga | Fixtures con anclas UTC, no actuales, delete markers, packs y cadenas; simular bordes 7/30 días y confirmar proceso real | Bytes/versiones elegibles inaccesibles y eliminados antes de plazo; sin romper PITR retenido ni floors activos; prueba Object Lock compatible o rechazo |
| IAM y cifrado | Matriz allow/deny runtime, backup, restore, purge y control-plane; claves ausentes/rotadas | Sin lectura pública, sin borrado de autoridad por runtime, restore descifrable; logs sanitizados |
| DR y presupuesto | Host limpio desde runbook, métricas y factura/Cost Explorer del ensayo, incluyendo recursos temporales | RTO completo ≤4h, RPO probado, costo recalculado; sin declarar capacidad por un build exitoso |

Guardar commit/seed, digests, timestamps UTC, target PITR, secuencias/receipts, métricas, trazas sanitizadas, hashes de corpus, assertions y costo. Un ensayo fallido conserva evidencia y bloquea promoción. Mocks/emuladores ayudan al desarrollo pero no acreditan garantías AWS, IAM, ARM64 nativo ni PITR real.

## 10. Validación de esta entrega

Ejecutado: lectura focal de fuente/contratos, consulta pública de precios y cálculo offline de tres escenarios. Pendiente: revisión y aprobación del ADR, gates independientes y todos los ensayos de la sección 9. No se afirma READY, DONE, RTO/RPO alcanzado ni capacidad aprobada.
