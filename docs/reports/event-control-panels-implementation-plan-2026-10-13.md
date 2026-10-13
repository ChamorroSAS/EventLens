# Paneles de control y gestión visual de eventos — revisión y plan verificable

Fecha: 2026-10-13. Fuente: borrador EL-EP-019 aportado por el usuario.
Solicitud confirmada: revisar y preparar un plan basado en el repositorio; no implementar.
Snapshot inspeccionado: `stage`, `87d8230aee44a7f8b3cd7b2bbdfccac04b41aeb2`, árbol limpio antes de crear este informe.

## Dictamen y límites

**NEEDS_CHANGES** para aprobar la épica completa. El objetivo y la separación de actores son claros, pero la disponibilidad condicional de métricas y varias secciones no delimita una entrega comprobable. EL-EP-019 sigue siendo un identificador candidato: no existía un archivo con ese ID en el directorio de épicas inspeccionado; este informe no lo reserva ni registra como aprobado.

| Gate de la propuesta | Resultado de esta revisión |
|---|---|
| REQUIREMENTS_READY | PENDING: cerrar alcance mínimo obligatorio y superficies condicionales |
| ARCHITECTURE_REVIEW | PENDING: transporte autenticado administrativo, escrituras HTTP y navegación |
| UI_REQUIRED | YES: cambia paneles, formularios, navegación, estados y responsive |
| READY_FOR_FRONTEND_PLANNING | NO para la extensión: falta handoff específico aprobado |
| READY_FOR_TICKET_WRITING | NO para la épica completa |
| READY_FOR_IMPLEMENTATION | NO para trabajo nuevo de esta propuesta |

Los gates aprobados de épicas anteriores conservan su alcance; no se heredan como aprobación automática de estas extensiones. Ningún ticket histórico DONE se reabre. Las unidades de trabajo indicadas abajo son propuestas sin IDs y no tickets READY. Backend independiente puede avanzar después de cerrar sus propios requisitos y gates, conforme a AGENTS.md.

La exploración del grafo devolvió solo una sección documental. `check_index_coverage` informó generación 2026-10-09 y archivos actuales `not_tracked`; las conclusiones siguientes se apoyan en lecturas y búsquedas directas acotadas. No se afirma cobertura exhaustiva de todo el repositorio.

## Evidencia del estado actual

| Capacidad | CONFIRMED en el snapshot | Brecha / consecuencia |
|---|---|---|
| Listado propio y configuración | [OrganizerService](../../apps/web/src/app/organizer/organizer.service.ts) consume cliente generado; [controlador](../../apps/api/src/events/organizer-events.controller.ts) expone GET de listado, configuración y share-access | Es reutilizable; no demuestra transporte de creación ni edición |
| Crear borrador | [EventDraftService](../../packages/event-management/src/event-draft.ts) implementa `createDraft`, nombre con trim y longitud 1..120, idempotencia y manejo de carreras | [Dashboard](../../apps/web/src/app/organizer/organizer-dashboard.component.ts): `onCreateDraft()` contiene solo un comentario. El CTA no crea nada |
| Contrato HTTP de eventos | [Schema generado](../../packages/api-client/src/schema.ts): `/api/v1/events` tiene GET y `post?: never`; configuración también es de lectura | Debe aprobarse y documentarse transporte de comandos; no editar schema generado a mano |
| Detalle del organizador | Dashboard selecciona evento en signals, consulta configuración y monta biblioteca multimedia | General/horario/acceso/participación son mayormente informativos; lifecycle y capacidad tienen texto de sección. No equivalen a formularios operativos |
| Navegación efectiva | [main.ts](../../apps/web/src/main.ts) provee `providePublicEntryRouter`; [AppComponent](../../apps/web/src/app/app.component.ts) monta su outlet; [registro](../../apps/web/src/app/navigation/all-routes.ts) incluye `/mis-eventos` y entrada guest | `app.routes.ts` y `app.config.ts` contienen otra configuración Angular Router, pero ese bootstrap no la consume. No planificar sobre ella como si fuese el montaje vigente |
| Consola administrativa | [AdminAppShell](../../apps/web/src/app/admin/admin-app-shell.component.ts) compone búsqueda, detalle, jobs, auditoría y moderación | No figura en `ALL_PUBLIC_ENTRY_ROUTES`. Su existencia no demuestra acceso productivo autenticado |
| Transporte administrativo | [AdminApiService](../../apps/web/src/app/admin/admin-api.service.ts) hace fetch a `/api/admin` y acepta `callerActorId` en `x-admin-actor-id` | [AppModule](../../apps/api/src/app.module.ts) no registra controladores administrativos. El ID del cliente jamás puede acreditar autoridad. No se ha probado una explotación de endpoint activo |
| Portadas, almacenamiento y métricas en listado | [OrganizerEventModel](../../apps/web/src/app/organizer/organizer.types.ts) contiene estado/horario/TZ, pero no portada ni consumo | Requieren proyecciones autorizadas adicionales; no insertar datos simulados ni obtener media para calcular métricas |
| E2E existente | [Pruebas de entrada](../../e2e/tests/public-entry-integrated.spec.ts) cubren Home, navegación anónima, guest, 404 y menú | No acreditan el recorrido autenticado crear → configurar → gestionar ni la consola administrativa |
| Aislamiento de integración | [Runner](../../scripts/isolated-tests.mjs) crea DB/rol por ejecución y verifica marker, DB/rol efectivos, sentinel y URL insegura antes del callback | Reutilizar esa barrera; E2E necesita además API y datos vinculados a esa ejecución |

