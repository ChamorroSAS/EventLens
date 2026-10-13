# EventLens — cobertura de contratos técnicos y planificación — 2026-10-12

STATUS: REVIEWED_APPROVED_WITH_CONDITIONS — análisis y plan, no autorización de activación ni tickets nuevos.

## Alcance y evidencia
Solicitud del usuario adjunta: Planner → Requirements Reviewer independiente → devolución/corrección cuando corresponda → plan consolidado. No crear tickets ni implementar. Snapshot `stage` / `40ecd4a9b77e123d95e67f2d607e5081949ba28e`; PR237 merged verificado. Fecha funcional America/Bogota2026-10-12.

Planner read-only: `/root/ep017_coverage_planner`; dictamen inicial NEEDS_REVIEW. Reviewer: `/root/ep017_coverage_requirements`, revisión pendiente. No suites ejecutadas ni infraestructura desplegada verificada. Graph Tier2 generación2026-10-09 stale/not_tracked; fuente y búsquedas acotadas son autoridad de evidencia, no la ausencia de nodos.

Fuentes obligatorias: docs/contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md; docs/contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md; docs/legal/BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md; docs/legal/EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md; acta `.codex/product/sessions/2026-10-12-el-ep-017-approved-technical-contracts.md`; DEPENDENCIES, DECISIONS, CONVENTIONS. Épicas001/003/004/012/013/014/015/017;018 revisada sólo para buscar equivalentes208/211/214, sin regenerar backlog.

Los siguientes resultados conservan el informe inicial del Planner para su revisión, no son tickets aprobados ni estados modificados.

## Matriz Planner inicial
| Requisito | Épica | Ticket existente | Cobertura | Evidencia | Brecha | Acción recomendada | Dependencias |
|---|---|---|---|---|---|---|---|
| REST `/api/v1`, controllers/OpenAPI/cliente generado |001/004/012|208,211;009,151|PARTIAL|apps/api/src/app.module.ts:8; application.ts:10,18; contracts/openapi.json sólo2health; e2e/tests/platform.spec.ts:3–20|No montaje HTTP de dominio;208/211 cubren Beta/guest|VERIFY_IMPLEMENTATION208/211; REOPEN_EXISTING_TICKET009/151|044; correctivos008/009/076|
| POST Beta `{email}`,202 neutra sin requestId, sin notes libres |001/018|008,208|PARTIAL|packages/identity/src/access-request.ts:94–167;208 ya asigna controller/cliente/form|No adapter;ID interno no es DTO público; activación legal bloqueada|EXTEND_EXISTING_TICKET008 para proyección; VERIFY_IMPLEMENTATION208|206,008;LEG01/03/04/05/06|
| GET admin Beta lista/detalle paginados autenticados |001|009,044|PARTIAL|access-request.ts:178–270; AppModule sóloHealth|No controller/auth servidor/DTO/HTTP tests|REOPEN_EXISTING_TICKET009|044,AUD-P01|
| No email redundante en audit/log/analytics |001/014/017|008,009,166|PARTIAL|access-request.ts:150–160,256–267; access-request.integration.test.ts:92–100 espera email|Nuevas escrituras incumplen;166 sólo audit_event|REOPEN_EXISTING_TICKET008/009|Sin legal para nuevas escrituras;histórico legal|
| Saneamiento histórico audit Beta |001/014/017|Sin equivalente|BLOCKED|Política email exige plan autorizado, no UPDATE append-only silencioso|Falta autorización e integridad/retención|BLOCKED_BY_DEPENDENCY|Q029/DEC059|
| Retención6meses solicitudes nunca invitadas,ancla pertinente,no extensión porPOST |001/014/017|Sin equivalente;184 sólo afín|NOT_COVERED|identity/prisma/schema.prisma:150–162 sin ancla; política exige clasificación beta_invitation|No contrato ancla/clasificación/purga|PROPOSE_NEW_TICKET condicionado|Legal/calendario/invitación-entrega/backups|
| Retención admin_audit_event, no365d=12mes implícito |014/017|184|PARTIAL / BLOCKED|observability/src/retention-service.ts:14,31–80 sólo audit_event|Origen admin ausente y semántica legal no resuelta|EXTEND_EXISTING_TICKET184; bloqueo destructivo|DEC059/Q029/calendario|
| Sesión guest backend, no token Angular fabricado |004/018|075,083,211|PARTIAL|event-management/src/guest-session.ts:319–367; guest-container.component.ts:331–342;211 transport owner|Integración aún no ejecutada;211 evita duplicado|VERIFY_IMPLEMENTATION211|206,074/075/083/084|
| Documento/versión consentimiento servidor; rechazo versión arbitraria |004/017/018|076,083,211|BLOCKED|guest-session.ts:440–557,563–584; guest.service.ts:33–42; contrato registro legal inexistente|Falta registry/doc aprobado; no elegir transporte/almacén/texto|EXTEND_EXISTING_TICKET076 cuando cierre registry|LEG03/07,Q029;211|
| Intervención admin HTTP: sesión,CSRF,grant,motivo,idempotencia,DTOsanitizado |003/004/012|044,151,154|PARTIAL|admin-support/src/admin-intervention.ts:24–181; admin-api.service.ts:25,39,107–123|Dominio no controller;UI/api/admin/headeractor manual|REOPEN_EXISTING_TICKET151/154|044;151antes154|
| Suspender/reactivar evento; revocación global únicamente |003/004/012/013|068,069,151,162|PARTIAL|admin-intervention.ts:67–88,121–131; AdminAccessPort.revokeAllGuestSessions|HTTPallowlist y facts-notificación no integrados|REOPEN_EXISTING_TICKET151/162|044,151;worker/proveedor para delivery|
| No nuevas facultades admin de cuenta/selectiva guest |001/004/012/017|Sin owner autorizado|FULL como restricción / BLOCKED como capacidad|Matriz permisos; guest-session.ts:415–430 primitiva sin actor/motivo|No cambio en integración actual; capacidad nueva requiere aprobación|NO_ACTION; BLOCKED_BY_DEPENDENCY futura|Impacto/DEC/TC/ARCH/ratificación|
| Aviso suspensión/reactivación como intent,sin afirmar delivery |003/012/013|162,157|PARTIAL|AccountEventNoticeService y sus tests; EventLifecycleService sólo EventAuditSink|No composición del hecho a intent acreditada|REOPEN_EXISTING_TICKET162; VERIFY_IMPLEMENTATION157|151,composición;proveedorDEFERRED|
| Tests HTTP+PG+cliente+Playwright reales,no DONE=E2E |001/003/004/012/013/014/017|155,208,211,214|PARTIAL|platform.spec sólo health; apps/api/test/integration/health.test.ts:14–22;155packagepuertos noAPI|No evidencia de rutas aprobadas;214yaownerpublicguest|VERIFY_IMPLEMENTATION214; testsowners009/151/154|Controllers/entornoPG|

