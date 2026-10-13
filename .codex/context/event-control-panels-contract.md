# Contrato técnico acotado — paneles de control de eventos

Fecha: 2026-10-13. EL-EP-019 / CR-007. Incorporado desde dictamen read-only `panels_architecture`: **APPROVED_FOR_PLANNING**. [Gates y limitaciones](../product/sessions/2026-10-13-event-control-panels-gates.md). Arquitectura de planificación aprobada; no acredita runtime ni autoriza activar superficies que dependan de RecoveryAuthority no verificada.

## Precedencia y ownership

Baseline EL-TD-001..009, DEC-036/069/070/077/082/106/111, TC-001..004 de CR-002 con supersesión localizada DEC-106, ARCH-002/010/013 y remediaciones aceptadas de EL-TK-021/023/024. No supersede decisiones; concreta adaptadores y correctivos prospectivos para cumplir garantías aceptadas. MOD-001 autentica, MOD-002 posee configuración/receipts/revisión, MOD-007 consulta y audita administración. Monolito, PostgreSQL16, NestJS, Angular, REST/OpenAPI y cliente generado; ningún SDK ORM/DTO Nest en web ni infraestructura nueva seleccionada.

## Contratos HTTP del organizador

Base `/api/v1`; preservar GET `/events`, `/events/{eventId}/configuration` y `/events/{eventId}/share-access`. Los comandos siguientes son contrato de planificación aprobado, no endpoints existentes.

| Método/path | Body | Resultado / permiso |
|---|---|---|
| POST `/events` | `{name}` | 201 nuevo /200 replay compatible; DRAFT restrictivo DEC-069, owner servidor |
| PATCH `/events/{eventId}/configuration/name` | `{name,expectedRevision}` | Nombre trim1..120, solo DRAFT |
| PUT `/events/{eventId}/configuration/schedule` | `{startsAtLocal,utcOffsetMinutes?,expectedRevision}` | Solo DRAFT, usa TZ vigente |
| PUT `/events/{eventId}/configuration/timezone` | `{timezone,utcOffsetMinutes?,expectedRevision}` | DRAFT/SCHEDULED antes ACTIVE, conserva local/recalcula UTC; warning SCHEDULED |

Todos los comandos llevan `Idempotency-Key` obligatoria, string no vacío máximo128 caracteres ASCII seguros `[A-Za-z0-9_-]`; UUID aleatorio cliente válido. Shape inválido/header ausente se rechaza400 sin efecto. Actor/rol/organizerId no son entradas de autoridad. Autenticar/autorizar cada petición; no replay desde sesión revocada.

`expectedRevision` string opaca devuelta por consulta; cliente no la deriva de timestamp. Fecha local `YYYY-MM-DDTHH:mm[:ss]`, sin Z/offset embebido. Owner valida IANA, DST/offset; gap rechaza y overlap exige elección explícita con lista segura de offsets en error allowlist. No guardar TZ+horario como una transacción ficticia. Coordinar calendario mediante `RecalculateSchedule` propietario en la misma revisión/transacción cuando corresponda; DRAFT sin inicio no obtiene expiración inventada. No publicar, activar ni habilitar invitados.

Consulta configuration añade capacidades granulares `canEditName`, `canSetLocalSchedule`, `canChangeTimezone`; preserva campos existentes para compatibilidad, sin reinterpretar flags amplios como permisos específicos.

Resultado de comando: envelope `{receipt,outcome,event:{id}}`. Receipt inmutable `{operationId,eventId,operation,appliedRevision,outcome}`; outcome original `CREATED|UPDATED|TIMEZONE_CHANGED` según efecto. Outcome del envelope coincide con el efecto en primer ACK y es `IDEMPOTENT_REPLAY` en replay. Un replay conserva receipt/revisión aplicada; la UI consulta estado actual, nunca reemplaza detalle con snapshot histórico. Operation es identificador estable del comando, no estado de lifecycle. No devolver filas ORM ni secretos.

Timezone permite además campo opcional del envelope `warning: 'RECALCULATED_SCHEDULE'`, emitido al recalcular calendario de SCHEDULED según resultado propietario. Es dato allowlisted de esa operación, conservado en respuesta de replay compatible; no cambiar receipt.outcome ni hacer inferir el warning al cliente. No contiene fechas/errores privados arbitrarios. OpenAPI/cliente y pruebas incluyen esta variante.