Riesgo adicional a probar: al seleccionar otro evento, el dashboard cambia el ID antes de recibir su configuración y no limpia inmediatamente la configuración anterior. El plan exige evitar mostrar capacidades del evento previo y descartar respuestas tardías; esta revisión estática no ejecutó una reproducción.

## Matriz de impacto y dependencias

Fuentes aceptadas: [baseline](../../.codex/context/technical-baseline.md), [domain map](../../.codex/context/domain-map.md), [decisiones](../../.codex/product/DECISIONS.md), [catálogo UI](../../.codex/context/ui-components.md) y [handoffs MVP](../../.codex/context/ui-mvp-epic-review.md).

| Owner / superficie | Responsabilidad que se conserva | Cambio propuesto / dependencia |
|---|---|---|
| MOD-001 / EL-EP-001,015 | Identidad, sesión, revisión y restricciones de cuenta | Montaje HTTP de autenticación administrativa existente; guardas y limpieza de presentación privada. No segunda autenticación |
| MOD-002 / EL-EP-002,003 | Borrador, configuración, permisos y lifecycle | Adaptadores HTTP de comandos existentes; consulta autorizada, concurrencia y estados. El frontend no determina permisos por su cuenta |
| MOD-003 / EL-EP-004,005,006 | Acceso guest, carga/inspección, assets técnicos | Reutilizar share-access y pipeline de portada; DRAFT no abre participación. Portada no es aporte guest |
| MOD-004/005 / EL-EP-007..010 | Publicación, biblioteca, moderación, exportación | Componer herramientas existentes, conservando gates y permisos de sus owners |
| MOD-006 / EL-EP-011 | Capacidad, límites y ampliaciones | Proyección autorizada y montaje de componentes; no deducir cuota desde almacenamiento físico |
| MOD-007 / EL-EP-012 | Búsqueda, intervención y grants por motivo/recurso | Reutilizar `packages/admin-support`; transporte productivo autenticado y cliente generado |
| MOD-008 / EL-EP-015,017 | Borrado/restricciones y políticas | Guardas de acciones y contexto restringido; no habilitar gestión ordinaria mediante navegación |
| MOD-009 / EL-EP-013,014,016 | Auditoría, comunicación, observabilidad y evidencia agregada | Consultas sanitizadas con semántica de disponibilidad; no convertir métricas Beta operativas en dashboard aprobado por inferencia |
| Entrada y UI / EL-EP-018, CR-006 | Paths públicos/guest, shells, tokens y marca | Ampliar montaje sin romper contratos. Conservar assets históricos, PNG canónicos e identificadores técnicos |

El borrador debe mencionar MOD-007 y los demás owners reales, no atribuir toda la administración a MOD-001..003. Monolito modular, PostgreSQL 16, NestJS, Angular, REST/OpenAPI y cliente generado siguen vigentes. No se propone infraestructura ni dependencia nueva.