## Propuestas Planner iniciales
IDs AUD-P son referencias de este análisis; no reservan ni representan tickets EL-TK nuevos.

### AUD-P01 — nuevas escrituras audit Beta mínimas
Owner008/009; correctivo de DONE conservando historia. REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES para nuevas escrituras/tests, NO para históricos. Scope: requestId en alta/detalle,literal lista,no email/email_normalized/IP/notes/payload en admin_audit_event; ajustar unit/PG negativos. AC:nueva/duplicada/lista/detalle noPIIredundante,misma transacción/noenum,correo necesario sólo solicitud/vista autorizada. Sin dependencia legal nueva para remediar futuras escrituras; proyecciónHTTP enP02/P03.

### AUD-P02 — adapter público Beta existente
Owner208 con correctivo008; VERIFY_IMPLEMENTATION ticketREADY,no duplicado. REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION PARTIAL (técnicamente planificable,activaciónLEGALbloqueada). AC:POST/api/v1/beta/access-requests DTOemailonly,202neutra sinrequestId público,cliente/OpenAPI yHTTP/PG/UIreales. Deps206,008/P01,LEG01/03/04/05/06paraactivar.

### AUD-P03 — lecturaHTTPadminBeta
Owner009; correctivoDONE. REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES trasP01+044. AC:GETlista/detallepaginated,serversessionnotactorheader,401/403sanitizados,auditrequestId,DTOlimitado,OpenAPI/cliente/HTTPPG. No aprobación/rechazo ni pantallanueva. Deps044,P01.

### AUD-P04 — guest/consentautoritatitivo
Owner076/211, actualizar propietarios existentes. REQUIREMENTS_READY PARTIAL; READY_FOR_IMPLEMENTATION NO para consentimiento; sesión074075ya211. Falta registryservidor/docjurídico aprobado; no seleccionar source/transport/text. ACposteriores:serverversion/documentUrl,rechazaversiónarbitrariaobsoletasinpersistir,Angularreflejarecibo,sesiónrealrevocada/expiradaretiracapacidades,HTTP/PG/Playwright. DepsLEG03/07,Q029,211.