## Correctivos MOD-002: persistencia y concurrencia

- Receipt durable con unicidad actor+operación+key y fingerprint de recurso/payload normalizado/revisión esperada; la creación tiene receipt propio que ninguna edición reemplaza. No mini-framework global ni receipt escrito solo en controller.
- Revisión monotónica bigint de fila event, serializada string. Invariante SQL incrementa ante todo UPDATE de la fila, incluidos writers lifecycle/legacy; trigger de persistencia es implementación mínima admisible. No reglas de negocio en Prisma.
- Dentro de UnitOfWork: autoridad/restricciones/owner/barreras vigentes; lock y replay compatible; CAS antes de efecto nuevo; cambio+revisión+receipt+auditoría/jobs pertinentes atómicos. Replay autorizado compatible puede responder después de otras ediciones, sin repetir efecto ni sobrescribir revisión actual.
- Mismo key/hash diferente →409 `IDEMPOTENCY_CONFLICT`; intención nueva con revisión vieja →409 `CONCURRENCY_CONFLICT`. Timeout conserva intención/key/payload/revisión para retry/reconciliación manual; no cambio de key silencioso ni retry ciego.
- Migración aditiva, conservar campos legacy durante compatibilidad. No backfill de receipts de creación usando clave mutable como evidencia; solo reconstrucción verificable. Revisar consumidores existentes y pruebas, sin reabrir tickets DONE.
- Retención cubre vida de la intención y ventana operacional configurable de replay; documentar configuración antes de habilitar comandos. Ningún expiry convierte replay incierto en creación nueva sin reconciliación explícita. Recurso eliminado no se resucita; denegar sin revelar datos ajenos.

## Identidad y RecoveryAuthority — prerrequisito transversal

El código inspeccionado no acredita un adapter real durable externo a PITR. CR-005/EL-TK-217 sigue bloqueado para recuperación excepcional; esta planificación no lo resuelve ni reutiliza bootstrap. Resolver autoridad operacional es dependencia distinta, sin proveedor elegido por este informe.

Correctivo nuevo MOD-001 para ambos actores: persistir epoch/revisión auth/revisión credencial/watermark de emisión; credencial ACTIVE obligatoria; comparar con estados actuales y autoridad externa, barrera/floors/epoch en emisión/validación/contexto/mutación/logout; no default epoch1 ni floors restaurables como sustituto. Admin credentialRevision no se deriva de principal.auth_revision. Sesiones legacy sin binding verificable se invalidan conservadoramente, nunca backfill por suposición.

Serializar/revalidar frente a revoke, y dentro de la transacción propietaria de las nuevas escrituras antes del efecto. Efectos sensibles preservan PREPARE→SQL→ACK; sin cookie/capacidad antes de ACK ni 2PC ficticio. Autoridad nula/desconocida/indisponible/no reconciliada falla cerrada. Pruebas con authority de laboratorio durable fuera del timeline PostgreSQL efímero no acreditan por sí solas operación productiva.

**ACTIVATION BLOCKED** para nuevas mutaciones y administración final hasta resolver/validar autoridad real y correctivo identidad. Laboratorio, receipt, CAS y router pueden implementarse antes. Diseño/contratos/tickets con dependencias no equivalen a aprobación de activación.

## Contratos administrativos

Todos bajo `/api/v1`; negocio inicial read-only búsqueda/detalle.

| Método/path | Contrato |
|---|---|
| POST `/admin/auth/login` | `{identifier,secret}`, Origin exacto + `X-EventLens-Admin-Client: 1`; delegar authenticate |
| GET `/admin/auth/session` | Proyección mínima validada sin tokens/revisiones técnicas |
| POST `/admin/auth/session-context` | Sesión vigente + Origin exacto + header no simple; renovar solo CSRF |
| POST `/admin/auth/logout` | Origin + `X-CSRF-Token`; logout sesión admin actual |
| GET `/admin/search` | query/entityType/status/page/limit del owner existente |
| GET `/admin/events/{eventId}/aggregated-detail` | Snapshot mínimo del owner, disponibilidad por sección, sin media |

Cookie `__Host-el_admin_session`, Secure/HttpOnly/SameSiteStrict/Path `/`. Defaults de servicio existentes: TTL absoluto8h, idle30m. HTTPS local confiable para entrada admin, sin fallback insecure. Sin registro/role/self-elevation ni nuevo sistema auth.

