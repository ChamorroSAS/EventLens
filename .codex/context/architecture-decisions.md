# EventLens — baseline arquitectónico de Beta

Fecha: 2026-10-07. Revisión final solicitada por el usuario: arquitectura correcta/evolutiva con complejidad operacional mínima justificada. **CONFIRMED:** [DEC-061..064](../product/DECISIONS.md) y [CR-002](../product/changes/CR-002.md) gobiernan topología/recuperación/storage privado/cola PostgreSQL. Los estados aquí fijan la disposición técnica de diseño; no aceptan nuevas reglas funcionales/proveedores.

Este registro define la implementación mínima Beta y cuándo sofisticarla. Los documentos vinculados conservan contratos y opciones detalladas; describir una alternativa sofisticada no la hace obligatoria. Se conservan integridad/idempotencia/aislamiento/no resurrección/borrado efectivo/contenido privado. No se crean tickets/código/infraestructura.

## ARCH-001 — Monolito modular y procesos iniciales

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Atender peticiones y trabajos costosos conservando reglas únicas.
- **Riesgo de omitir en Beta:** API bloqueada por medios/ZIP, reglas duplicadas y reinicio global por fallo de tarea.
- **Costo de implementación:** Bajo–medio: entrypoints/composición común, routing y límites.
- **Costo operacional:** Bajo: host app único supervisado y recursos medidos; SPOF Beta condicionado a restore probado.
- **Versión mínima Beta:** Mismo código/release; API, scheduler y worker como procesos distintos en un host. Un consumidor pesado con concurrencia acotada y uno ligero lifecycle/email; media/export comparten pool pesado inicialmente. PostgreSQL 16 en contenedor independiente en el mismo servidor Beta; storage multimedia Beta externo. Compose es la orquestación inicial según EL-TD-008/DEC-106, sin pool/servidor por tipo.
- **Trigger de versión sofisticada:** Saturación/cola/latencia medida afecta API o lifecycle: separar el pool/compute afectado; hosts API adicionales solo por capacidad/disponibilidad real.

Referencia: [system-overview.md](system-overview.md).

## ARCH-002 — Atomicidad SQL y efectos externos recuperables

**Status:** ACCEPTED

- **Problema:** Confirmar estado funcional y trabajo pendiente sin dual-write inseguro.
- **Riesgo de omitir en Beta:** Carga sin procesamiento, job sin estado válido, doble cuota o purga perdida.
- **Costo de implementación:** Medio: UnitOfWork, receipts/dedup e intención durable.
- **Costo operacional:** Bajo: misma PostgreSQL para dominio/cola/audit y reconciliación acotada.
- **Versión mínima Beta:** Cambio funcional+ledger+audit necesario+job/notification intent en una tx. IO storage/correo fuera; operación idempotente y resultado verificado. Jobs SQL cumple outbox inicial: sin broker/dispatcher externo ni motor genérico de sagas.
- **Trigger de versión sofisticada:** Migración de cola o coordinaciones complejas repetidas: dispatcher outbox/adapters preservando receipts/ownership.

Referencia: [backend-architecture.md](backend-architecture.md).

## ARCH-003 — UploadIntent y original inmutable

**Status:** ACCEPTED

- **Problema:** Dar identidad durable a la transferencia y evitar overwrite por PUT reutilizado.
- **Riesgo de omitir en Beta:** Original cambiado después de aceptar, huérfanos sin dueño o media duplicada.
- **Costo de implementación:** Medio: intento, metadata real, confirmación idempotente y sellado.
- **Costo operacional:** Bajo–medio: staging/sweep y copia/snapshot del proveedor, coste a medir.
- **Versión mínima Beta:** Intent/event/session/purpose/key persistidos antes de firma; subida directa privada; metadata/size/pertenencia reales y UNIQUE intent→recurso. Sellado staging→original fuera del permiso browser, o snapshot inmutable equivalente probado. Sin original local, MIME/ETag no acreditan seguridad/integridad universal.
- **Trigger de versión sofisticada:** Coste/latencia de copia significativo o nuevo adapter: optimizar con conditional writes/version snapshots solo si conserva inmutabilidad/exactitud/purga.