### AUD-P05 — adapterintervencionesexistentes
Owner151backend/154frontend; correctivosDONE. REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES. Scope:eventSuspend/reactivate+globalrevoke,sesiónserver/grant/recurso/reason/idempotencia/OriginCSRF/auditowner/DTOsindownstreamResult. AC:401conheaderspoof,403sinpermiso,409estado/replay,globalUIetiquetado,nosingleguest/nosuspendaccount,clienteAngular generado. Deps044;151antes154.

### AUD-P06 — facts→intentslifecycle
Owner162,correctivoDONE. REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES paraintent/outbox,no correoentregado. AC:transiciónconfirmadagenerao suprimecorrectamente,replaynodedupdouble,reactivationsupersession,proveedorausentenoéxito delivery. DepsP05paraHTTP,157procesamientoeventual. Sin proveedor nuevo.

### AUD-P07 — retenciónBeta yadminaudit
Ownerpropuesto NUEVO,sólotraslegal,sin equivalenteafirmado; PROPOSE_NEW_TICKET no elegible todavía. REQUIREMENTS_READY PARTIAL; READY_FOR_IMPLEMENTATION NO. Scope/análisis:anclalegítima6mesnorenovablePOSTanonimo,clasificacióninvitación/entrega,admin_audit_event,lotesdryrun/telemetry/PG/restore,planhistóricoautorizadoseparado. Bloqueos:12mes/365d,fundamento,ancla,clasificación,históricos/backups. DepsQ029/DEC059,calendario,contratoinvitaciónentrega.

## Duplicados evitados y límites iniciales
208 ya posee solicitudBetaHTTP/formulario;211 ya posee guest074..078/083transporte;214 validación integrada. No nuevas sesiones/PIN/lifecycle/invitación/revocaciónglobal/serviciosnotificación;166noabsorbeadminauditidentity.184 esownerretenciónaudit, lifecycleBetaespotencialscopeindependiente. No suspensiónadmincuenta ni revocaciónadminindividual guest.

EL-EP-017 NOT_READY, Q029 DEFERRED, BETA_FORM_PUBLIC_COLLECTION BLOCKED y PUBLIC_SERVICE_OPENING BLOCKED sin cambios. No crear tickets ni asignar números. Plan de ejecución sólo después de Requirements Reviewer y correcciones.

## Observaciones del coordinador para revisión independiente
- Normalizar cobertura por fila a un único valor permitido.
-P07 mezcla el lifecycleBeta sin owner con retenciónadminaudit yaowner184; comprobar separación/noduplicación.
-Separar readinessdepreparación de activaciónlegalP02; conservar requestId interno de dominio, omitirlo sólo del DTO público.
-PreservarDONEhistórico en toda recomendación, sin reapertura automática.
-Verificar transporteguest:211exigecookieHttpOnly/noJS; PR237contratoHTTPcita X-Guest-Session y evoluciónpendiente. public-entry-contract/EP18gates deben contrastarse; no elegir silenciosamente.

## Requirements Reviewer — primera revisión independiente
Dictamen `/root/ep017_coverage_requirements`: NEEDS_REVISION; requisitos/readiness del conjunto PARTIAL. Lectura independiente de fuente y contratos, sin suites ejecutadas ni cambios de canon/código/tickets.

| Propuesta inicial | Dictamen | Preparación técnica | Ejecución/activación pendiente |
|---|---|---|---|
|P01|APPROVED_WITH_CONDITIONS|Nuevas escrituras/test mínimas|Históricos excluidos|
|P02|NEEDS_REVISION|Owner208,no quitarIDinterno de008|Captación pública legal bloqueada|
|P03|APPROVED_WITH_CONDITIONS|Adapter009tras044yP01|Entregas actuales verificadas,HTTPnoacreditado|
|P04|NEEDS_REVISION|Separar076source/211transport/fixturepreparation|Transportecontradictorio y texto legal sinresolver|
|P05|NEEDS_REVISION|Completarcorrectivosownersyatomicidad|No exposición con omisiones|
|P06|NEEDS_REVISION|Factsconocurrenciayestadoefectivo|No delivery/integraciónporservicioaislado|
|P07|NEEDS_REVISION|Inventario/dry-run,preservar184|Purga/históricossindecisionesno|

### Bloqueos
-B01:211exige cookie real/noJS; PR237usa X-Guest-Session actual y evolucióncookie pendiente. Contratoentrada/gates018no acreditan supersesión expresa dePR237. Architect debe aclarar fuentes/compatibilidad deforma trazable; no selección silenciosa. No bloqueaBeta/adminaudit.
-B02:6mesfuncional no cierra interacción pertinente atribuible, clasificación transaccional nunca-invitada/emisión-entrega ni saneamiento histórico autorizado.12mes/365dnoequivalencia automática. Bloquea alcances destructivos, no nuevas escriturasmínimas o inventario/dry-run.