Actor proviene solo de MOD-001. Eliminar callerActorId/x-admin-actor-id como fuente de autoridad en transporte, aunque el header sea enviado: ignorarlo o rechazarlo, jamás elevar. Cliente OpenAPI generado; sin fetch que invente contratos `/api/admin`.

Todo endpoint privado admin (incluidos login/sesión/contexto/búsqueda/detalle/logout) responde `Cache-Control: no-store`;503 de validación no restaura presentación desde caché. Serializadores excluyen `invitationCode`, media y controles/capacidades de operaciones diferidas; no alteran policy del owner por omitirlas del DTO MVP.

`session-context` rota únicamente digest CSRF con sesión/autoridad vigentes y condiciones transaccionales; devuelve secreto CSRF transitorio no-store. No necesita CSRF anterior perdido, queda protegido por Origin allowlist/header no simple/CORS restrictivo. No nueva sesión, extensiónTTL ni elevación; tab cuyo CSRF perdió vigencia renueva contexto explícitamente, sin repetir comando automáticamente. Secretos administrativos/CSRF no persisten en almacenamiento web, URL, logs o auditoría.

Mutaciones organizer reutilizan `validateMutatingOrganizerSession` y exigen además contexto ordinario; helper actual no basta para restricción por eliminación. Origin/CSRF/CORS y no-store obligatorios. Session checks y auditoría pueden escribir aun si el negocio admin es lectura: no prometer transacción global SQL READ ONLY.

Auditoría de búsqueda/detalle obligatoria y durable antes de emitir respuesta. Corregir sink opcional/errores tragados dentro del owner; fallo no anuncia éxito, evitar doble evento. No consultas privadas crudas ni mensajes de SDK/ports en logs/respuestas. Agregados conservan PARTIAL/disponibilidad sin snapshot distribuido ficticio ni cero inventado.

## Errores estables

Envelope `{code,message,correlationId,details?}`, allowlist campos/offsets únicamente.400 shape/header/UUID;401 sesión ausente/vencida/revocada;403 restricción/Origin/CSRF/policy;404 evento ajeno/ausente indistinguible;409 idempotencia/CAS/estado;422 validación nombre/TZ/fecha/DST/offset;429 límite existente con Retry-After;503 DB/authority/dependencia/recuperación no acreditada. Login rechazo neutro. Indisponibilidad no se convierte en sesión anónima válida ni éxito. Mensajes SQL/SDK/stack/object keys no atraviesan boundary.

## Navegación

Angular Router es autoridad única conforme contrato aceptado. Facade actual puede delegar, sin otro matcher/listener/outlet independiente. No activar app.routes.ts legacy por mera existencia.

Extensiones: `/mis-eventos/:eventId`, `/mis-eventos/:eventId/configuracion/general`, `/mis-eventos/:eventId/configuracion/programacion`; admin `/admin/ingresar`, `/admin/eventos`, `/admin/eventos/:eventId`. Conservar rutas públicas/guest, base href/fallback/refresh/back/forward y404; `/mis-eventos` mantiene listado. No alias legacy organizer/guest/gallery nuevos. Retornos separados por actor allowlist; admin no retorno organizer/guest. No enlace admin en Home, logout no GET.

## Laboratorio y evidencias futuras

Runner actual crea DB/rol/marker por ejecución y demuestra rechazo antes de callback. API E2E propia debe arrancar con `NODE_ENV=test` (o modo VITEST equivalente validado), política aislada y validación DB/rol/marker efectivos **antes de escuchar**; DATABASE_URL dedicada sola no activa la guarda. SPA/API en puertos propios, `reuseExistingServer:false`, fixture por worker y autoridad de pruebas separada de PITR. Cleanup verifica ownership y elimina solo recursos propios.

Obligatorios: creación→edición→replay sin duplicar; CAS entre dos writers/rollback; revocación concurrente ambos actores/credencial ausente/epoch cambiado/barrera/authority outage/PITR/ACK incierto; spoof/CSRF/Origin/CORS/fallo auditoría; API/cliente drift; E2E privado y a11y/responsive. No ejecutar pruebas contra eventlens de desarrollo. Critical_review requerido para implementación identity/recovery, no toda la UI. Proveedor RA y validación operacional permanecen dependencia localizada.
