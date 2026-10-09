# EventLens — quality gate independiente de arquitectura

Fecha: 2026-10-07. Revisor: `requirements_reviewer`. Alcance: los once documentos Markdown de `.codex/context/` existentes antes de este reporte, leídos completos; AGENTS.md; DEC-060..064/CR-002; MODULES/BACKLOG; las diecisiete épicas; PL-001..014 y Q-029. Revisión documental, sin código, infraestructura, benchmark ni pruebas de restauración ejecutados. No se modifica memoria de producto ni se generan tickets.

**Nota de vigencia — 2026-10-08:** este dictamen conserva sus hechos históricos. Sus afirmaciones de DB obligatoriamente externa/separada y de incompatibilidad de DB co-localizada están SUPERSEDED para Beta por DEC-106/EL-TD-008. No se sustituye la exigencia de backups externos, recuperación ni almacenamiento multimedia Beta externo. La actualización documental no representa un nuevo benchmark o restore PASS.

## Veredicto final tras correcciones y re-review

`status: approved`

`ARCHITECTURE_GATE: APPROVED`

`READY_FOR_TICKETS: PARTIAL`

**Hallazgos arquitectónicos abiertos: BLOCKER 0 / MAJOR 0 / MINOR 0.** AQR-001..004 quedan **RESOLVED** documentalmente; el historial inferior conserva la evidencia de la primera revisión. No se ha validado una implementación ni se han ejecutado benchmarks/restauraciones. Los bloqueos de producto PL-001..014 y Q-029 permanecen y por eso no se declara YES global para el MVP.

Se releen completos los once documentos de arquitectura tras correcciones, incluyendo RecoveryAuthority, EventAsset, principal admin y métricas; no se acepta solo el resumen del arquitecto. La coherencia de ownership/contratos, aislamiento, idempotencia y recuperación es suficiente para especificar futuras tareas de implementación dentro de capacidades cerradas. Stack/proveedor/códecs/adapter concreto y pruebas operativas son selección localizada y evidencia previa a Beta, no un cambio estructural pendiente ni un motivo de rechazo documental.

### Estado final por finding

| Finding / severidad inicial | Estado final | Evidencia de corrección verificada |
|---|---|---|
| AQR-001 / MAJOR | RESOLVED | operations-and-recovery, «Contrato de restricciones y revocación post-PITR»: RecoveryAuthority externo, PREPARE durable→tx SQL→ACK, secuencia/checkpoint por sujeto, barrera ante ambigüedad/gaps, credential/access revisions, epoch externo y cancelación causal. database/backend/api/media especifican uso; testing incluye todas las ventanas de crash y PITR antes de cada cambio. ARCH-010 actualizada. |
| AQR-002 / MAJOR | RESOLVED | media-and-jobs, «Portada y EventAsset privado»: purpose EVENT_COVER, owner autenticado DRAFT/SCHEDULED, sin permiso guest, inspección/cuota física, estados propios, asignación segura/CAS y cleanup que verifica referencia activa. domain/database/API/operations/testing incluyen ownership, persistencia, endpoints e inventario de purga. ARCH-012 propuesta. |
| AQR-003 / MINOR | RESOLVED | domain-map, «Principal administrativo y reconciliación»: identidad owner MOD-001, bootstrap/provisión auditada controlada y revocación; intervención owner MOD-007. database/API/backend y pruebas niegan registro autoelevable y mantienen revoke tras PITR. ARCH-013 propuesta. |
| AQR-004 / MINOR | RESOLVED | media-and-jobs «Evidencia de descarga» y operations «Métricas de recuperación y denominadores»: grant/request/export listo separados de transferencia completa, rangos/versiones deduplicados, export completa por todas partes, observed/reported/unknown y coverage. Denominador organizer-cohorte con contenido real; no se afirma guardado en dispositivo. ARCH-014 propuesta; testing comprueba no inflar numerador. |

