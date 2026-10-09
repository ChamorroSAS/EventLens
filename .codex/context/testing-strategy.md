# EventLens — validación de arquitectura

**RECOMMENDED:** estrategia previa a implementación/Beta, no resultados ejecutados. Arquitectura es documental; no existe suite/runtime entregado en esta fase. Restricciones/cobertura: DEC-061..064, contratos de [media-and-jobs-architecture.md](media-and-jobs-architecture.md), retención/fallos de [operations-and-recovery.md](operations-and-recovery.md), PL-001..014 pendientes.

## Gate documental actual

Verificar IDs MOD-001..009, estados de evento/media/job confirmados, ownership único de escritura, contratos sin SDK, ausencia de DB/media permanentes en app, transacciones cortas y dual-write recuperable. Reviewer clasifica BLOCKER/MAJOR/MINOR y distingue recomendación de decisión aceptada. Links locales resolubles, documentos sin plantilla vacía, ningún ticket/código/proveedor nuevo creado.

No declarar READY_FOR_TICKETS global solo por calidad técnica: épicas NOT_READY por PL conservan gate. Se pueden definir futuros tickets exclusivamente de contratos cerrados/épicas READY tras review; esta fase no los crea.

## Pruebas rápidas de dominio

Matriz actor/event state/media state/operation, flags carga/galería independientes, ownership event, consentimiento versionado, guest own contribution y admin grant. Datos/clock falsos controlan transición/expiry/generation; zero bytes/duration malformed/cross-event/duplicado y plazos. Props de ledger reserve/commit/release no negativos/doble liberación; resultados del mismo command nunca cambian por replay compatible. Matrices de PL se completan tras respuestas, no tests que codifiquen supuestos.

## Contratos de adapters

ObjectStorage contra implementación candidata real compatible S3: privados/listado bloqueado, direct upload/checksum/tamaño real, repeat PUT no altera original sellado, multipart/retry/list/complete repetido/abort/unknown, version/range/copy/seal, delete de todas versiones, cleanup orphan, signed expiry/grants scope, originales byte-identical. Fallar gate si capability declarada no existe en proveedor. No usar un mock S3 como única evidencia.

JobQueue sobre PostgreSQL real: concurrent claim SKIP LOCKED, lease/heartbeat DB clock, pérdida lease/fencing, tres intentos TOTALES/DEAD, manual audit/cancel, dedup, atomic publish con cambio domain/ledger/audit, rollback no encola, recovery abandoned; scheduler2instancias/downtime/cambio revisión. Pruebas no dependen de garantías de SQLite ni de memoria single-thread.

Processing corpus: JPEG/PNG/WebP/HEIC/HEIF y MP4/MOV/WebM de teléfonos reales, códecs/rotación/audio, formatos inconsistentes/truncados, excesos de tamaño/duración/píxeles, original checksum conservado, preview playable y sin EXIF sensible innecesario. Worker sandbox/time/memory, QUARANTINED sin descarga ni publicación owner, PROCESSING_FAILED retry original safe, resultados tardíos no cambian TRASHED/retiro.

EmailGateway: idempotency donde proveedor soporte, ACK perdido/timeout duplicación acotada reconocida, dedup por evento/hito/revisión, errores no rollback de caso de uso. Secrets/tokens/signed URLs no se filtran en logging.

## Integración y pruebas de concurrencia/fallos

Sembrar near quota y lanzar authorize/confirm competidos; no sobreconfirmar slots/bytes ni perder finalizados. Simular DB rollback entre seal y commit y storage effect con ACK perdido; retry recupera un media/job/ledger. Duplicate confirm diferente payload rechaza. Abort/expiry/confirm race, writer pausado con grant vencido, orphan cleanup vs confirm lock, resource purge vs attempt output promotion y stale worker después de restore. Políticas de PL-005/010/011/012/014 son condición para expected results funcionales.