### Correcciones al Planner para segunda validación
-M01:P02DTOHTTP/omisiónrequestId pertenecen208, conservarIDdominio008. Separar preparation/captaciónlegal. Correctivo008concurrencia:SELECTFORUPDATEsobrefilainexistente+INSERTsinUNIQUE(email_normalized),schema/migración202610120045usaníndicenounique;testssecuenciales no prueban race. ACdosPOSTsimultáneos→unasolicitudlógica,respuestasneutras,rollback/auditmínimo. No elegir mecanismo ni purgar duplicados históricos.
-M02:P04separa076source-servidor/validación,211adapterscallback,documentolegalaprobado,B01transporte. Fixturespuedenprobarfailclosedsi no doc vigente,versiónarbitraria/obsoleta409sinmutación,cancelnolaconsume,replayexactodedup,UIreciboautoritatitivo;fixturesnoaprobaciónjurídica.
-M03:P05dominio151 audita después delownercommit; controller no aporta atomicidadmutación/auditnecesaria/outbox. Precisarownertransacciones,sessionauthorityactual/grantactionresource,freshness,replay,sanitizarDTO/audit/downstreamResult,reasonsrestringidos,401spoof/OriginCSRF.151→154y155HTTP/PG/UIreales, no duplicar214.
-M04:reactivate069en event-lifecycle.ts:1269–1274usa newPurgeStartedAt=now trasgracia;067tambiénnowfallback.194exige graceEndsAt. Añadircorrectivos067/069→194preservandoancla/deadlines/restricciones,no nueva ventana y noDELETEDreactivado.
-M05:P06/162clavepermanentelifecycle:event:suspended/reactivatedpierdecodeciclos;copyacceso-normalizadoincorrectosiCLOSED/GRACE/PENDING. Factownerocurrencia/revisión,unintentporretry yno perderciclosnuevos,supersessioncorrespondiente,copyestadoefectivo,secretreasonnone,supresiónautorizada,rollbacksinavisos/transiciónoutbox.158proyección,165validación;157envíoneutralnodefprovider. P05sólodependenciaHTTP,no preparación162.
-M06:P07separalifecycleBeta gapnuevoowner001,retenciónadminauditowner184/014,saneamientohistóricoplan+autorización. Noduplicar184. Backup/restore/no-reintroducciónyUUIDnoanonimización se conservan.
-M07:usarcorrectivo/EXTENDconhistoriaDONEpreservada;noREOPENautomático,regeneraciónIDsnilimbo cambiarcierre. Cualquiernuevofollow-upreal requiereapproval/dedupantescrearlo.
-M08:una coberturapermitidaporfila; separarrestricción FULLdefuturaauthority BLOCKED; añadir205/208/211/214equivalentes y155/165/176/202validadoresdondecorresponda. Separarharddeps/integration/proveedorDEFERRED.
-MINOR:009gateNO044PENDING y068/069authPARTIALantiguossonhistóricos;044DONEnoacreditaHTTP sino eliminaelbloqueohistórico. Recomendarprecisióndocumental,sin ejecutarlaesta auditoría.

Planner debe corregir y Requirements Reviewer validar otra vez antes del plan consolidado. No tickets nuevos, códigos, decisiones ni gates cambiados.

## Matriz Planner corregida — vigente para segunda revisión
El Planner releyó fuentes tras M01..08 y B01/B02. Preparación técnica, cobertura de dominio/API/UI y activación jurídica se evalúan por separado. Las matrices anteriores conservan historia de la primera revisión, no recomendaciones vigentes.