Referencia: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## ARCH-004 — Cuota y reservas event-scoped

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Evitar autorizaciones concurrentes que excedan cuota y receipts repetidos.
- **Riesgo de omitir en Beta:** Sobreconsumo, pérdida de finalizados o liberar bytes todavía existentes.
- **Costo de implementación:** Medio: reserva por intento, lock corto y commit/release idempotentes.
- **Costo operacional:** Bajo: contadores y ledger SQL con inventario reconciliado.
- **Versión mínima Beta:** Bytes/slots enteros, fila de capacidad por evento y reservas únicas; reserved→committed→released una vez. Inventario físico por original/derivative/export/cover/staging separado de comercial. Original físico cuenta según DEC-039. Tabla sencilla de operaciones; sin event-sourcing/ledger financiero. PL-011/012 siguen decidiendo categorías/unidades/honor de reservas/reducción.
- **Trigger de versión sofisticada:** Contención por evento o nuevos tipos comerciales medidos: ampliar reconciliación/control manteniendo atomicidad y finalizados.

Referencia: [database-map.md](database-map.md).

## ARCH-005 — Claim PostgreSQL, lease y defensa contra worker viejo

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Recuperar crash/reserva abandonada sin aceptar resultados obsoletos.
- **Riesgo de omitir en Beta:** PROCESSING infinito, outputs duplicados o publicación/borrado después de perder ownership.
- **Costo de implementación:** Medio: SKIP LOCKED, lease/heartbeat y finalización CAS.
- **Costo operacional:** Bajo–medio: watchdog/recovery y pocas métricas/parámetros por tipo.
- **Versión mínima Beta:** Claim tx corta, lease expirante, heartbeat en trabajos largos, token único+generación+recovery epoch; CAS al renovar/completar. Tres intentos automáticos totales/DEAD/retry manual auditado y resultado terminal durable. Reservar solo slots ejecutables. Sin lock distribuido externo ni red/servicio de heartbeats/consenso.
- **Trigger de versión sofisticada:** Múltiples hosts workers o contención/latencias heterogéneas: afinar lease/routing/priority sin perder CAS/at-least-once.

Referencia: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## ARCH-006 — Outputs aislados y borrado efectivo

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Impedir publicación tardía o recreación física después de purga.
- **Riesgo de omitir en Beta:** DELETED falso, retiro/cuarentena revertidos y exposición privada.
- **Costo de implementación:** Medio: keys/generación/barrera, CAS e inventario/drain.
- **Costo operacional:** Medio acotado: cleanup parciales y verificación writers/grants.
- **Versión mínima Beta:** Outputs por intento, promoción solo CAS vigente, barrera bloquea writers nuevos. En host único, quiescencia comprobada de procesos/requests cooperativos más abort multipart/expiración y evidencia de drenaje del adapter; sin broker general de permisos si basta control local. DELETED solo cuando objetos ausentes y ningún writer puede recrear; Unknown no es Missing. PUT iniciado no se supone terminado por expiry.
- **Trigger de versión sofisticada:** Writers externos o quiescencia no verificable: permisos acotados por generación/control fino. Si no se demuestra drenaje, feature/purga queda pendiente y alerta, nunca éxito simulado.

Referencia: [operations-and-recovery.md](operations-and-recovery.md).

## ARCH-007 — Scheduler singleton recuperable

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Ejecutar tareas vencidas después de downtime sin repetir efectos.
- **Riesgo de omitir en Beta:** Acceso fuera de plazo, notificaciones/borrados duplicados y archivos olvidados.
- **Costo de implementación:** Bajo–medio: scan indexado/paginado, dedup y CAS.
- **Costo operacional:** Bajo: un proceso supervisado, monitor atraso y catch-up.
- **Versión mínima Beta:** Scheduler único inicial, jobs durables con UNIQUE kind/resource/scheduleRevision/dueAt y tx. Recupera todo vencido en batches; API aplica fecha actual sin esperar tick. Lock SQL por claim protege solapamiento accidental. Sin scheduler HA distribuido/leader election; PL-001/002 siguen definiendo fechas/suspensión.
- **Trigger de versión sofisticada:** Segundo host o disponibilidad scheduler exige múltiples instancias: leases/claims SQL más persistentes manteniendo el contrato.