Exports: archivos de nombres repetidos/traversal, ZIP64 >4GiB y paquetes~5GB, streaming con memory bound, checkpoints/no duplicación, fail part2, expiry48h, deny guest/cross-event/cuarentena/trash, invalidate por policy/retiro, cleanup todas partes/attempts.

Purga: trash7d, evento72h/cuenta7d, cancelación vs irreversible claim, imágenes/videos/derivados/ZIP/versions/staging/multipart, partial delete retry/Missing idempotente/Unknown no éxito, barrier+writer drain, estado DELETED solo verify, deadline principal7d/copias30d según policy definida. Auditar sin retener media. Restore DB a antes del borrado verifica journal fuera PITR y no resurrección.

Todos los escenarios de matriz de fallos en operations-and-recovery deben tener inyección automatizada o ejercicio reproducible: backend/storage/DB down, worker kill, lease stuck, processing bad, missing object/ref, export partial, deletion partial, email fail, double scheduler. Verificar integridad y métricas/alerta además del HTTP status.

## End-to-end, accesibilidad y móvil

Recorrido organizador invitado → email verify → crear/preparar/preview → QR/PIN → guest acepta/carga lote → procesa/publica/revisa → galería → owner descarga originals/ZIP → cierra/vencimiento/purga. Prueba Safari iPhone/iPad y Chrome Android físicos/red móvil/background/reselección de archivo/HEIC/MOV/MP4; desktop compatibles y últimas2versiones. Keyboard/lector/focus/errors/contrast/touch targets/reduced motion para objetivo WCAG2.2AA, sin afirmar certificación sin auditoría.

## Capacidad y rendimiento TC-001

Harness100sesiones concurrentes (no100transcodes), evento20–200guests, máximo1500archivos/10GB, foto25MB/video500MB5min, galerías paginadas/refrescos/renovación firma. Mezclas reales + foto burst + videos grandes bajo cuota. Medir API p95/error, connections/locks, bytes CPU/memory/scratch/network, queue oldest/backlog, end-to-end desde carga completa hasta preview. Rutas de datos directas se prueban contra storage real, no solo API metadata sintética.

Metas confirmadas foto mediana≤15s/p95≤60s, video mediana≤2min/p95≤5min; éxito carga≥95% archivos válidos excluyendo cancelación voluntaria, procesamiento foto≥98%/video≥95%. Separar espera cola de ejecución/transcode y validar que suma cumpla objetivo. Si backlog falla, ajustar pools/capacidad antes de Beta y registrar evidencia; no certificar topología por estimación.

## Recuperación y seguridad de entrega

Restore real desde diario+PITR: restaurar a timestamp elegido, verificar intervalo de datos perdidos≤1h y servicio completo≤4h incluyendo restart/reconcile/purge barriers, recuentas/media/checksums/jobs/emails/exports. Ejercicio inicial y periódico recomendado; restauración no habilita URL/evento/token revocado ni archivo retirado. Simular caída host app conservando DB/storage y reconstrucción sin disco original.

Firmas: expired/renovación por rango, event close/PIN/QR change/auth revision, restricciones guest/owner/admin, reuse bearer y revocación práctica. Test de TTL breve no se presenta como revocación inmediata de download ya iniciado. Gateway/CDN solo si futuros requisitos lo exigen y pasan mismas políticas.

## Pruebas de correcciones quality gate AQR-001..004

**AQR-001:** ejercicios PITR con snapshot ANTERIOR a cada cambio: QR regeneration/PIN change, organizer password reset/session close, admin disable/revoke, guest session revoke, recovery token consumed/revoked, suspensión, deletion request evento72h/cuenta7d todavía cancelable, cancelación válida y purge claim irreversible. Verificar restriction facts externos continuos y epoch: QR/PIN/hash restaurados viejos no autentican; cookies/tokens/worker lease previos no validan; una suspensión o request posterior se reaplica; una cancelación confirmada impide job histórico de purga, una cancelación tardía no revive purgado. No definir respuesta funcional pendiente PL-003/013: se verifica que authority no pierde el hecho y policy actual determina resultado.