| Requisito | Épica | Ticket existente | Cobertura | Evidencia | Brecha | Acción recomendada | Dependencias |
|---|---|---|---|---|---|---|---|
|REST /api/v1,controllers/OpenAPI/cliente real|001/004/012/018|208,211,009,151|PARTIAL|app.module.ts:8;application.ts:10,18;OpenAPI sólohealth|Dominios no montados;208/211 yaowners|VERIFY_IMPLEMENTATION208/211;EXTEND_EXISTING_TICKET009/151|044,contratosowners|
|POSTBetaDTOemail,202neutra,sinrequestIdHTTP|001/018|208;008dominio|PARTIAL|access-request.ts:94–167;208|IDinternoseconserva;proyecciónHTTP208pendiente|EXTEND_EXISTING_TICKET208 segúnPR237;no nuevoadapter|206,P01;LEGALactivaciónseparada|
|UnicidadlógicaBeta concurrente|001|008|PARTIAL|access-request.ts:112–146;202610120045migrationíndicenounique;testPGsecuencial|FORUPDATEsinfilanoevita2inserts|EXTEND_EXISTING_TICKET008correctivo,historiaDONEpreservada|P01;sinmecanismoelegido|
|AuditBetasinPII redundante|001/014/017|008,009|PARTIAL|access-request.ts:150–160,256–267;testintegration:92–100|Auditpersistenemail/testsloesperan|EXTEND_EXISTING_TICKET008/009nuevasescrituras|P01;históricosfuera|
|GETadminBetaautenticado,paginado,auditrequestId|001|009,044|PARTIAL|access-request.ts:178–270;AppModule|Noadapter/serversession/DTOHTTP|EXTEND_EXISTING_TICKET009|044,P01|
|Guestbackendycallbacks074..078/083|004/018|211|PARTIAL|guest-session.ts:319–367;guest-container.component.ts:331–342|Transportenoimplementado211,cookievsXHeadercontradictorio|VERIFY_IMPLEMENTATION211trasaclaración;no duplicado|206,074..078,082..084;B01|
|Consentserverversion/documentofailclosed|004/017/018|076,211|BLOCKED|guest-session.ts:440–584;contratoAPI28–29|Fuenteválidanoresuelta,UIv1.0local|BLOCKED_BY_DEPENDENCY alcanceintegrado;EXTEND_EXISTING_TICKET076fixtures|LEG03/07,Q029;211,B01transporte|
|Intervenciónadmin sóloautorizada yHTTPseguro|003/004/012|151,154,155|PARTIAL|admin-intervention.ts:24–181;admin-api.service.ts:25,39,107–123|Faltancontrollers/cliente;auditoríaorchestratorpostcommitnoatomicidad|EXTEND_EXISTING_TICKET151/154;VERIFY_IMPLEMENTATION155|044,ownersmutación/audit/outbox;P05cantesexponerreactivación|
|Fin-gracia/reactivacióntardía sinmoveranclapurga|003/015|067,069,194|PARTIAL|event-lifecycle.ts:1270–1275yfallback067;contrato194|Productorfija now vs graceEndsAt|EXTEND_EXISTING_TICKET067/069;VERIFY_IMPLEMENTATION194|P05c;194intakeowner|
|Intentnotificaciónporocurrencia/estadoefectivo|003/013|162,158,157,165|PARTIAL|account-event-notice-service.ts:112–210;notice-projection-service.ts:192–209;email-renderer.ts:66–79|Dedupepermanentepierdeciclos/copyaccesoactivoincorrecto|EXTEND_EXISTING_TICKET162/158;VERIFY_IMPLEMENTATION165/157|Factsowner/outboxP06;P05sólointegraciónHTTP|
|Retenciónadmin_audit_event|014/017|184,176|PARTIAL|retention-service.ts:14,31–80|Sóloaudit_event;periodo/adminauditnoacreditados|EXTEND_EXISTING_TICKET184prep;BLOCKED_BY_DEPENDENCYpurga|B02;176validator|
|LifecycleBeta nuncainvitada6meses/anclalegítima|001/017|Sin equivalente|NOT_COVERED|Política29–39/46–47;schema sinancla|Faltaclasificación/anclaypurgaautorizada|PROPOSE_NEW_TICKET condicionado,no crear|B02;invitación/emisión/entrega/backups|
|Saneamientohistóricoauditoría|017|Sinimplementaciónautorizada|BLOCKED|Política43–48/54–55|Faltaplan/autoridad;append-onlynotUPDATEsilencioso|BLOCKED_BY_DEPENDENCY|B02,jurídico/operación|
|Nofacultad nuevaadmincuenta/selectivaguest|001/004/012/017|Restriccióncanónica|FULL|Matrizpermisos/AdminInterventionType|Mantenerexclusiónactual,nousarestadooprimitivacomopermiso|NO_ACTION|DEC/TC/ARCHsinampliar|
|Futura suspensióncuenta/revocasingleadmin|001/004/012/017|Ningunoautorizado|BLOCKED|Matrizpermisos12–13/26–30|Requiereimpacto/ratificaciónindependiente|BLOCKED_BY_DEPENDENCY,no crear|Autoridad/aprobaciónnootorgada|
|Validación integrada sinmega-E2Eduplicado|001/003/004/012/013/014/015/018|155,165,176,202,214|PARTIAL|platform.spec3–20health;155package;214owner208211|No evidenciarHTTP/UIconfixturesdemódulo|VERIFY_IMPLEMENTATIONvalidadoresporowner|Controllers/PG/cliente/fixtures;202sólorelaciónpurga194|