Referencia: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## ARCH-008 — Contenido privado con firmas breves

**Status:** ACCEPTED

- **Problema:** Autorizar lectura por actor/recurso/variante y evitar URL pública permanente.
- **Riesgo de omitir en Beta:** Filtración cross-event o guest accede originales/exports.
- **Costo de implementación:** Bajo–medio: policies, firmas scoped y renovación.
- **Costo operacional:** Bajo: TTL calibrado/reintentos, sin gateway/CDN inicial.
- **Versión mínima Beta:** Autorización vigente antes de firma; bucket/listado privados; owner/guest/admin separados; auth/access revision/epoch y headers seguros. Ventana export48h distinta de TTL firma breve. Se reconocen límites bearer: URL emitida/transferencia iniciada no tiene revocación inmediata universal.
- **Trigger de versión sofisticada:** Requisito funcional de corte inmediato o coste/latencia exige gateway/CDN privada después de PL-003/010. No elegir preventivamente ni prometer borrar bytes recibidos.

Referencia: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## ARCH-009 — ZIP64 por partes y memoria acotada

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Exportar hasta10GB sin OOM ni paquetes inconsistentes tras fallos.
- **Riesgo de omitir en Beta:** Servidor saturado, ZIP inválido >4GiB, contenidos no elegibles o export incompleta.
- **Costo de implementación:** Medio: ZIP64, streaming, manifiesto y estado por parte.
- **Costo operacional:** Bajo–medio: una export pesada inicialmente, buffers/scratch acotados, cleanup48h.
- **Versión mínima Beta:** Manifest refs/versiones; ZIP64 para partes~5GB; streaming bounded o scratch efímero limitado si herramienta lo requiere. Partes secuenciales; retry parte fallida desde cero, reusar completas comprobadas; disponibilidad tras todas válidas/CAS. Sin resume arbitrario encoder ni empaquetado paralelo. Snapshot/invalidation PL-010 pendiente.
- **Trigger de versión sofisticada:** Demanda/tiempo de export medidos justifican pool independiente/paralelismo/checkpoints mejores preservando memoria/manifest/privacy.

Referencia: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## ARCH-010 — Recuperación segura fuera de PITR

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Restore no debe revivir credenciales/restricciones ni purgar solicitud cancelada.
- **Riesgo de omitir en Beta:** No resurrección incumplida aunque DB restaure correctamente; tombstones solos omiten borrado cancelable.
- **Costo de implementación:** Medio–alto concentrado: journal/checkpoint/receipts y reconcile de seguridad; justificado por integridad, no por escala.
- **Costo operacional:** Medio: runbook restore aislado/operador y ambigüedades; sin plataforma distribuida adicional.
- **Versión mínima Beta:** RecoveryAuthority adapter neutral sobre almacenamiento durable ya operado, escritor inicial serializado y facts mínimos de revoke/restricciones/solicitud/cancel/claim/purga. PREPARE durable→tx SQL→ACK solo en casos sensibles, receipts idempotentes; sin engine genérico 2PC/sagas ni commit distribuido. Gap/ACK ambiguo falla cerrado y detiene purga irreversible. Restore bajo barrera global, nuevo epoch, checkpoint íntegro, reconcile simple+operador para ambigüedad, causal cancellation/claim y hash/token viejo nunca activado. Journal sin secretos/media; no basta copia dentro del PITR. RTO4h incluye reconcile.
- **Trigger de versión sofisticada:** Varios writers/hosts o frecuencia de intervención justifica automatización fina. Si adapter mínimo falla durabilidad/ACK, corregir adapter localizado y mantener cierre; no rebajar seguridad. PL-002/003/013/014/Q-029 preservadas.

Referencia: [operations-and-recovery.md](operations-and-recovery.md).

## ARCH-011 — Gates de evidencia antes de operar

**Status:** ACCEPTED