Inyectar caída antes PREPARE, después PREPARE antes SQL, después commit antes ACK y después ACK, y journal unavailable/gap/checkpoint incorrecto. Ambiguo permanece restringido y no purga automáticamente; no usar ausencia de fila restaurada como prueba de aborto. Retry operationId conserva secuencia/receipt y no duplica/revierte restricción. Scope reconciliado requiere ACK externo con digest/epoch/checkpoint; scope incompleto nunca reabre autorización. Ensayar restore journal+DB+storage dentro RTO4h y drenar grants físicos anteriores según contrato adapter.

**AQR-002:** organizer owner DRAFT/SCHEDULED autorizado a EVENT_COVER, guest/QR owner ajeno y actor con cuenta restringida denegados. Pipeline valida bytes reales y crea EventAsset/derivado privado; solo READY seguro asigna cover con revision CAS, no publica aporte invitado en DRAFT. Fallo/quarantine deja portada previa intacta; replace simultáneo no borra ganador; cleanup viejo/unassigned verifica reference/generation, es idempotente y drena writer. Preview DRAFT solo owner; portada publicada deriva de EventAccessPolicy. Purga evento/cuenta incluye original cover, derivados, staging/parts/attempts; ledger físico separado y commercial policy pendiente PL-011 no se codifica por default.

**AQR-003:** bootstrap/provision admin controlado auditado, entrada pública BETA con role/admin field rechazada/ignorada sin elevación; admin identidad válida no habilita multimedia sin grant MOD-007. Revocación invalida identidad/sesiones/grants y authority lo mantiene después PITR. Secrets bootstrap jamás frontend/logs/repo; bootstrap inicial deshabilitado después uso. No agregar MFA obligatorio a expected results.

**AQR-004:** export solicitado/listo y firma emitida nunca incrementan recovered. Lectura completa adapter correlacionada owner/object/version cuenta una vez por owner-event, rango parcial/repetido no completa; export multipart exige todas partes. Señal cliente advisory no se convierte en observed; firma propia no puede reportar éxito de otro owner/event. Denominador incluye todos organizers con contenido válido de cohortes reales y numerator dedup organizer, no solo firmantes ni contar downloads múltiples. Sin telemetry, unknown/cobertura visible y no objetivo70% inventado; no afirmar guardado local. Aggregates no contienen URLs/IP/filename/medios y respetan retención/acceso.

## Ejecución de herramientas y evidencia

Al implementar el stack aprobado en [technical-baseline.md](technical-baseline.md) habrá comandos concretos de lint/typecheck/build/unit/integration/E2E bajo CI y ambientes aislados, sin seleccionar aquí el CI/CD definitivo; no se inventan scripts npm/docker ejecutables aquí. Guardar evidencia de pruebas, muestras permitidas/redactadas, medidas y restoration timestamps; nunca secrets/medios privados de clientes en repo. Contract/concurrency/PITR gates son proporcionales a riesgo y previos a Beta, no una certificación producida por esta edición documental.

## Tooling

### Unit / Component / Integration

Vitest

### End-to-End

Playwright

### Database Integration

Use PostgreSQL for tests requiring real persistence behavior.

Do not substitute SQLite for PostgreSQL-specific behavior.

Critical flows should progressively include:

- organizer authentication;
- event lifecycle;
- guest access;
- consent;
- guest identification;
- media upload;
- media processing;
- moderation;
- download/export.

## Perfil Docker y servidor Beta — DEC-106

Aplicar [EL-TD-008](technical-baseline.md#el-td-008--local-environment-and-beta-topology): PostgreSQL 16 real en contenedor, MinIO local y Docker candidato de aislamiento. Recrear contenedores debe conservar datos en volúmenes; ensayar backups/restore, health checks y límites, sin utilizar filesystem efímero como persistencia. CAP-001 incluye contención app/DB en el mismo servidor Beta; DR-001 incluye pérdida de ese host y recuperación DB desde copias externas. Los contract tests locales de MinIO no certifican al proveedor Beta/producción pendiente. Docker no constituye evidencia de aislamiento PASS.