RecoveryAuthority es suficientemente concreto como puerto sin proveedor: requiere append/CAS durable, checkpoint consistente e integridad verificable, no una exportación periódica. Si falla después de PREPARE o commit pero antes de ACK, se conserva denegación y se prohíbe purga irreversible automática hasta reconciliar; ausencia de fila restaurada no prueba aborto. Cancelación/release deben citar la restricción/request que resuelven y un claim irreversible confirmado prevalece sobre cancelación tardía. Esto convierte las ventanas de crash en pruebas implementables sin prometer commit distribuido. La indisponibilidad de esta autoridad reduce disponibilidad de scopes sensibles de forma explícita; su capacidad/latencia, backup y RTO deberán validarse junto a DB antes Beta.

EventAsset reutiliza puertos técnicos y mantiene permisos/estados distintos del aporte invitado. Su inventario físico nunca desaparece por una exención de cuota; categorías/unidades/comercialización siguen PL-011/012. La identidad admin ya no se confunde con el grant de intervención. Las métricas de descarga declaran incertidumbre del canal nativo y no usan firma emitida como éxito. No hay nuevo defecto arquitectónico demostrado tras estas correcciones.

### Alcance final habilitable

Las ocho épicas actualmente READY pueden pasar a especificación de tickets sobre sus contratos cerrados: **EL-EP-001, EL-EP-002, EL-EP-006, EL-EP-007, EL-EP-012, EL-EP-013, EL-EP-014 y EL-EP-016**. No significa que sus dependencias estén implementadas ni que sus integraciones pendientes tengan DoR cerrada.

- **EL-EP-001:** invitaciones, registro/verificación/login, recuperación normal y administración de sesiones; contratos de revocación/reconciliación post-PITR corregidos. Provision admin bajo ownership explícito y sin autoelevación.
- **EL-EP-002:** configuración/preview DRAFT, EventAsset portada privada con procesamiento, reemplazo CAS y cleanup; publicación/cómputo temporal siguen EL-EP-003. Imputación comercial asset depende PL-011, por lo que un ticket de cuota integrada espera esa respuesta.
- **EL-EP-006:** inspección/transformadores/preservación original, derivados, seguridad/cuarentena, retry/terminal callbacks y jobs; integración de admission/confirm y cambios de modo espera EL-EP-005/008.
- **EL-EP-007:** galería/paginación/visualización accesible, variantes y autorización mediante políticas; no inventar cierre/revocación/retiro pendientes EL-EP-004/009.
- **EL-EP-012:** identidad/provisión administrativa, consultas/diagnóstico, auditoría y operación jobs; cada acción sobre otro dominio conserva sus bloqueos funcionales.
- **EL-EP-013:** correo/intents/dedup/avisos panel, plantillas y señales cerradas; calendario/denuncias exactos se integran tras políticas de sus owners.
- **EL-EP-014:** auditoría/observabilidad/alertas, requisitos PITR, RecoveryAuthority y runbooks/pruebas de recuperación; no afirmar cumplimiento RPO/RTO antes de ensayo real.
- **EL-EP-016:** agregación/definiciones/instrumentación de beta con evidencia y cobertura, evaluación de cohortes; no certificar70% a partir de grants ni antes de volumen real.

También hay contrato definido para infraestructura común ObjectStorage/JobQueue, workers/scheduler genéricos y composición modular; futuros tickets deben vincularse a épicas existentes y tener alcance comprobable, sin crear módulos por capa. Las nueve épicas NOT_READY permanecen bloqueadas en sus capacidades completas: **EL-EP-003/004/005/008/009/010/011/015** por PL y **EL-EP-017** por Q-029. Las selecciones técnicas reversibles pueden realizarse en implementación; políticas pendientes no se rellenan mediante defaults silenciosos.

### ARCH-012..014 y aceptación

ARCH-010 ampliada y ARCH-012..014 siguen **RECOMMENDED**, aprobadas por revisión como diseño implementable pero no convertidas a ACCEPTED del usuario. RecoveryAuthority/asset pipeline/principal admin/instrumentación conservadora son mecanismos técnicos dentro del encargo. Cambiar ventanas, cuota comercial, política de revocación o significado funcional de éxito sí requiere cerrar las PL/decisiones pertinentes. No aparece una necesidad nueva de seleccionar proveedor comercial antes de este gate.