- **Problema:** Comprobar capacidad, formatos, recuperación y fallos en rutas reales.
- **Riesgo de omitir en Beta:** Estimar que100conexiones/PITR/codec funcionan sin evidencia; pérdida/OOM o RPO/RTO falso.
- **Costo de implementación:** Medio: harness/corpus, contratos/fault injection enfocados.
- **Costo operacional:** Bajo–medio: ambiente aislado/evidencia y restore periódico.
- **Versión mínima Beta:** CAP-001/DR-001/MEDIA-001/EXPORT-001, autorización/idempotencia/purga.100sesiones, adapters reales, formatos móviles y export grande/fallos; sin plataforma chaos ni miles de usuarios. Ajustar pool/SKU por medición, no se presume benchmark.
- **Trigger de versión sofisticada:** Escala/cambios sustanciales/incidentes reales justifican ampliar automatización/perfiles proporcionalmente.

Referencia: [testing-strategy.md](testing-strategy.md).

## ARCH-012 — EventAsset portada privado

**Status:** ACCEPTED

- **Problema:** Configurar portada en DRAFT sin abrir carga invitada ni duplicar pipeline.
- **Riesgo de omitir en Beta:** Guest carga en DRAFT, portada insegura o reemplazo borra vigente.
- **Costo de implementación:** Bajo–medio incremental: purpose/asset/owner/CAS reutilizando pipeline.
- **Costo operacional:** Bajo incremental: mismas colas/storage, inventario y cleanup.
- **Versión mínima Beta:** EVENT_COVER separado de aporte; MOD-002 assignment/config y MOD-003 físico/safety/derivados. Owner DRAFT/SCHEDULED, safe READY antes assign, preview privado, replace CAS y cleanup viejo si no activo; purge includes cover. Sin servicio/bucket nuevo ni portada en ZIP de recuerdos. Comercial PL-011 pendiente, físico inventariado.
- **Trigger de versión sofisticada:** Personalización/assets múltiples/nuevos formatos descubiertos: ampliar catalog/purposes/policies existentes.

Referencia: [domain-map.md](domain-map.md).

## ARCH-013 — Principal admin controlado

**Status:** ACCEPTED_SIMPLIFIED

- **Problema:** Separar identidad autenticada de grants y evitar self-service elevation.
- **Riesgo de omitir en Beta:** Acceso indiscriminado, acciones sin actor o admin revocado restaurado.
- **Costo de implementación:** Bajo–medio: principal lifecycle, bootstrap/revoke/audit y grants.
- **Costo operacional:** Bajo: procedimiento provision/revoke y secretos restringidos.
- **Versión mínima Beta:** Un tipo principal admin MOD-001, bootstrap operativo de un uso luego deshabilitado; altas/revokes controladas/auditadas. MOD-007 grants con motivo/ámbito, revocación y epoch; sin múltiples roles, UI self-service ni MFA nuevo obligatorio. Cuenta Beta no se autoeleva con campo role.
- **Trigger de versión sofisticada:** Equipo operativo/seguridad necesita segregación/MFA/identidad externa: definir por necesidad y mantener trazabilidad.

Referencia: [domain-map.md](domain-map.md).

## ARCH-014 — Evidencia de recuperación de recuerdos

**Status:** EXPERIMENT

- **Problema:** Firma/ZIP preparado no prueba transferencia completa ni guardado local.
- **Riesgo de omitir en Beta:** Inflar objetivo70% de valor o confundir señal ausente con fallo.
- **Costo de implementación:** Bajo en requested/grant/client/dedup; medio si necesita ingestión específica de rangos/storage logs.
- **Costo operacional:** Bajo–medio según adapter; agregados mínimos/cobertura, sin tracking publicitario.
- **Versión mínima Beta:** Señales solicitado/firmado/lectura observable/cliente distintas; dedup owner-event y owner-cohorte, denominator todos owners reales con contenido válido. observed/reported/unknown y cobertura visibles. Piloto verifica telemetría mínima adapter sin gateway solo para medir. Sin evidencia confiable, declarar insuficiencia/complementar investigación autorizada y nunca contar firma como download ni afirmar guardado local. No altera objetivo70%.
- **Trigger de versión sofisticada:** Cobertura piloto insuficiente y mejor correlación ofrece valor medible: ingestión mínima/rangos o cliente mejorado. Proxy de métrica requiere validación de producto, sin reinterpretar silenciosamente.