## Resoluciones necesarias antes de escribir tickets

| Tema PENDING | RECOMMENDED para cerrar el alcance | Evidencia necesaria para el gate |
|---|---|---|
| Entrega mínima | Primera entrega: listado propio, creación DRAFT, configuración general/horario y detalle, más entrada administrativa segura y búsqueda/detalle existentes | Lista explícita de secciones obligatorias y diferidas, sin prometer wizard completo desde la primera entrega |
| Configuración y acciones | Seleccionar por sección los comandos existentes obligatorios; descripción solo si el owner confirma soporte. Revisión del borrador no equivale a activación | Matriz campo/comando/estado/capacidad/error/revisión/idempotencia |
| Métricas | Diferir indicadores nuevos hasta aprobar definición, población, ventana, unidad, frescura y autorización. Un listado paginado no calcula totales globales | Catálogo de métricas admitidas y estados: disponible, no disponible, carga, fallo, parcial |
| Admin | Reutilizar credenciales/sesiones de MOD-001 y grants de MOD-007. Definir entrada/login/logout y errores sin agregar privilegios | Contrato HTTP autenticado y pruebas de revisión/revocación; spoof de header denegado |
| Router | Validar contra contrato de entrada aceptado la continuidad del router montado o una migración explícita a Angular Router | Dictamen arquitectónico que preserve paths, base href, deep links, refresh, guest y retornos seguros; no activar ambos como autoridades paralelas |
| URLs de detalle/configuración | Definir URLs y comportamiento de refresh/back según handoff; no inventar nuevas rutas en este informe | Registro de rutas y estados aprobados por actor |
| Concurrencia y resultado incierto | Conservar clave de idempotencia al reintentar creación con payload idéntico tras timeout; cambiarla para una intención nueva | Contrato de replay/conflicto y política de revisión para cada comando. Sin retry ciego de comandos sensibles |
| Rendimiento | Paginar cuando lo requiera el dominio y el volumen esperado; evitar N+1; definir presupuesto medible | Límites de página, orden estable, dataset y presupuesto aprobados; no cifra de latencia inventada |

## Plan por fases y unidades verificables

### Fase 0 — Requisitos, arquitectura y handoff

1. Confirmar ID/registro de cambio según backlog vigente y cerrar la tabla anterior con producto.
2. Revisar límites de contratos y owners sin alterar decisiones aceptadas ni cierres históricos.
3. Preparar handoff UI de los dos actores: estructura, estados, rutas, foco, copy, responsive, permisos y resultados parciales. Reutilizar OrganizerAppShell, AdminAppShell, CreateEventForm conceptual, formularios propietarios, EventSharePanel, biblioteca y patrones genéricos del catálogo.
4. Obtener `REQUIREMENTS_READY`, dictamen arquitectónico y `READY_FOR_FRONTEND_PLANNING: YES` para el alcance que se vaya a entregar. Generar después tickets atómicos y pasar Gate 2.

Salida comprobable: matriz de contratos y handoff aceptados; no código frontend dependiente antes de ese gate.

### Fase 1 — Asegurar el laboratorio de validación

Unidades: adaptar runner si los nuevos paquetes no tienen modo aislado; extender harness E2E para iniciar API dedicada sobre la DB/rol creados por el runner y SPA en puerto propio. No reutilizar el API de desarrollo ni servidor compartido para pruebas autenticadas mutantes.

Archivos: `scripts/isolated-tests.mjs`, `scripts/workspace.mjs`, `e2e/playwright.config.ts` y harness de pruebas correspondiente; consultar `packages/database/src` para reutilizar la política vigente.

Salida: evidencia de rechazo con política ausente/marker ajeno/DB o rol efectivos distintos/URL eventlens, sentinel intacto y cleanup exclusivo de recursos propios. Esta prueba precede cualquier suite mutante. Fixture por test/worker para evitar colisiones con `fullyParallel`.

### Fase 2 — Transporte mínimo del organizador

Unidades secuenciales: contrato HTTP de creación → adaptador autenticado que delega `EventDraftService.createDraft` → export OpenAPI/cliente → transporte de configuración por sección. Reutilizar autenticación de escritura y barreras existentes, revisar protección CSRF/origen de comandos cookie-auth y mapear errores sanitizados. Nunca aceptar organizerId/rol del body como autoridad.