## Propuestas corregidas por Planner
Todas las acciones EXTEND son recomendaciones para correctivos/handoff separados del cierre histórico DONE, no reapertura/regeneración automática. Ningún EL-TK nuevo se crea ni reserva. Preparación puede hacerse con pruebas/fixtures controlados; exposición exige evidencia de integración y gates aplicables.

### AUD-P01 — persistencia/auditoría Beta, owners008/009
REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES para nuevas escrituras/tests; históricos NO y fuera del scope. MantenerIDdominio, auditrequestId/targetcolectivo sinemail/email_normalized/notes/IP, y corregir unicidadlógica bajo2POSTsimultáneos sin elegir mecanismo. AC:alta/duplicada/lista/detallesinauditPII;una solicitudaunqueconcurrentes/respuestasneutras;rollbacksinhuérfanos;unit/PGnegativos. No DTOHTTP/form/retención/saneamiento.

### AUD-P02 — montaje público Beta, owner208
REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES poralcancetécnicodespuésP01y206; PUBLIC_COLLECTION_READY NO hastaLEG01/03/04/05/06. Controller008/cliente/OpenAPI/form yaowner208,DTOemailonly,202statusREQUEST_RECEIVEDsinIDpúblico,sinnotes;429/503sanitizados yHTTP/PG/UIreales. IDinterno008nosequita;no otroadapterni política.

### AUD-P03 — lecturaHTTPadminBeta, owner009
Requisitos/implementaciónYES porcorrectivocontractual; ejecucióntrasP01/044. GETpaginated/detail, sesiónvalidadaactual,noxactorheaders,noaprobar/rechazar/invitar/pantallanueva. AC401spoof/403o404sinrevealar,no-store/DTOlimitado/emptysafe,auditrequestId,cliente/OpenAPI/HTTPPG. Gates009044PENDINGantiguossehacenreferenciashistóricas,no runtimecertificado.

### AUD-P04.a — source/fixturesconsentimiento, owner076
RequisitosPARTIAL y alcanceintegradoBLOCKED por fuente/versionadodocumentolegalaprobado. Preparaciónindependiente076permitefixtures/failclosed,nousartextoaprobadoficticio. ACposteriores:sin documento vigente no autorización,obsoleta/arbitraria409sinmutación,cancelnoacepta,replayexactono duplica,UIúnicamenterecibosservidor. No elegirstorageo texto. B01 corresponde altransporteP04.b, no una predecesora artificial de fixtures076.

### AUD-P04.b — sesión/callbackguesttransporte, owner211 yvalidator214
AlcancefullNO porB01:cookie/noJS en211 vs X-Guest-Sessioncurrent/pendingcookiePR237. Aclaracióntrazablearchitect requeridaantesmontajeconcontradictorio.211yaowner074..078/083localtokenremoval, no nuevoticketnopolíticalegal076. No bloqueaP01..03ni preparacionesP05/P06. LEG03/07antesconsentimientoreal.

### AUD-P05.a — intervencionesHTTP/cliente, owners151→154→155
Requisitos/implementaciónYES parapreparacióncontractual; exposicióncondicionada acorrectivosowner/atomicidad yP05.c. SóloeventSuspend/reactivate yglobalrevocationsallowlistyaexistentes. ACsesiónauthorityactual/grantactionresource/freshness/OriginCSRF/motivo/replay;401spoof403scope409estado;DTO/auditnoreasonsrestringidosnidownstreamResultindiscriminado;globalUIexplicitasinglesessions/accountSuspendNO.

El controller no constituye atomicidad por montarlo: owner de cada mutación debe confirmar en UnitOfWork mutación + auditoría necesaria + fact/intent/outbox segúnARCH002.151registrapostcommitnoacreditaesecontrato. No se reimplementapolicyencontroller ni crea nueva autoridad; prepararhandoffowner antesexponer y155verificarrollback/partial/replay. ProveedorDEFERRED no bloqueaintent.

Ownership del cambio: SUSPEND_EVENT → EventLifecycleService/EL-TK-068; REACTIVATE_EVENT → EventLifecycleService/EL-TK-069; REVOKE_GUEST_ACCESS → owner de sesiones GuestSessionService/EL-EP-004 a través de AdminAccessPort, manteniendo revocación global sin regenerar QR/PIN por inferencia.151 es fachada, no propietario alternativo. El enlace de hechos/outbox a162 se valida junto a cada transición; un audit de fachada posterior no reemplaza el audit transaccional necesario del owner.

