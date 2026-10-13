# EL-EP-019 — backlog y ejecución incremental

2026-10-13. Rama `docs/event-control-panels-plan-20261013`, base `stage/originstage87d8230`. Solo planificación: sin código funcional, pruebas mutantes, merge ni push.

[Épica019](../../.codex/product/epics/EL-EP-019.md), [CR-007](../../.codex/product/changes/CR-007.md), [contrato](../../.codex/context/event-control-panels-contract.md), [UI](../../.codex/context/ui-event-control-panels.md), [dictámenes](../../.codex/product/sessions/2026-10-13-event-control-panels-gates.md). [Informe NEEDS_CHANGES inicial](event-control-panels-implementation-plan-2026-10-13.md) preservado; el nuevo alcance sustituye sus pendientes de producto, sin borrar historia ni certificar runtime.

## Diagnóstico y resoluciones

| Hallazgo / estado | Resolución de planificación y razón | Impacto / dependencia |
|---|---|---|
| Scope amplio condicional | MVP confirmado: lista/crear/nombre/fecha-hora-TZ/detalle y admin entrada/búsqueda/detalle. Resto diferido | Requisitos approved, sin blocker producto. Ambos actores necesarios para DoD completo |
| CTA crear vacío / GET-only | Comandos HTTP v1 precisos, delegando owner y cliente generado |224..227, no editar schema manual |
| Idempotency key sobrescrita al editar | Receipt durable separado por actor/operación/key |219: crear→editar→replay no duplica; sin backfill falso |
| Sin CAS / timestamp-ms | Revisión monotónica todo UPDATE + expectedRevision/capacidades granulares/calendario owner |220, no política de edición nueva |
| Auth optionalRA/epoch1/floorsDB/credencial ausente | Binding ambos actores y fail-closed, autoridad exterior PITR |221+222;222 decisión/validación operacional BLOCKED, ningún proveedor/stub aprobado |
| Router propio contradice accepted Angular | Migración explícita a única autoridad compatible |223: público/guest/base/refresh preservados, no rutas legacy activadas |
| Detalle/configuración solo selección en memoria | URLs persistentes ratificadas, backend reautoriza |228; paths en contrato y handoff |
| Capacidades A durante carga B | Limpieza inmediata y descarte de respuestas tardías |228; servidor produce flags por comando |
| Admin fetch actorheader / no montaje | Sesión MOD-001 real, cookieHTTPS/Origin/CSRF; OpenAPI |233..236; sin nuevo rol/privilegio |
| Admin auditoría optional/fallos tragados | Registro durable obligatorio antes respuesta, DTO sanitizado |234; sin media/invitationCode/acciones diferidas ni dobleaudit |
| Test usa API/server configurable | API/SPA/PG/authority propios, NODE_ENV=test/policy anteslisten, cleanupown |218, no DB/APIdev |
| Métricas sin contrato | Fase6 DEFERRED | Sin tickets ni totales inventados; scope/gates posteriores |

Evidencia directa del snapshot está en informe inicial/contrato/sesión; hallazgos estáticos no son reproducción ejecutada ni prueba de endpoint explotable. Grafo2026-10-09 not_tracked, revisores verificaron coverage y fuente directamente. DONE anteriores conservan historia, no acreditan montaje.

## Gates

Requisitos APPROVED (`panels_requirements`), arquitectura/API/dependencias/test strategy APPROVED_FOR_PLANNING (`panels_architecture`), seguridad APPROVED_FOR_PLANNING tras ajustes (`panels_security`), UI YES por reevaluación de ambos actores (`panels_ui`). **Gate2 final APPROVED:20 tickets READY de requisitos;222 BLOCKED**.218 puede iniciar solo laboratorio; resto PENDING_DEPENDENCIES. Seguridad efectiva/recovery/concurrencia/aislamiento aún NOT_VERIFIABLE_FROM_REVIEW.

READY contractual no omite depends_on. Ejecución PARTIAL; **ACTIVATION BLOCKED** nuevas mutaciones/admin hasta autoridad real222, binding221 y correctivos/evidencias. No cambiar bloqueos217 recuperación excepcional ni017/Q029 release público. Gate2 inicial NEEDS_CHANGES y su corrección/revisión final APPROVED conservados en sesión. Comprobación documental:21 nodos, grafo acíclico, dependencias inversas/paralelismo consistentes y referencias locales válidas; no pruebas funcionales ejecutadas.

## Fases y tickets

| Ticket | Fase | Entrega atómica |
|---|---|---|
| [218](../../.codex/product/tickets/EL-TK-218.md) |1|Laboratorio y rechazo anteslisten/callback|
| [219](../../.codex/product/tickets/EL-TK-219.md) |2|Receipts durables por operación|
| [220](../../.codex/product/tickets/EL-TK-220.md) |2|CAS/revisión/capacidades/calendario|
| [221](../../.codex/product/tickets/EL-TK-221.md) |2|Binding sesiones ambos actores|
| [222](../../.codex/product/tickets/EL-TK-222.md) |0/2|Autoridad real externa: decisión/validación BLOCKED|
| [223](../../.codex/product/tickets/EL-TK-223.md) |3|Angular Router único compatible|
| [224](../../.codex/product/tickets/EL-TK-224.md) |2|HTTP creación+OpenAPI/cliente|
| [225](../../.codex/product/tickets/EL-TK-225.md) |2|HTTP nombre+cliente|
| [226](../../.codex/product/tickets/EL-TK-226.md) |2|HTTP fecha/hora+cliente|
| [227](../../.codex/product/tickets/EL-TK-227.md) |2|HTTP TZ+cliente|
| [228](../../.codex/product/tickets/EL-TK-228.md) |3|Lista/detalle/rutas/races|
| [229](../../.codex/product/tickets/EL-TK-229.md) |3|Crear UI/reconciliación|
| [230](../../.codex/product/tickets/EL-TK-230.md) |4|Nombre UI|
| [231](../../.codex/product/tickets/EL-TK-231.md) |4|Fecha/hora/DST UI|
| [232](../../.codex/product/tickets/EL-TK-232.md) |4|TZ UI/guardado separado|
| [233](../../.codex/product/tickets/EL-TK-233.md) |5|Auth/contextoCSRF/logout admin HTTP|
| [234](../../.codex/product/tickets/EL-TK-234.md) |5|Query/detalle admin/auditoría/cliente|
| [235](../../.codex/product/tickets/EL-TK-235.md) |5|Entrada/sesión/logout admin UI|
| [236](../../.codex/product/tickets/EL-TK-236.md) |5|Búsqueda/detalle admin read-only UI|
| [237](../../.codex/product/tickets/EL-TK-237.md) |7|E2E/revisión organizador|
| [238](../../.codex/product/tickets/EL-TK-238.md) |7|E2E/revisión admin/cierre|