Archivos: `apps/api/src/events/organizer-events.controller.ts` o controladores semánticos separados; registro en `apps/api/src/app.module.ts`; `apps/api/src/export-openapi.ts`; generación de `packages/api-client/src/schema.ts`; tests API/contrato. El path/método exacto de comandos se aprueba en Fase 0, no es un contrato establecido por este plan.

Salida: una creación autenticada produce DRAFT restrictivo con owner servidor; replay retorna el mismo recurso; conflicto de payload se distingue; fallo no anuncia éxito. Configuración aplica reglas, revisiones e idempotencia del owner sin copiar negocio al controlador.

### Fase 3 — Recorrido visual mínimo del organizador

Unidades: formulario de creación y errores → selección/detalle estable → configuración general → horario/TZ/DST → estados de sesión y cuenta. CTA con eventos «Crear nuevo evento»; vacío «Crear mi primer evento».

Archivos: `apps/web/src/app/organizer/organizer-dashboard.component.ts`, `organizer.service.ts`, `organizer.types.ts`, shell/lista/navegación de configuración; nuevos formularios solo si no hay implementación reutilizable. Conservar nombres técnicos `eventlens-*`. Registrar rutas aprobadas en la infraestructura realmente montada.

Salida: doble click, timeout/retry y refresh no duplican DRAFT; ID queda disponible después de crear aun si otra sección falla. Limpiar configuración/capacidades al cambiar evento y descartar respuestas obsoletas; usar evento autorizado devuelto por servidor, no solo snapshot previo del listado. Nunca anunciar éxito antes del ACK.

### Fase 4 — Composición progresiva del detalle

Unidades independientes y dependientes de sus contratos: portada/presentación/bienvenida → participación/moderación → compartir → lifecycle → capacidad → biblioteca/exportación. No representar todas las secciones como una transacción o un formulario indivisible.

Archivos: componentes propietarios en `apps/web/src/app/event-access`, `lifecycle`, `capacity`, `media` y sus transportes; API/cliente faltantes bajo cada owner. La portada reutiliza asset EVENT_COVER con inspección y asignación versionada.

Salida por unidad: capacidades efectivas, loading/empty/error/forbidden/partial, configuración previa conservada ante fallo, PIN jamás recuperado en claro; share-access solo cuando permitido. Aporte guest y QR no habilitados por crear DRAFT. Exportaciones sujetas a permisos y disponibilidad.

### Fase 5 — Consola administrativa productiva

Puede desarrollarse en paralelo con Fases 2..4 solo tras sus gates independientes. Unidades: contrato de sesión/entrada → transporte autenticado búsqueda/detalle → cliente generado → montaje shell → integrar operaciones, jobs/auditoría/moderación por owner. No exponer de golpe todos los endpoints asumidos por fetch.

Archivos: `packages/identity` y `packages/admin-support` como servicios reutilizados; adaptadores semánticos en `apps/api/src`; `apps/web/src/app/admin/admin-api.service.ts`, `admin-app-shell.component.ts`, rutas aprobadas, `jobs` y `audit` cuando correspondan.

Salida: organizador/anónimo/header de actor falsificado no obtienen datos administrativos; revocación/revisión invalida acceso; grants media exigen recurso/motivo y auditoría sin preview predeterminada; intervenciones respetan owner, idempotencia y concurrencia. Éxito UI no sustituye confirmación del dominio.

### Fase 6 — Proyecciones e indicadores opcionales aprobados

Solo después de cerrar el catálogo de métricas: consultas read-only mínimas con permisos/paginación, sin N+1 ni lectura de objetos multimedia. Probar consistencia entre lista y resumen con las mismas definiciones; no inventar cero si el indicador falta ni sustituir métricas operativas por actividad individual de invitados.

Salida: indicadores definidos, frescura explícita y estados diferenciados. Si esta fase se difiere, actualizar alcance/CA/DoD de la entrega para que la ausencia no se esconda tras «cuando disponible».

### Fase 7 — Validación integrada y revisión independiente

Ejecutar checks por unidad, luego recorridos integrados y revisión de seguridad/rendimiento. Sin merge automático ni modificación de datos locales preexistentes. El dictamen de esta planificación no es una revisión independiente de implementación.