### AUD-P05.c — anclapurga por gracia, owners067/069→194
Requisitos/implementaciónYES correctivoantesreactivaciónafectada. Si gracia terminó,anclagraceEndsAt/no now,deadline+7/+30conservado,retriesnilateclaimsnonuevaventana,noreactivarterminalDELETED. PostgreSQLfrontera/concurrenciay194intake. No cambiaestados/hold/policy ni reabreDONEhistórico.

Aceptación integrada de P05.c: preservar receipts, hechos y barreras de RecoveryAuthority, revisiones/epoch y coherencia posterior a PITR según contratos canónicos;194 y202 verifican que la restauración/reconciliación no reintroduce un ancla desplazada. No se marca ningún gate operacional PASS por preparar o corregir el productor.

### AUD-P06 — facts/notificación, owners162/158/165 y157
Requisitos/implementaciónYES parafact/intent/outbox, no entregaemail. Ocurrencia/revisión deowner,no clavededupepermanenteporeventotipo. ACmismofactretryunintent,nuevociclonoperdido,supersessionavisocorrespondiente,copy/proyecciónsegúnestadoefectivoCLOSED/GRACE/PENDINGsinprometeraccessnormal,supresiónautorizadasinauditsecreto,rollbacksinintent.158proyeccióny165validación,157puertoenvíoneutral. P05depsóloHTTPendtoend,no preparar162. Sin proveedorseleccionado.

El correctivo de copy incluye el renderer de email bajo157, además162/158; no debe anunciar «activo nuevamente» si el estado efectivo no lo permite. Antes de exponer un CTA verificar destino/contacto aprobado y autorizado: `/support?resource=...` no acredita una ruta o buzón existente. No inventar pantalla de soporte, correo ni contacto de privacidad; registrar el gap y mantener el mensaje sin promesa/destino no acreditado hasta resolverlo.

### AUD-P07.a — lifecycleBeta nuncainvitada, potencialownerEL-EP-001
ÚNICOpotencialscopefuncionalnuevo sin equivalente; PROPOSE_NEW_TICKET condicionado/no crear. RequisitosPARTIAL; implementaciónNO porB02. Futuro:anclapertinenteatribuible,norenovablePOSTanonimo,clasificacióntransaccionalnuncainvitadaversusemisión/entrega/exclusiones,6mescalendarcriterioautorizado,batches/idempotencia/backups/restore. No duplicar184 ni hacerpurga de cuentas/invitaciones.

### AUD-P07.b — retenciónadminaudit, owner184 /validator176
Correctivo/handoffexistente,nuevoticketNO. Preparacióninventario/dry-run/observabilidad/fixturesREADY; operación destructivaNO, requisitosdelpolicyPARTIAL. Falta semánticacalendario/legaladminaudit,no365d=12mespresunto. ACposterioresalcanceambasauditoríassegúnpolicy,batchesidempotentes,simulación,noperdidatraza,failure/rollback/PG/restore-no-reintroducción.

### AUD-P07.c — saneamientohistórico
Plan jurídico/operativo,no ticket deimplementación aprobado. BLOCKEDhasta autorización/inventariosinPII/estrategiaintegridad/evidencias yretencióncorrespondiente. No UPDATEsilencioso append-only,no copia bruta,noclaimUUIDanonimizaabsoluto.

## Resolución de primera revisión
M01:P02owner208/IDinternopreservadoy008concurrencia. M02:P04source/transport/legal separados. M03:atomicidadowner≠controller/capability/DTO/audit y155. M04:067/069ancla→194. M05:ocurrencias/copy/ciclos/supresión y158/165. M06:lifecycleBeta potencial≠184adminaudit≠histórico. M07:EXTENDconhistoriapreservada,noreaperturaautomática. M08:una coberturaenum/fila,restricciónFULLseparadadecapacidadexcluidaBLOCKED,equivalentes/validadores nodeduplicación. MINOR009/068/069gatesviejos quedanrecomendacióndocumental,sin mutarlosenestaauditoría.

B01guesttransportyB02destructiveretentionpermanecenexplícitos; no se decide por inferencia. No plan consolidado ni tickets antes de segunda validación independiente.