## Veredicto inicial — HISTÓRICO, sustituido por el gate final

`status: needs_changes`

`READY_FOR_TICKETS: PARTIAL`

El diseño estructural es coherente con DEC-061..064: monolito modular, un host inicial de aplicación, PostgreSQL y media externos, JobQueue PostgreSQL y entrypoints separados. No impone proveedor comercial, microservicios, Kubernetes ni Redis. Dos gaps MAJOR requieren completar contratos antes de generar tickets afectados; no hay un BLOCKER arquitectónico que invalide toda la topología. El MVP completo tampoco está listo por los bloqueos funcionales conocidos PL-001..014 y Q-029, que esta revisión no responde.

## Hallazgos nuevos y correcciones requeridas

### AQR-001 — MAJOR, RESOLVED: recuperación de restricciones distintas de purga incompleta

**Evidencia:** `operations-and-recovery.md`, «Base de datos, PITR y reconstrucción»: el journal externo guarda «identificadores/fecha/generation/alcance de objeto purgado» y el restore indica «reaplicar barreras/invalidar sesiones/capacidades pertinentes». «Protocolo idempotente de purga», paso 2, copia el tombstone solo al comenzar el claim irreversible. `testing-strategy.md`, «Recuperación y seguridad de entrega», exige que la restauración no habilite URL/evento/token revocado. `database-map.md` conserva event_access_revisions, sesiones, tokens y solicitudes cancelables en la propia DB restaurada.

**Impacto:** restaurar a antes de regenerar un QR/PIN, recuperar una contraseña/cerrar sesiones, suspender un evento o solicitar borrado todavía cancelable puede devolver credenciales/barreras antiguas. El nuevo recovery epoch de jobs impide workers antiguos, pero no invalida por sí mismo guest/account sessions, enlaces QR, recovery tokens ni restricciones del evento. El journal de purgas irreversibles tampoco identifica solicitudes pendientes o suspensiones posteriores al punto restaurado. No existe una fuente definida para decidir cuáles son las restricciones «pertinentes».

**Corrección concreta:** documentar un contrato de reconciliación de seguridad/privacidad post-PITR. Debe indicar fuente durable fuera de la línea temporal restaurada, tipos de hechos mínimos (revocaciones, restricciones y borrado pendiente, además de purgas), protocolo de checkpoint/ACK y conducta ante journal incompleto. Alternativamente, una barrera global de recuperación fuera de PITR puede invalidar todos los grants/sesiones/enlaces restaurados y mantener recursos sin reconciliar cerrados hasta revalidación autorizada; debe cubrir también tokens de recuperación/credenciales antiguas y no solo cookies. Registrar qué conserva ownership MOD-001/002/003/008 y cómo se reconcilian cancelaciones. No hace falta elegir proveedor. Añadir ejercicios PITR a antes de QR/PIN change, password recovery/session revoke, suspensión y borrado en ventana cancelable. Un retry histórico no puede revivir una credencial o eliminar sin reconstruir primero la restricción actual.

**Gate:** bloquea contratos de restore integrado en EL-EP-014 y las partes post-PITR de EL-EP-001/004/012/015. No bloquea auditoría/monitoring básicos, modelos de dominio independientes ni selección de adapters. Debe corregirse para aprobar arquitectura de recuperación; no implica cambiar los estados de producto ni resolver PL-002/003/013/014.

### AQR-002 — MAJOR, RESOLVED: no hay contrato para cargar portada del organizador en DRAFT

**Evidencia:** `media-and-jobs-architecture.md`, «Carga completa y reanudación», paso 1: única autorización descrita mediante sesión/QR/PIN, consentimiento, estado/flags y cuota del evento. `api-conventions.md`, uploads: actor/sesión/consentimiento y recorrido de invitado. `domain-map.md` MOD-003 posee upload intents/originales/derivados, sin distinguir assets de configuración. EL-EP-002 incluye cargar/validar portada antes de publicación; EL-EP-003 y discovery bloquean acceso/cargas de invitados en DRAFT.