## Matriz de aceptación y evidencia futura

| CA del borrador | Prueba que debe ejecutar el ticket | Evidencia requerida |
|---|---|---|
| 01,02 | Sesión propia → lista real; vacío → CTA funcional; restricción por borrado | Componente + HTTP + E2E con fixture autenticado |
| 03,04 | Nombre trim 1/120, vacío/121; doble click; replay concurrente; timeout tras commit; conflicto/fallo PostgreSQL | Unitarias owner/adapter, integración PostgreSQL y E2E sin duplicación |
| 05 | Guardado por sección; error de portada/configuración posterior conserva DRAFT; revisión concurrente rechazada | HTTP/owner + E2E, estado persistido antes/después |
| 06 | Dos organizadores, IDs cruzados y sesión caducada/revocada | Rechazo backend sin datos ajenos y limpieza de UI/caché |
| 07 | Tabla de estados/capacidades del owner; cambio rápido A→B y respuestas en orden inverso | Unitarias/componentes + HTTP; sin acciones de A visibles para B |
| 08,09 | Entrada admin con autoridad real; anónimo/organizador/spoof de header; revisión/revocación | HTTP productivo + E2E, sin aceptación de actor declarado por cliente |
| 10 | Media sin grant/motivo, grant para otro recurso, grant revocado; acción permitida auditada | Integración y registros sanitizados; sin PIN/token/URL firmada en evidencias |
| 11,12 | Móvil/desktop, zoom/reflow, teclado, foco en diálogo/retorno, errores anunciados, labels y estado textual | Playwright con viewports + revisión manual de lector de pantalla y contraste; WCAG no se certifica solo por tests |
| Transversal | Rechazo aislamiento, cleanup propio, DB desarrollo intacta, cliente/OpenAPI sin drift, consultas paginadas sin N+1 | Guard-proof y log de ejecución; mediciones SQL/dataset/presupuesto definido |

Comandos existentes que servirán como base después de implementar:

```powershell
pnpm.cmd --filter @eventlens/web typecheck
pnpm.cmd --filter @eventlens/web test
pnpm.cmd --filter @eventlens/web build
pnpm.cmd openapi:export
pnpm.cmd client:generate
pnpm.cmd client:check
pnpm.cmd test:integration
pnpm.cmd test:e2e
```

Los últimos comandos no constituyen autorización para usar la DB actual: integración requiere runner dedicado y su prueba de barrera; E2E mutante queda condicionado a Fase 1. Tests de paquetes del dominio deben añadirse al runner aislado o usar su harness validado, nunca ejecución directa con DATABASE_URL de desarrollo. Capturar SHA, comandos, ambiente sin secretos, conteos, exit codes y artefactos sanitizados. Traces de Playwright pueden contener datos privados: aplicar la política de sanitización/retención antes de adjuntarlos.

## Estado de entrega de este informe

CONFIRMED: revisión estática y plan preparados. No se ejecutaron tests en esta tarea, no se implementaron paneles ni se modificaron decisiones, épicas o tickets históricos. Las pruebas exitosas de la sincronización anterior no certifican esta propuesta.

Riesgos residuales: autoridad administrativa no acreditada por montaje productivo; configuración no expuesta para escritura; doble infraestructura de rutas; alcance condicional demasiado amplio; falta de métricas autorizadas; respuestas tardías y revisiones; E2E actual apunta a un API configurable sin garantía de aislamiento mutante. Todos tienen gate o fase de resolución arriba.

Próximo paso histórico: cerrar Fase 0 con producto/arquitectura/UI, reservar ID según backlog y convertir únicamente el alcance aprobado en tickets nuevos. Priorizar laboratorio → crear DRAFT autenticado → configuración general/horario y detalle; mantener consola y métricas como entregas con dependencias explícitas.

Seguimiento por solicitud posterior del2026-10-13: alcance mínimo confirmado, dictámenes y tickets nuevos en [backlog de ejecución](event-control-panels-backlog-2026-10-13.md). Este informe conserva su NEEDS_CHANGES histórico; nuevos contratos/gates resuelven planificación, no certifican implementación. Activación autenticada sigue condicionada a autoridad real y correctivos/proofs.