## Segunda validación independiente — final
`/root/ep017_coverage_requirements`: APPROVED_WITH_CONDITIONS. REQUIREMENTS_READY PARTIAL y READY_FOR_IMPLEMENTATION PARTIAL del conjunto, con scopes preparatorios propios YES y bloques explícitos. M01..08 corregidos; ningún MAJOR adicional impide consolidar el plan. Las cuatro condiciones finales (renderer157, destinos de avisos verificados, receipts/authority/PITR de194 y gates históricos009/068/069) quedan incorporadas.

| Alcance | Dictamen | Requisitos | Implementación/preparación |
|---|---|---|---|
|P01|APPROVED|YES|YES, sin históricos|
|P02|APPROVED_WITH_CONDITIONS|YES|YES trasP01/206; captaciónNO|
|P03|APPROVED_WITH_CONDITIONS|YES|YES trasP01/044verificados|
|P04.a|APPROVED_WITH_CONDITIONS|YESprep/PARTIALintegrado|YESfixtures;NOsinfuentevigente|
|P04.b|BLOCKED|PARTIAL|NOporB01|
|P05.a|APPROVED_WITH_CONDITIONS|YEScontractual|YESprep/correctivos; exposicióntrasowneratomicidad/P05.c|
|P05.c|APPROVED_WITH_CONDITIONS|YES|YEScorrectivo;194integración|
|P06|APPROVED_WITH_CONDITIONS|YES|YESintents/correctivos; nodeliveryacreditado|
|P07.a|BLOCKED|PARTIAL|NOpurga; análisispreppermitido|
|P07.b|APPROVED_WITH_CONDITIONS|YESprep/PARTIALpolicy|YESinventario/dryrun;NOpurgaB02|
|P07.c|BLOCKED|PARTIAL|NOsaneamiento;planautorizaciónpermitido|

## Plan consolidado posterior al dictamen
1. Delimitar el handoff de correctivos, actualizar referencias históricas de009/068/069 cuando se autorice la remediación y solicitar aclaración arquitectónica B01 sin elegir transporte. Se verifican entregas existentes y no se reabren DONE automáticamente.
2. P01: nuevas escrituras audit008/009 y deduplicación concurrente, testsPG; no saneamiento histórico. P05.c:067/069ancla y194receipts/authority/PITR. Ambas líneas pueden planificarse independientemente sin compartir archivos.
3. P04.afixtures076, P07.binventario/dryrun184 y preparaciónP06fact/outbox/copy pueden avanzar sin cierre jurídico/destructivo. No usar documentos legales ficticios como publicación.
4. TrasP01/206:208(P02)controller/cliente/form. TrasP01/044:009(P03)lecturaadminHTTP. No duplicar207/205ni montaractorheadercomoautenticación.
5. P05.a:mutaciones/audit/outboxowners acreditados yP05.c→151controller; después154cliente/UI y155HTTP/PG/UI. P06seintegra a hechosconfirmados;162/158/157copy y165validación. No afirmar delivery sin evidencia real.
6. SólotrasB01fuentesarmonizadas ycontrato076vigente:211sesión/callbacks y214validaciónsegúncadena206/212/213/deps018. CaptaciónBeta/consentimientoreal/publicrelease requieren LEG/Q029; no activarlos por testsfixtures.
7. P07.a/B02 yP07.csaneamiento quedan fuera deejecucióndestructiva hasta decisiones/autoridad/approval.184sigueownerretenciónadminaudit;176valida futuraintegración;202sólorelación194/purga,no megasuite.

No crear nuevos tickets todavía.

## Resultado y límites
COVERAGE: PARTIAL.
PLANNER_ITERATIONS: 2.
REQUIREMENTS_REVIEW_ITERATIONS: 2.
FINAL_VERDICT: APPROVED_WITH_CONDITIONS.
NEW_FUNCTIONAL_TICKET_CANDIDATES: 1, lifecycleBeta nuncainvitada, BLOCKED/condicionado.
TICKETS_CREATED: 0.
TICKET_STATES_CHANGED: 0.
PRODUCT_CODE_CHANGED: NO.
RUNTIME_TESTS_EXECUTED: NO.
LEGAL_GATES_CHANGED: NO.

Informe de lectura para uso directo: ../../../docs/reviews/2026-10-12-technical-contracts-ticket-coverage.md. La matriz inicial y primera revisión anteriores son historia y no prevalecen sobre la matriz corregida, segunda validación y plan final.

Validación documental final:17 filas de requisitos/8 columnas/coberturas enumeradas válidas;35 enlaces locales resuelven. Tickets, backlog, DEC/DEPENDENCIES y apps/packages/contracts sin cambios. No suite runtime; sólo comprobaciones de documentación y diff.