Referencia: [operations-and-recovery.md](operations-and-recovery.md).

## ARCH-015 — Pipeline multimedia aislado y rendiciones adoptadas

**Status:** ACCEPTED_SIMPLIFIED — 2026-10-09, formalización solicitada explícitamente por el usuario tras EL-TK-060/061 PASS.

- **Problema:** cerrar tooling/targets/runtime que bloqueaban implementar inspección, derivados y supervisión sin convertir un spike en certificación de Beta.
- **Decisión mínima:** adoptar herramientas/versiones reproducibles, rendiciones JPEG/MP4 H.264 y ejecución Docker/cgroups/tmpfs con supervisor separado, autoridad DB/CAS y writer drain verificado según el contrato único de [media-and-jobs-architecture.md](media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015). La tabla de versiones, targets y garantías se mantiene allí, no se duplica en este registro.
- **Evidencia:** resultados [EL-TK-060](../../infra/spikes/evidence/spike060-result.json) y [EL-TK-061](../../infra/spikes/evidence/spike061-result.json), incluyendo 39 controles físicos PASS/0 FAIL bajo cobertura aprobada y evidencia automatizada/fault injection. Evidencia bruta e historia de intentos permanecen intactas.
- **Supersesión localizada:** la elección abierta de tools/targets en el contrato multimedia y el carácter candidato experimental Docker de EL-TD-008 quedan superados exclusivamente para este pipeline. ARCH-005/006 mantienen sus garantías y reciben un mecanismo concreto; no cambian arquitectura modular, formatos, permisos, provider neutrality ni EL-TD-001..007.
- **Costo/trade-off:** supervisor separado, inventario durable y límites verificables permiten contención y reconciliación; herramientas locales evitan proveedor/SaaS adicional. No se adopta parseo dentro de API/proceso confiable ni servicio de aislamiento nuevo sin evidencia de necesidad.
- **Validación pendiente:** integración/adapter/sizing productivos, perfiles no cubiertos, metadata adicional y capacidad real; MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED, nunca PASS por estos spikes. El proveedor definitivo de storage permanece DEFERRED.
- **Impacto:** revisar contratos/readiness de EL-TK-033/035/036/056/058 y consumidores de lease/cleanup/promoción/cover (055/057/037/052), respetando sus dependencias vigentes. No modifica tickets ni genera trabajo nuevo; revisión acotada por backlog_manager, sin regeneración.
- **Trigger de revisión:** cambios de codec/tool/version, permisos/runtime, límites/topología/storage o evidencia de fallo/capacidad; revalidación focal y gates afectados antes de exposición Beta. Actualizaciones de seguridad no requieren congelar indefinidamente las versiones ensayadas.

## ARCH-016 — Inspección antimalware local por intento

**Status:** ACCEPTED_SIMPLIFIED — 2026-10-09, aprobación explícita del usuario «usa clamAV» tras el gate localizado de EL-TK-033.