**Impacto:** un ticket de configuración del evento debe inventar un segundo camino de archivos o reutilizar la admisión invitada y habilitar indebidamente cargas en DRAFT. También queda sin dueño definido la referencia/versionado/retirada de una portada reemplazada y sin inventario explícito de ese asset en la purga.

**Corrección concreta:** definir un contrato conceptual de asset de evento para el organizador autenticado propietario, separado de guest contribution y gobernado por EventConfigurationPolicy. Puede reutilizar UploadIntent/ObjectStorage/inspección técnica mediante un propósito/owner explícito. MOD-002 posee la asignación vigente de portada; el dueño de media/asset conserva referencia física, seguridad y derivados. Portada debe poder procesarse antes de publicación, mantenerse privada, mostrarse en preview autorizada y contabilizarse/inventariarse como clase propia. Reemplazo publica la nueva referencia de forma atómica cuando sea segura y limpia la anterior asíncronamente. Incluir portada/derivados/partials en purga de evento/cuenta. La imputación comercial de bytes continúa en PL-011, sin default silencioso. Añadir pruebas owner en DRAFT, invitado denegado, evento ajeno, procesamiento fallido/reemplazo y cleanup.

**Gate:** bloquea tickets de portada e integración de configuración de EL-EP-002; el resto de su preparación/preview textual puede avanzar. No requiere nuevo módulo ni nueva épica ni proveedor.

### AQR-003 — MINOR, RESOLVED: identidad administrativa no aparece en ownership de persistencia

**Evidencia:** `domain-map.md` MOD-001 enumera organizadores y sesiones; `database-map.md` MOD-001 enumera organizers pero no una identidad/principal administrativo. MOD-007 posee administrative_grants/support_cases, y `backend-architecture.md` exige admin autenticado, sin indicar quién provee/revoca esa identidad. MODULES atribuye autenticación organizador/admin a MOD-001.

**Impacto:** la identidad administrativa puede terminar mezclada con grants temporales o con el registro beta de organizador y privilegios autoasignables. El límite de autenticación correcto se infiere, pero no está explícito para quien implemente la consola.

**Corrección:** declarar que MOD-001 autentica un principal administrativo, provisionado/revocado por procedimiento controlado y sin autoservicio de elevación; MOD-007 autoriza intervenciones/grants sobre ese principal. Describir un mecanismo conceptual de bootstrap y revocación auditable, preservando proveedor neutral y sin añadir múltiples roles internos ni MFA obligatorio. No guardar secretos/grants en frontend.

**Gate:** aclaración previa al ticket de autenticación/provisión administrativa EL-EP-012; no bloquea topología ni todos los contratos de la consola.

### AQR-004 — MINOR, RESOLVED: firma de descarga no prueba recuperación de recuerdos

**Evidencia:** `api-conventions.md` expone emisión de grants; bytes van directamente de storage al navegador. `operations-and-recovery.md`, métricas exports, mide generación/bytes/fallos sin definir señal de lectura/descarga efectiva. EL-EP-016 exige medir el ≥70% de organizadores con contenido que descargan recuerdos.

**Impacto:** contar un grant emitido o un ZIP generado como descarga realizada puede inflar la métrica de valor de la beta. El backend no observa por defecto la transferencia directa ni conoce si el usuario guardó el archivo.

**Corrección:** documentar señal agregable de lectura/transferencia del adapter/telemetría de storage o confirmación cliente limitada, sus restricciones y deduplicación por owner/evento. Distinguir solicitado, firmado, transferido y confirmación cliente; indicar explícitamente la aproximación utilizada sin prometer certeza sobre guardado en dispositivo. Mantener minimización y no introducir tracking publicitario. Registrar definiciones/denominadores de soporte y participación con los responsables del módulo.

**Gate:** afecta instrumentación/evidencia de EL-EP-016; no bloquea entrega privada ni generación ZIP. La decisión de cambiar el significado funcional de «descarga» requeriría producto; la instrumentación exacta es selección técnica.