Fase0 cerrada documentalmente con scope/contrato/handoff/gates; ningún ticket funcional ficticio DONE.222 conserva bloqueo operacional localizado. Fase4 actual solo configuración mínima; portada/compartir/lifecycle/media/etc. son entregas posteriores sin ticket hasta gates específicos. Fase6 métricas DEFERRED sin ticket de implementación.

Critical_review futuro221/222 por autenticación y recuperación post-PITR, sin extenderlo automáticamente a toda la UI.

## Orden y paralelismo

Primer ticket: **218**, tras Gate2 y predecesor215 verificado. Después219 y221 en ramas con owners MOD-002/MOD-001;223 puede avanzar cuando218 esté validado.219→220;224/225/226/227 comparten prerequisitos219/220/221, sin dependencia de negocio entre nombre/horario/TZ. Registro AppModule/contratos/cliente generado se integra secuencialmente para no editar archivos comunes en paralelo; comandos pueden prepararse en ramas con controllers disjuntos.223/220/221→228;224+228→229,225+228→230,226+228→231,227+231+228→232.

222 depende218/221 y permanece BLOCKED.233 depende221/222;234 depende233;235 depende223/233;236 depende234/235.237 requiere cadena organizador+222 para activación;238 admin+237. Fields de tickets son autoridad del grafo. No trabajo simultáneo sobre archivos compartidos; branches no eliminan dependencias ni permiten activar con stub.

Hitos: laboratorio probado → core seguro/contratos → organizador validado → admin read-only validado → revisión/cierre. Si222 no se resuelve, entregar componentes/core independientes con fail-closed sin declarar acceso funcional completo ni épica DONE.

## Pruebas y criterios de aceptación

| Riesgo / CA | Evidencia futura | Tickets |
|---|---|---|
| Aislamiento | DB/rol/marker efectivos, política ausente/ajena/URLdev denegados anteslisten/callback, sentinel propio intacto, APIdev no usada, cleanup exclusivo |218|
| Duplicación | Crear→editar→replay/carreras/key distinto/rollback/timeout/no resurrect eliminado |219/224/229/237|
| CAS/calendario | Dos writers misma revisión uno gana, legacy/lifecycle incrementan, replay viejo no sobrescribe, DST/calendario consistente |220/225..227|
| Auth/recovery | Ambos actores activecred/absent/revoke/epoch/floor/barrera/outage/PITR/carrera/ACK incierto/legacy conservador |221/222|
| Permisos | Dos owners IDscruzados/restringido/actorbody/header spoof sin datos/efectos; serverautority |HTTP+228+237/238|
| Router/contexto | Deep link/refresh/back/baseprefijada/API-assets-guest preservados, A→B inverso/retornos allowlist |223/228/235|
| Formularios | Nombre1/120/vacío/121, TZ/fecha/offset, busy/conflicto/uncertain inputpreservado, guardados separados |229..232|
| Admin | CookieHTTPS/Origin-CSRF-CORS/TTL, context no eleva/extiende, auditfailure no éxito, DTO sinmedia/invitationCode, PARTIAL/no-store/no cache503 |233..238|
| A11y |320/375/768/1024/1440, zoom200/reflow400, nombre120, keyboard/foco/dialog/RadioGroup/contraste/live, lector manual |UI+237/238|
| API/review | ExportOpenAPI/clientgen/drift, logs/traces sanitizados, dictámenes sin blockers |HTTP+237/238|

No tests funcionales ejecutados aquí. Futuras pruebas registran SHA, ambiente, comandos/exitcodes/conteos/artefactos sanitizados; ningún PASS previo certifica019. Suites mutantes solo después218 y runner dedicado. No leer secretos ni mutar datosdev para demostrar aislamiento.

## Dependencia operacional y revisión

222 requiere recurso/configuración durable externo a PITR y pruebas de garantías aceptadas; no proveedor elegido ni port/mock/default epoch1 aceptado como evidencia. La resolución técnica/operacional requiere revisión arquitectónica y de seguridad; cuando exista decisión/evidencia, reevaluar222 y dependientes. No bootstrap nuevo ni recuperación217.

Solo documentación: épica/cambio/21tickets/contrato/UI/sesión/índices/plan e inclusión específica de sesión en gitignore. Assets, código funcional, DEC/TC/ARCH y tickets históricos intactos. PR propuesto: `docs: planificar EL-EP-019 con contratos seguros y backlog incremental`. Reviewer: confirmar Gate2/grafo/readiness por dependencias, bloqueo222 y que planificación no equivalga a activación productiva.
