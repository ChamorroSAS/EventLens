# EventLens — Auditoría de cobertura y plan técnico

**Fecha:** 12 de octubre de 2026, America/Bogota. **Base:** `stage`, commit `40ecd4a9b77e123d95e67f2d607e5081949ba28e`, merge del [PR237](https://github.com/ChamorroSAS/EventLens/pull/237).

**Resultado: cobertura PARTIAL; plan APPROVED_WITH_CONDITIONS.** Los contratos aprobados no están cubiertos completamente por la integración actual. La mayor parte del trabajo pendiente ya tiene propietarios. Sólo se identificó un posible alcance funcional nuevo: lifecycle de solicitudes Beta nunca invitadas, todavía bloqueado y sin ticket creado.

## Método y límites

Se ejecutaron secuencialmente dos iteraciones de Planner y dos revisiones independientes de Requirements Reviewer. La primera revisión pidió correcciones; la segunda aprobó el plan con condiciones y alcances bloqueados explícitos.

Se contrastaron tickets, estados, criterios, dependencias, fuentes, adaptadores, OpenAPI, Angular y pruebas existentes. No se ejecutaron suites ni se verificó infraestructura desplegada: citar una prueba acredita su existencia y alcance, no un PASS de esta auditoría. Los estados DONE se conservaron; no prueban por sí solos integración HTTP/UI.

El grafo codebase-memory, generación2026-10-09, no rastrea las fuentes actuales consultadas. Las verificaciones se apoyan en lecturas directas y búsquedas acotadas, con comprobación de cobertura de los paths materiales. Las afirmaciones de ausencia están limitadas a los módulos y montajes inspeccionados.

Épicas revisadas:001,003,004,012,013,014,015 y017. Se consultó018 para deduplicar el trabajo de integración205..214. No se amplió el alcance a implementar Home ni otras capacidades.

## Fuentes de verdad

- [Contrato API aprobado](../contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md).
- [Permisos de suspensión y revocación](../contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md).
- [Minimización y auditoría de correo Beta](../legal/BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md).
- [Brechas técnicas del expediente](../legal/EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md).
- [Acta de aprobación técnica](../../.codex/product/sessions/2026-10-12-el-ep-017-approved-technical-contracts.md).
- [Dependencias](../../.codex/product/DEPENDENCIES.md), [decisiones](../../.codex/product/DECISIONS.md) y [convenciones](../../.codex/product/CONVENTIONS.md).
- [Entrada pública](../../.codex/context/public-entry-contract.md) y [gates018](../../.codex/product/sessions/2026-10-12-el-ep-018-review-gates.md), para comprobar equivalentes y compatibilidad.

## Matriz de trazabilidad vigente

Una cobertura por fila. FULL se refiere al requisito concreto observado, no a disponibilidad productiva. Las acciones EXTEND son recomendaciones de correctivo con historia preservada; no cambian tickets en esta ejecución.

| Requisito | Épica | Ticket existente | Cobertura | Evidencia | Brecha | Acción recomendada | Dependencias |
|---|---|---|---|---|---|---|---|
| API de negocio bajo `/api/v1`, OpenAPI y cliente generado |001/004/012/018|009,151,208,211|PARTIAL|[AppModule:8](../../apps/api/src/app.module.ts#L8); [application:10](../../apps/api/src/application.ts#L10); [OpenAPI](../../contracts/openapi.json)|Sólo se registran HealthController y dos paths health; dominios no equivalen a controllers montados|EXTEND_EXISTING_TICKET009/151; VERIFY_IMPLEMENTATION208/211|044 y owners por flujo|
| POST Beta `{email}`,202 neutra sin ID público ni notes |001/018|008 dominio;208 integración|PARTIAL|[requestAccess:94](../../packages/identity/src/access-request.ts#L94); [208](../../.codex/product/tickets/EL-TK-208.md)|El adaptador/formulario están planificados pero no montados. Conservar requestId interno|EXTEND_EXISTING_TICKET208 contra PR237; no adapter nuevo|206, correctivo008; gates legales para activar|
| Una solicitud lógica ante envíos concurrentes |001|008|PARTIAL|[requestAccess:112](../../packages/identity/src/access-request.ts#L112); [migración:14](../../packages/identity/prisma/migrations/202610120045_beta_access_request/migration.sql#L14)|FOR UPDATE sobre fila inexistente e índice no único no garantizan deduplicación concurrente; tests observados son secuenciales|EXTEND_EXISTING_TICKET008|Pruebas PostgreSQL de concurrencia/rollback; mecanismo en delivery|
| Audit Beta por requestId, sin email redundante |001/014/017|008,009;166 como contrato general|PARTIAL|[alta:150](../../packages/identity/src/access-request.ts#L150); [detalle:256](../../packages/identity/src/access-request.ts#L256); [test:92](../../packages/identity/test/access-request.integration.test.ts#L92)|Escrituras y test actual usan correo como target;166 no cubre esa tabla automáticamente|EXTEND_EXISTING_TICKET008/009|Nuevas escrituras independientes del saneamiento histórico|
| GET admin Beta paginado, actor de sesión servidor y DTO limitado |001|009,044|PARTIAL|[lecturas:178](../../packages/identity/src/access-request.ts#L178); AppModule|Dominio recibe ActorContext ya construido; no hay frontera HTTP registrada que lo autentique|EXTEND_EXISTING_TICKET009|044 verificado y minimización008/009|
| Guest real, sin sesión/token fabricados por Angular |004/018|074,075,083,211|PARTIAL|[sesión local:331](../../apps/web/src/app/guest/guest-container.component.ts#L331); [211](../../.codex/product/tickets/EL-TK-211.md)|211 ya cubre adapters/callbacks reales, pero el transporte tiene fuentes contradictorias|VERIFY_IMPLEMENTATION211 tras aclaración; no duplicar|206,074..078,082..084; B01|
| Versión/documento de consentimiento elegidos por servidor |004/017/018|076,083,211|BLOCKED|[consentimiento:440](../../packages/event-management/src/guest-session.ts#L440); [estado local:33](../../apps/web/src/app/guest/guest.service.ts#L33)|Versión cliente/local no acredita documento válido del servidor; falta fuente vigente y autorización jurídica|BLOCKED_BY_DEPENDENCY integración; EXTEND_EXISTING_TICKET076 preparatorio|Fuente/versionado aprobados; LEG03/07; B01 sólo transporte|
| Admin autenticado, grants por acción/recurso, CSRF y cliente Angular correcto |003/004/012|044,151,154,155|PARTIAL|[orquestador:24](../../packages/admin-support/src/admin-intervention.ts#L24); [cliente:25](../../apps/web/src/app/admin/admin-api.service.ts#L25)|Angular usa `/api/admin` y header actor. No se acreditó aceptación de ese header por un backend: la ruta no está montada|EXTEND_EXISTING_TICKET151/154; VERIFY_IMPLEMENTATION155|044; owners;151 antes de154|
| Mutación, auditoría necesaria y fact/outbox coherentes |003/004/012/013|068,069,151,162 y owner de sesiones|PARTIAL|admin-intervention.ts registra auditoría después del owner; contratosARCH002/PR237|Montar controller no corrige una auditoría de fachada posterior al commit|EXTEND_EXISTING_TICKET owners/151; verificar rollback y replay|UnitOfWork propietaria; no nueva autoridad|
| Gracia vencida: ancla original y deadlines sin prórroga |003/015|067,069,194|PARTIAL|[reactivación:1270](../../packages/event-management/src/event-lifecycle.ts#L1270); [194](../../.codex/product/tickets/EL-TK-194.md)|067/069 pueden usar now como ancla tardía;194 exige graceEndsAt|EXTEND_EXISTING_TICKET067/069; VERIFY_IMPLEMENTATION194|Receipts, authority, replay/PITR;202 cuando corresponda|
| Avisos por ocurrencia y estado efectivo, sin éxito de delivery supuesto |003/013|162,158,157,165|PARTIAL|[dedupe:148](../../packages/notifications/src/account-event-notice-service.ts#L148); [copy:197](../../packages/notifications/src/account-event-notice-service.ts#L197)|Claves permanentes pierden ciclos; mensajes presumen acceso normal. También revisar renderer y destinos de CTA|EXTEND_EXISTING_TICKET162/158/157; VERIFY_IMPLEMENTATION165|Facts de owners; proveedor no bloquea intent|
| Retención ejecutable de admin_audit_event |014/017|184,176|PARTIAL|[retención:31](../../packages/observability/src/retention-service.ts#L31)|Sólo audit_event; admin_audit_event fuera. No asumir365d=12meses|EXTEND_EXISTING_TICKET184 preparatorio; BLOCKED_BY_DEPENDENCY purga|B02;176 valida integración|
| Retención6meses de solicitudes nunca invitadas |001/017|Sin equivalente identificado|NOT_COVERED|Política Beta; [schema](../../packages/identity/prisma/schema.prisma)|No ancla atribuible, clasificación invitación/emisión/entrega ni purga autorizada|PROPOSE_NEW_TICKET condicionado; no crear|B02, relaciones de invitación/backups/restore|
| Saneamiento histórico de auditoría append-only |017, owners001/014|Sin ejecución autorizada|BLOCKED|Política Beta, sección históricos|Falta autorización y plan de integridad; no UPDATE silencioso ni copia bruta|BLOCKED_BY_DEPENDENCY|Jurídico/operación; B02|
| No conceder suspensión de cuenta ni revocación individual admin guest |001/004/012/017|Restricción canónica|FULL|Matriz de permisos aprobada y allowlist existente|Mantener exclusión; estado SUSPENDED o primitiva revokeGuestSession no otorgan facultad|NO_ACTION|Sin ampliación DEC/TC/ARCH|
| Esas dos capacidades futuras no autorizadas |001/004/012/017|Ninguno autorizado|BLOCKED|Matriz de permisos|Requieren impacto y ratificación independientes, no integración por inferencia|BLOCKED_BY_DEPENDENCY; no crear|Autoridad/aprobación no otorgadas|
| HTTP+PG+cliente+Playwright de los flujos |001/003/004/012/013/014/015/018|155,165,176,202,214|PARTIAL|[E2E platform:3](../../e2e/tests/platform.spec.ts#L3); tests package y owners|Platform sólo health; fixtures de módulo no acreditan Nest/Angular real|VERIFY_IMPLEMENTATION validadores por owner|Adapters/correctivos/entorno; no mega-E2E nuevo|

## Separación de capas

- **Dominio:** existen emisión guest, consentimiento registrado, permisos de intervención, lifecycle, intents y auditoría. Persisten correctivos concretos de concurrencia, anclas, atomicidad y notificaciones.
- **API:** el montaje principal sólo publica health. Controllers, resolución de identidad, DTOs, OpenAPI y wiring real siguen pendientes para los flujos auditados.
- **UI:** existen componentes/servicios, pero parte del transporte es manual o simulado.208/211 ya son owners;154 necesita cliente generado y no debe usar actor autodeclarado.
- **Pruebas:** existen unitarias, integraciónPG y pruebas de módulos denominadas E2E. Hay que verificar el recorrido HTTP/UI real mediante sus validadores; ninguna suite se ejecutó en esta auditoría.

## Dictámenes y readiness de propuestas

P son referencias del análisis, no IDs de tickets. YES permite el alcance indicado; no acredita entrega de dependencias, implementación, exposición o PASS.

| Propuesta / owner | Dictamen final | REQUIREMENTS_READY | READY_FOR_IMPLEMENTATION | Límite |
|---|---|---|---|---|
|P01: nuevas escrituras y dedupe008/009|APPROVED|YES|YES, correctivo propio|Sin saneamiento histórico|
|P02: montaje208|APPROVED_WITH_CONDITIONS|YES|YES tras P01/206|Captación pública NO|
|P03: lecturaHTTP009|APPROVED_WITH_CONDITIONS|YES|YES tras P01/044|Verificar entregas/auth reales|
|P04.a: fixtures/fail-closed076|APPROVED_WITH_CONDITIONS|YES preparación;PARTIAL integrado|YES preparación;NO integración sin fuente vigente|Fixtures no son documento aprobado|
|P04.b: transporte211|BLOCKED|PARTIAL|NO completo mientras B01|No elegir header/cookie silenciosamente|
|P05.a:151→154→155|APPROVED_WITH_CONDITIONS|YES contrato acotado|YES preparación/correctivos|Exposición exige atomicidad owner yP05.c|
|P05.c:067/069→194|APPROVED_WITH_CONDITIONS|YES|YES correctivo propio|Validar authority/receipts/PITR e integración|
|P06:162/158/157/165|APPROVED_WITH_CONDITIONS|YES|YES intents/correctivos|Delivery y destinos no acreditados|
|P07.a:lifecycleBeta nuevo potencial|BLOCKED|PARTIAL|NO purga|Sólo análisis preparatorio|
|P07.b:184/176adminaudit|APPROVED_WITH_CONDITIONS|YES preparación;PARTIAL política|YES inventario/dry-run;NO purga|B02|
|P07.c:históricos|BLOCKED|PARTIAL|NO ejecución|Plan/autorización previos|

## Alcances y criterios mínimos

1. **P01 —008/009:** conservar requestId interno; alta/detalle auditados por ID y lista por referencia colectiva. Sin email/IP/notes en destinos prohibidos. Dos solicitudes concurrentes equivalentes dejan una sola solicitud lógica y respuesta neutra; rollback no deja auditoría huérfana. Tests unitarios yPG negativos/concurrencia. No se elige mecanismo de serialización ni se depuran datos históricos en este análisis.
2. **P02 —208:** controller montado `POST /api/v1/beta/access-requests`, body sólo email,202 `{status:"REQUEST_RECEIVED"}`, sin ID público ni notes.429/503 sanitizados; cliente generado y formulario contra transporte real. No crear otro adapter ni quitar el ID del dominio.
3. **P03 —009:** lista/detalle paginados y limitados, sesión administrativa actual validada por044,401 ante header falsificado sin sesión, permisos/resource isolation, vacíos seguros, no-store y audit por ID. No aprobar/rechazar/invitar ni crear otra consola.
4. **P04.a/b —076/211:** fixtures server-side fallan cerrado si no hay documento vigente; versión arbitraria/obsoleta da409 sin mutación, cancelación no acepta y replay exacto no duplica. Angular sólo refleja recibos autoritativos.076 posee política/versionado;211 el transporte/callbacks reales. Resolver B01 antes del transporte completo y texto/source legal antes de uso real.
5. **P05.a —151/154:** sólo acciones ya autorizadas, sesión/authority/grant por acción y recurso, freshness cuando aplique, motivo, Origin/CSRF, replay compatible y errores sanitizados. Mutación/auditoría necesaria/fact-outbox del owner coherentes; un audit de fachada postcommit no los sustituye. No serializar downstreamResult o razones protegidas en DTO/audit. Revocación explícitamente GLOBAL; sin cuenta suspendida o sesión individual administrativa nueva.
6. **P05.c —067/069/194:** gracia vencida conserva/ancla graceEndsAt y +7/+30; no now tardío, nuevas ventanas ni reactivación DELETED. PostgreSQL de frontera/concurrencia y receipts/authority/epoch/replay/PITR. No convertir ese test en DR-001 PASS.
7. **P06 —162/158/157:** fact identificable por ocurrencia/revisión. Retry del mismo hecho no duplica; ciclos posteriores no se pierden; supersession de la suspensión correspondiente. Copy del panel y renderer de email coherentes con CLOSED/GRACE_PERIOD/PENDING_DELETION, sin afirmar acceso normal. Supresión autorizada, razón sanitizada y rollback sin aviso. Verificar CTA/ruta/contacto antes de exposición; no inventar `/support`, pantalla, buzón o email aprobado.
8. **P07.a:** futuro lifecycle de solicitud nunca invitada, separado de184. Ancla legítima no prorrogable por POST anónimo, clasificación transaccional con invitación/emisión/entrega, seis meses con cálculo autorizado, exclusiones, lotes/idempotencia y backups/restore. No crear el ticket ahora.
9. **P07.b/c:**184 conserva retención de admin_audit_event; inventario/dry-run/fixtures permitidos. Política destructiva y saneamiento histórico requieren autorización/calendario/integridad, pruebasPG/batches/fallo/restauración y ausencia de reintroducción. UUID correlacionable no es anonimización absoluta.

## Bloqueos y condiciones pendientes

**B01 — compatibilidad de transporte guest.**211 exige cookie real y no token en JS; PR237 describe X-Guest-Session vigente y evolución pendiente. Los gates018 no registran una supersesión explícita del nuevo contrato. Architect debe armonizar las fuentes de forma trazable. Esta auditoría no elige una opción ni cambia211; el bloqueo afecta su transporte completo y downstream correspondiente, no fixtures076 o correctivos Beta/admin.

**B02 — retención destructiva incompleta.** Faltan ancla de interacción pertinente atribuible, clasificación nunca-invitada/emisión-entrega, cálculo de seis meses y equivalencia12meses/365d aplicable, además de tratamiento histórico autorizado. No bloquea nuevas escrituras sinPII ni inventarios/dry-run.

**Gates jurídicos:** fuente/documento de consentimiento vigente, captaciónBeta y apertura pública siguen condicionados por los LEG correspondientes. EL-EP-017 NOT_READY, Q029 DEFERRED, BETA_FORM_PUBLIC_COLLECTION BLOCKED y PUBLIC_SERVICE_OPENING BLOCKED.

**Condiciones localizadas:** comprobar destinos de avisos; preservar RecoveryAuthority al corregir anclas; marcar como históricos los NO/PARTIAL de009/068/069 que aún citan044 pendiente.044DONE no acredita sus rutasHTTP. Son recomendaciones, no cambios ejecutados en estos tickets.

## Plan consolidado por dependencias

| Orden | Trabajo | Precondición / resultado requerido |
|---|---|---|
|1|Handoffs de correctivos, owner/atomicidad y aclaración B01|Preservar DONE; registrar fuentes/entregas sin seleccionar transporte|
|2A|P01 nuevas escrituras/dedupe008/009|TestsPG concurrentes/rollback/audit sinPII; no históricos|
|2B|P05.c anclas067/069→194|GraceEndsAt, deadlines y receipts/authority/PITR conservados|
|3|P04.a fixtures076, P07.b inventario/dry-run, P06 facts/copy|Preparación independiente; no purga/documento legal ficticio/provider nuevo|
|4A|208 P02 controller/cliente/form|P01 y206 verificados. Captación real todavía bloqueada|
|4B|009 P03 lectura admin HTTP|P01 y044 verificados; DTO/auth/audit limitados|
|5|151 P05.a y154/155, junto conP06 integrado|Owner atomicidad yP05.c antes de exposición;151antes154;155y165 runtime por owner|
|6|211 y validación pública/guest214|B01 armonizado,076/fuente vigente; cadena206/212/213 y demás predecesoras018 respetadas|
|7|Decidir si existe ticket nuevo P07.a y autorizar purgas/históricos|B02 y aprobación posterior;184/176 siguen owners. Sin ticket creado ahora|

2A y2B pueden prepararse independientemente cuando no compartan archivos. P05 es dependencia del recorrido HTTP de notificaciones, no de toda preparación de162. Ninguna fase habilita automáticamente captación pública, consentimiento real o apertura del servicio.

## Duplicación y decisiones evitadas

-208 ya posee BetaHTTP/form;211 guestHTTP/callbacks;214 validación integrada pública. No se proponen equivalentes.
-184 conserva audit retention; el posible lifecycleBeta es distinto.166 no absorbe automáticamente admin_audit_event.
-068/069/075 y151 conservan políticas/dominio;162/158/157 y sus validadores conservan notificación. No nueva autenticación, sesiones, roles, proveedor, servicio de retención paralelo o mega-suite.
-No reabrir DONE automáticamente, regenerar backlog, reservar IDs, añadir suspensión de cuenta ni revocación individual admin.

## Resultado de las revisiones

Primera revisión: NEEDS_REVISION por owners/duplicidades, concurrencia, atomicidad, anclas, ciclos/copy, transporte y separación de gates. Planner corrigió M01..08. Segunda revisión: APPROVED_WITH_CONDITIONS, sin MAJOR adicional que impida consolidar este plan, manteniendo B01/B02 y cuatro condiciones de handoff.

Los dictámenes y la evolución del informe están en el [registro de auditoría](../../.codex/product/sessions/2026-10-12-approved-contracts-coverage-audit.md).

**Tickets creados:0. Estados de tickets modificados:0. Código modificado:NO. Suites ejecutadas:NO. Gates legales/operacionales elevados a PASS:NO.**

Validación documental:17 requisitos en matriz de8 columnas con valores de cobertura válidos;35 enlaces locales entre informe y registro resuelven. Sin cambios a tickets, backlog, decisiones, dependencias ni código; git diff --check comprobado.