## Contratos cubiertos sin defecto nuevo demostrado

| Área revisada | Evidencia y evaluación |
|---|---|
| Ownership MOD-001..009 | domain-map + database-map: un owner por escritura, interfaces en proceso, MediaLifecycle canónico, hechos técnicos/moderación/borrado separados; composition root evita imports/callbacks circulares. No mega-repositorio compartido. AQR-002/003 son aclaraciones localizadas. |
| Atomicidad/outbox | backend-architecture: domain/ledger/audit/job en misma transacción SQL; storage/email fuera de tx con intención durable y reconciliación. No dual-write DB/broker ni transacción distribuida prometida. |
| Direct upload | UploadIntent previo, staging, multipart backend-completed, sellado/snapshot inmutable, refs exactas, reserva serializada, confirmación doble idempotente, Unknown≠Missing, abandono/huérfanos y lease de confirmación. PL-005/011/012 permanecen en políticas. |
| Objeto vs media | Plano físico, intent, media y job separados. Mime del cliente/HEAD no acreditan seguridad. Original no reemplazado, QUARANTINED sin bypass owner, outputs por intento y fence/generation. |
| ObjectStorage | Puerto neutral con multipart, metadata/checksum/version, stream/range/copy/seal/delete/inventario privado; capability/contract tests por adapter. No SDK en dominio. |
| Procesamiento | Foto HEIC/HEIF/rotación/metadata y video inspección/transcode/thumbnail/playback con corpus, sandbox y scratch. Herramientas/códecs concretos aplazados apropiadamente. |
| Cola PostgreSQL | SKIP LOCKED claim corto, heartbeat/lease/fence/epoch, reserve según slots, tres intentos totales, DEAD, retry manual auditado, terminal callback durable y cancelación regulada. Ninguna promesa exactly-once. |
| Scheduler | Claim SQL + UNIQUE logical schedule key + revisión/CAS, catch-up tras downtime y políticas actuales; permisos API miran fecha aun con cron atrasado. |
| ZIP | ZIP64 streaming, selección/manifiesto, partes ~5GB, checkpoint por parte, no disponibilidad parcial, generación y revalidación, 48h desde available_at, cleanup de partes/attempts/multipart. PL-010 preservada. |
| Entrega privada | Autorización owner/guest/admin, variantes/purpose, TTL breve renovable y límites bearer explícitos; export48h≠URL48h. CDN opcional, no pública. Revocación ya emitida no se promete inmediata. |
| Purga | Barrera/claim/cancelación, tombstone previo, writer drain incluso PUT iniciado antes de expiry, inventario/versiones/exports, Missing idempotente/Unknown pendiente, DELETED solo tras verificar. Plazos PL-014 explícitos. |
| PITR | DB externa, diarios/WAL≥7d, RPO≤1h/RTO≤4h, restore aislado/journal, recovery epoch, validación y ejercicios mensuales recomendados. AQR-001 cubre restricciones aún no purgadas. |
| Seguridad | TLS/privados/cifrado, CSRF/CORS/cookie/hash PIN, autorización por recurso/evento, secretos por purpose, sandbox/rate limits/control plane; logs sin secretos. |
| Operación | Métricas API/jobs/media/storage/ZIP/lifecycle/DB/email/compute, monitor externo, alertas DEAD/deadlines/PITR/original Missing, runbooks. Thresholds configurables y destinatarios antes Beta. |
| Fallos exigidos | operations-and-recovery cubre backend/storage/DB down, worker muerto/job atascado, procesamiento fallido, objeto sin fila/fila sin objeto, ZIP parcial, borrado parcial, email fallido, scheduler duplicado, host caído y PITR. Recovery siempre revalida lease/estado/refs. |
| Capacidad TC-001 | Ruta de bytes evita API, workers acotados y DB separada. 100 conexiones no son 100 transcodes; 1500 y10GB son límites simultáneos. Benchmark real/corpus y pools antes Beta, no capacidad demostrada por documento. |
| Testabilidad | testing-strategy incluye contratos reales, locks/concurrencia, faltas/duplicados, mobile/accessibility, restore/benchmark; no tests ejecutados ficticios. Añadir pruebas AQR-001/002. |