- **Problema/decisión mínima:** completar la responsabilidad independiente de `MalwareInspection` con ClamAV `clamscan` en intento aislado, firmas oficiales preparadas fuera del parser y resultado completo/vigente que falla cerrado. Contrato único, selección inicial de rama y requisitos de evidencia en [media-and-jobs-architecture.md](media-and-jobs-architecture.md#inspección-antimalware-local-adoptada--arch-016); no duplicar allí las garantías de ARCH-015.
- **Alcance:** complementa ARCH-015; conserva su imagen/herramientas/targets. Perfil scanner confiable separado reutiliza supervisor056; sin daemon, SaaS, proveedor ni nueva arquitectura IAM/cola. Inspección persiste checkpoint protegido, no finaliza anticipadamente el job del pipeline.
- **Historia/impacto:** reemplaza únicamente la propuesta pendiente del [gate033](../product/sessions/2026-10-09-el-tk-033-security-gate.md). Afecta033, extensión focal056 y consumidores del hecho de seguridad034/035/036/039/040; contratos de consumidores y estados de producto no cambian. No crea tickets ni marca DONE.
- **Trade-off/validación:** coste de cargar firmas por intento a cambio de aislamiento y propiedad simple; medir memoria/tiempo y demostrar detección real/completitud, fallos y aislamiento antes de admitir hechos reales aprobados. Ningún gate Beta recibe PASS. Actualizaciones de engine/snapshot/perfil requieren evidencia focal sin congelar parches de seguridad.

## EL-TD-001
Frontend: Angular + TypeScript
Status: ACCEPTED

La fuente de verdad de EL-TD-001 a EL-TD-007 es [technical-baseline.md](technical-baseline.md). Este registro conserva el resumen de decisiones aceptadas; sus restricciones y detalles se consultan allí.

## EL-TD-002
Backend: NestJS + TypeScript
Status: ACCEPTED

## EL-TD-003
Persistence: PostgreSQL + Prisma
Status: ACCEPTED

## EL-TD-004
API: REST + JSON + OpenAPI
Status: ACCEPTED

## EL-TD-005
Repository: Monorepo
Status: ACCEPTED

## EL-TD-006
Testing: Vitest + Playwright
Status: ACCEPTED

## EL-TD-007
Workspace tooling: pnpm workspaces
Status: ACCEPTED

## Validaciones requeridas

Estos gates son evidencia operacional/localizada, no nuevas decisiones estructurales ni tickets. Los PASS locales de EL-TK-060/061 sustentan ARCH-015; no constituyen resultados de benchmark/restauración ni PASS de los gates de Beta. El stack ya está aprobado en [technical-baseline.md](technical-baseline.md); tooling/targets multimedia en ARCH-015, adapters/SKU y pool/lease/TTL se implementan/tunean cuando corresponda dentro del baseline con estas pruebas, respetando decisiones DEFERRED.

| ID | Status | Alcance | Evidencia y aprobación | Cuándo |
|---|---|---|---|---|
| CAP-001 | VALIDATION_REQUIRED | Host Beta único con app y DB en servicios independientes, storage externo,100sesiones conectadas/cargando,20–200guests/evento;1500archivos/10GB y25MBfoto/500MBvideo5min, mezcla móvil/burst | Informe reproducible perfil/recursos/pools, API errores/latencia, conexiones/locks, CPU/memoria/scratch/backlog y end-to-end. Integridad/cuotas/aislamiento sin saturación sostenida. Demostrar foto mediana≤15s/p95≤60s y video mediana≤2min/p95≤5min para perfil aprobado; ajustar capacidad documentadamente.100conexiones no significa100transcodes | Antes de Beta real; repetir tras cambio relevante de capacidad/topología |
| DR-001 | VALIDATION_REQUIRED | Diario≥7d+PITR; DB/app/objetos/jobs/restricciones/journal/epoch/purga, caída host y snapshots previos a security/cancelación | Restore cronometrado RPO≤1h/RTO≤4h incluyendo reconcile; journal/checkpoint íntegro, scope ambiguo cerrado, no revivir credencial/link/token ni purgar request cancelado, no restituir media purgada normalmente. Evidencia backup/WAL/runbook/alertas/credenciales recuperables, no solo configuración | Antes de producción/Beta, periódicamente y tras cambio sustancial de recovery/storage/journal |
| MEDIA-001 | VALIDATION_REQUIRED | Direct/multipart/resume, confirm duplicado/staging/sellado, corpus JPEG/PNG/WebP/HEIC/HEIF/MP4/MOV/WebM, derivados/cover/seguridad/purga | Adapter real/corpus móvil: original byte-identical inmutable; metadata/duración/formato reales; derivados playable; inválido/malicioso aislado, no duplicar media/quota ni exponer ajenos por retry/lease. Cuantificar éxito foto≥98%/video≥95% sobre muestra explícita sin fingir evaluación Beta real. Writer drain/inventario/effective delete comprobados | Antes de exponer carga/galería/portada a Beta real; revisar tras cambiar tool/codec/adapter |
| EXPORT-001 | VALIDATION_REQUIRED | ZIP64~5GB/múltiples partes hasta10GB, manifests/memoria/scratch/retries/partial/48h/privados | ZIP válido con originales exactos/selección autorizada según PL-010 cerrada; disponibilidad completa, retry parte sin duplicación, recursos/size/duration medidos; expiry/invalidation/cleanup de partes/copias/grants comprobados. No objetivo temporal nuevo inventado | Antes de habilitar Descargar todo en Beta; no bloquea implementar streaming/adapter conocidos |

El piloto de evidencia de descargas se requiere antes de usar70% como señal confiable de valor. Si falta cobertura, se registra incertidumbre y se valida definición/evidencia con producto; no se presenta experimento como benchmark aprobado. Fallar un gate exige corregir implementación/capacidad o mantener la feature cerrada. Tuning interno no reabre topología; alterar DEC/TC o contrato funcional requiere registrar conflicto.

## Clasificación agrupada y estado final

| Estado | Cantidad | Resultado |
|---|---|---|
| ACCEPTED | 5 | Mantener mecanismo/contrato esencial |
| ACCEPTED_SIMPLIFIED | 10 | Mínimo Beta definido, sophistication solo por trigger |
| EXPERIMENT | 1 | Evidencia de descarga reversible con cobertura/incertidumbre |
| DEFERRED | 0 | Ninguna decisión completa diferida; alternativas futuras tienen triggers locales |
| REJECTED | 0 | Ninguna garantía esencial eliminada |

No quedan bloqueantes nuevos de decisión estructural. Topología, ownership, storage privado, transacciones, jobs, recuperación y borrado tienen baseline mínimo. El experimento/validaciones son gates de evidencia/operación o implementación localizada; no requieren volver a debatir monolito/DB/storage/cola.

ARCHITECTURE_BASELINE: FROZEN_FOR_BETA

READY_FOR_TICKETS: PARTIAL

El baseline habilita descomponer contratos/capacidades cerrados tras revisión de requisitos, sin crear tickets ni cambiar estados de épicas. PL-001..014 permanecen bloqueantes funcionales localizados: anclas/suspensión, sesiones/revocación/aportes, uploads en curso, restauración/moderación, denuncias/retiro, snapshot/invalidation exports, unidades/cuota/reservas y cancelación/purga. Q-029 bloquea apertura pública/definiciones jurídicas; arquitectura no la cierra.

READY_FOR_BETA: VALIDATION_REQUIRED

Necesita gates cumplidos, políticas funcionales cerradas y flujos integrados verificados. Baseline congelado no certifica disponibilidad99,5%,100usuarios, éxito de cohorte, restore ni revisión legal. Selección neutral de proveedor DB/storage/correo/tipoEC2/herramientas queda localizada dentro de DEC/TC vigentes. Las alternativas de complejidad superior documentadas no forman parte de la mínima Beta hasta su trigger.

## Fuentes técnicas verificadas

Referencias primarias de mecanismos/protocolos, no selección comercial/versionada: [locking PostgreSQL](https://www.postgresql.org/docs/current/sql-select.html), [PITR y archivo continuo](https://www.postgresql.org/docs/current/continuous-archiving.html), [presigned URLs S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [multipart S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html).

## Actualización de topología — 2026-10-08

**CONFIRMED — DEC-106 / [EL-TD-008](technical-baseline.md#el-td-008--local-environment-and-beta-topology):** la obligación de separación física DB/app derivada de ARCH-001 y DEC-061 queda SUPERSEDED sólo para Beta. No cambia el monolito, ownership, transacciones, jobs ni storage Beta externo. Docker fue candidato experimental en esta actualización; ARCH-015 (2026-10-09) adopta posteriormente el mecanismo multimedia tras los PASS locales060/061, sin dar por implementados/verificados los adapters productivos de ARCH-005/006. CAP-001/DR-001 deben ensayar contención y recuperación de app+DB co-localizadas; ningún gate se declara PASS.