Host API/proxy/workers/scheduler es SPOF recomendado aceptable para Beta con reconstrucción probada y recursos aislados. Una única DB/cola comparte fallo/contención y requiere PITR/RTO; el diseño no exige HA multi-región prematura. DB, originales y backups permanentes co-localizados con host app serían incompatibles; aquí están fuera. Monitor externo detecta caída total. La complejidad de leases/sellado/journal está justificada por recuperación y privacidad, no se propone por escala masiva.

## Decisiones ARCH-001..011 y aceptación

Todas permanecen `RECOMMENDED`, no ACCEPTED por el revisor. El encargo permite decisiones técnicas reversibles; no obliga a una nueva entrevista para cada interfaz/lock.

| ID | Tratamiento |
|---|---|
| ARCH-001 | Organización interna/entrypoints y compute compartido reversible, compatible con TC. Riesgo host único se documenta/prueba; no requiere nueva decisión funcional. |
| ARCH-002 | Atomicidad/outbox SQL es implementación interna; compatible con cola aceptada. |
| ARCH-003 | Staging/sellado es mecanismo interno de original inmutable; coste/adapter se valida, sin nuevo requisito usuario. |
| ARCH-004 | Reserva/ledger es mecanismo interno; semántica de cuota/bytes y honor de reservas sí requiere respuestas PL-011/012 antes de tickets funcionales. |
| ARCH-005 | Claim/lease/fencing internos reversibles; tres intentos preserva DEC-064. |
| ARCH-006 | Aislamiento outputs y writer drain cumplen privacidad; mecanismos se eligen técnicamente sin redefinir plazos/DELETED. |
| ARCH-007 | Scheduler/CAS/dedup internos; dueAt depende PL-001/002. |
| ARCH-008 | TTL concreto es parámetro operacional. Cualquier concesión funcional sobre revocación ya emitida o exigencia de corte inmediato exige cierre PL-003/010; la firma breve no responde esa pregunta. |
| ARCH-009 | ZIP64/streaming/checkpoints internos; snapshot/invalidation requiere PL-010, no aceptación silenciosa por implementar manifiesto. |
| ARCH-010 | Journal/reconciliación técnico; datos/retención jurídica no se aceptan por arquitectura. PL-014 y Q-029 preservados; corregir AQR-001. |
| ARCH-011 | Estrategia de pruebas interna; selección SKU/provider/códecs posterior localizada y gate Beta con evidencia. |

Ninguna recomendación introduce proveedor definitivo. Aceptar arquitectura propuesta no equivale a cerrar preguntas de producto ni certificar disponibilidad/capacidad/revisión jurídica.

## Bloqueos de producto preservados y alcance habilitable

| Bloqueo conocido | Épica/capacidad |
|---|---|
| PL-001/002 | EL-EP-003: ancla temporal, suspensión y reactivación |
| PL-003/004 | EL-EP-004: revocación/sesiones y Mis aportes según estado |
| PL-005 | EL-EP-005: cargas iniciadas ante cambios |
| PL-006/007 | EL-EP-008: restauración/cambio moderación; integra salida procesamiento |
| PL-008/009 | EL-EP-009: clasificación/ocultamiento y autorización retiro propio |
| PL-010 | EL-EP-010: snapshot e invalidación ZIP |
| PL-011/012 | EL-EP-011 e integración EL-EP-005: unidades/categorías/reservas/concurrencia |
| PL-013/014 | EL-EP-015: cancelación cuenta y plazos/holds/purga |
| Q-029 | EL-EP-017 y apertura pública; evidencia/retención jurídica no inventada |

Antes de corregir hallazgos, pueden avanzar definición de contratos técnicos comunes, adapters con contract tests, JobQueue/worker/scheduler genéricos, auditoría/telemetría, corpus/transformadores multimedia y correo básico. Para tickets funcionales dentro de las ocho épicas hoy READY, el alcance concreto es:

- EL-EP-001: invitación/registro/verificación/login/recuperación normal; incorporar corrección AQR-001 para contrato restore y AQR-003 para admin. No declarar integrada recuperación post-PITR antes de corregir.
- EL-EP-002: datos, configuración y preview de DRAFT; portada bloqueada por AQR-002 y publicación temporal depende EL-EP-003.
- EL-EP-006: validación/transformadores/derivados/cuarentena/reintentos técnicos. Integración de carga y política publicación depende EL-EP-005/008 sin cerrar sus PL.
- EL-EP-007: galería/paginación/derivados/controles accesibles bajo políticas inyectadas; integración revocación/retiro depende EL-EP-004/009.
- EL-EP-012: consultas/diagnóstico/intervenciones ya definidas/jobs; autenticación/provisión admin requiere AQR-003. Operaciones con reglas pendientes siguen su épica propietaria.
- EL-EP-013: correo, intents/dedup, panel y templates/señales definidas; calendario funcional depende dueAt de épicas propietarias.
- EL-EP-014: auditoría/métricas/alertas y PITR infraestructura; restore integrado de permisos/restricciones necesita AQR-001.
- EL-EP-016: agregación/definiciones y evaluación Beta; señal de descarga requiere AQR-004, datos reales/volumen llegan durante Beta.

La aprobación parcial no modifica estados del backlog ni elimina dependencias. Generar un ticket integrado requiere cerrar sus políticas, criterios y hallazgos locales; este reporte no genera ninguno.

## Handoff inicial para architect — HISTÓRICO

```yaml
status: needs_changes
summary: "Topología y contratos base coherentes; completar recuperación de restricciones post-PITR y carga de portada, más dos aclaraciones localizadas."
evidence: [AQR-001, AQR-002, AQR-003, AQR-004]
decisions: ["No BLOCKER nuevo de topología", "PL/Q preservadas", "READY_FOR_TICKETS: PARTIAL"]
files:
  inspect: [.codex/context/architecture-review.md]
  modify: [.codex/context/operations-and-recovery.md, .codex/context/media-and-jobs-architecture.md, .codex/context/domain-map.md, .codex/context/database-map.md, .codex/context/api-conventions.md, .codex/context/testing-strategy.md]
risks: ["Restricciones restauradas desde DB vieja", "Asset portada sin admisión owner", "Identidad admin implícita", "Grant contabilizado como descarga"]
validation: ["Re-review de correcciones y evidencia documental", "PITR y benchmark pendientes antes Beta"]
open_questions: ["PL-001..014 conocidas", "Q-029 apertura pública"]
```

Revisor solo crea/actualiza este reporte. Architect corrigió documentos de su ownership y revisor verificó las correcciones completas. No se editan decisiones ni épicas para esconder findings.

## Handoff final

```yaml
status: approved
summary: "Arquitectura inicial revisada, AQR-001..004 resueltos documentalmente; preparación para tickets parcial por PL/Q conocidas."
evidence: ["RecoveryAuthority PREPARE/SQL/ACK/checkpoint/epoch", "EventAsset owner/safety/CAS/cleanup", "Admin identity owner MOD-001", "Download evidence y coverage explícitas"]
decisions: ["ARCHITECTURE_GATE: APPROVED", "READY_FOR_TICKETS: PARTIAL", "Open architecture findings: BLOCKER 0 / MAJOR 0 / MINOR 0", "8 READY / 9 NOT_READY conservadas"]
files:
  inspect: [.codex/context/architecture-review.md]
  modify: []
risks: ["Host app SPOF aceptable solo con reconstrucción probada", "Authority fail-closed/latencia y recuperación deben probarse", "RPO/RTO/capacidad no demostrados por documentos", "Signed URL emitida no admite revocación inmediata universal"]
validation: ["11 documentos releídos completos tras correcciones", "Pruebas concretas AQR añadidas al plan, sin ejecutarlas", "Sin tickets ni cambios al producto"]
open_questions: ["PL-001..014 para capacidades afectadas", "Q-029 antes de apertura pública", "Proveedor/stack/adapters y evidencia operativa antes Beta"]
```
