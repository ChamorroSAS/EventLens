# EL-EP-019 — Paneles de gestión de Phoeve y creación guiada de eventos

## Status
DRAFT — PRODUCT_REVIEW_REQUIRED / ARCHITECTURE_REVIEW_REQUIRED / UI_REQUIRED: YES / REQUIREMENTS_READY: NO / READY_FOR_TICKET_WRITING: NO / NOT_IMPLEMENTED_BY_THIS_EPIC.

**Fecha de propuesta:** 2026-10-13. **Responsable humano de desarrollo y aprobación:** Néstor. No se crean tickets ni se altera el estado de épicas/tickets existentes. Nombre público propuesto: **Phoeve**; identificadores internos `EventLens`/`@eventlens/*` permanecen estables conforme al rebranding.

**Tipo de trabajo:** extensión de experiencia de producto y composición UI/HTTP de capacidades ya existentes, **no creación de otro motor de eventos, módulo administrativo ni modelo de identidad**. El ID EL-EP-019 se comprobó disponible en el árbol de `stage` al preparar el borrador; revisar de nuevo al formalizar.

## Module
Frontend transversal de MOD-002 (organizador/eventos) y MOD-007 (administración/soporte), consumiendo MOD-001 (sesiones/identidad) y, para visualización contextual, MOD-003/004/005/006/008/009 según contratos owner. No modifica límites de módulo ni otorga permisos nuevos.

## Objective / outcome
1. El **organizador autenticado y habilitado** entra a **Mis eventos**, reconoce el estado de sus eventos, crea un primer evento real a partir de **nombre**, obtiene un borrador `DRAFT` persistido y continúa su configuración por secciones sin salir de la experiencia.
2. La **administración autorizada** dispone de una vista operativa de eventos y casos para localizar, priorizar, abrir **detalles autorizados**, consultar estados/incidencias y ejecutar **únicamente acciones ya permitidas por los dominios propietarios**.
3. Ambas experiencias comparten la identidad visual Phoeve, patrones de navegación/errores/accesibilidad, **no** sesiones, privilegios ni visibilidad de datos.

**Resultado medible mínimo:** un organizador habilitado puede crear y reabrir su DRAFT mediante UI real + API + PostgreSQL, y un administrador puede localizar un evento/caso y consultar su detalle autorizado con navegación y estados claros, sin recibir permisos de owner ni multimedia por defecto.

## Problem solved
Hoy existe el Dashboard/Shell/List del organizador y su botón «Crear mi primer evento», pero `OrganizerDashboardComponent.onCreateDraft()` **no implementa la acción**. El dominio `EventDraftService.createDraft` (EL-TK-020 DONE) sí existe, mientras que el controller HTTP `OrganizerEventsController` observado en `stage` contiene lectura GET, sin POST de creación verificado. Una experiencia visual sin una mutación real puede confundir al usuario.

Existen `AdminAppShell`, `AdminEventSearch`, `AdminEventDetail`, moderación, jobs y auditoría; no se deben reimplementar. La integración, ruta/autenticación administrativa y detalle efectivo deben verificarse en runtime: disponer de componentes o pruebas del dominio no demuestra por sí solo un panel accesible end-to-end. El admin web actual utiliza `/api/admin` y `x-admin-actor-id`; **no se deben considerar autoridad de sesión**.

## Actors
- **Organizador:** cuenta Beta validada, sesión ordinaria vigente, propietario de sus propios eventos.
- **Administración:** principal humano administrativo autenticado mediante sesión propia; competencias sujetas a capabilities y políticas existentes.
- **Sistema:** actualiza estados/fechas/contadores mediante fuentes de dominio; nunca delega autorización a la presentación.
- **Fuera de actor funcional:** invitado sin cuenta; su recorrido de QR permanece en EL-EP-004.

## Scope

### A. Panel del organizador — `/mis-eventos` (P0)
- Reutilizar `OrganizerDashboardComponent`, `OrganizerAppShellComponent`, `EventListComponent`, `EventCardComponent`, `EventSettingsNavComponent` y `OrganizerService`; aplicar marca Phoeve aprobada por CR de branding **sin depender de cambiar selectores técnicos**.
- Cabecera de contexto, saludo neutro (sin exponer PII innecesaria), título «Mis eventos», botón **Crear evento**, enlace a Mi cuenta/salir mediante contratos existentes.
- Lista de eventos **solo del owner**, con nombre, estado real, fecha/local/TZ cuando exista, disponibilidad/acciones habilitadas; orden/filtro accesible por estado si el owner proporciona contrato. No inventar estadísticas ni mostrar eventos ajenos.
- Estados distintos: cargando, sin eventos (CTA de primera creación), error recuperable con retry, sesión expirada, acceso restringido por eliminación, vista con eventos, operación de creación en progreso y resultado.
- Resumen visual mínimo: total de eventos propios y, si se pueden derivar **sin consultas extra engañosas**, agrupaciones por estado del mismo listado. Cuota/archivos/procesamiento/exportación solo mediante proyecciones reales de sus owners y con `UNAVAILABLE` o equivalente cuando falten.
- Seleccionar evento → panel de gestión existente con secciones: datos generales, programación/TZ, acceso PIN/QR, permisos de subida/galería, lifecycle, capacidad y media. No habilitar controles que no tengan adaptador, capacidad y contrato owner.

### B. Crear evento real — organizador (P0, brecha principal)
- CTA desde estado vacío y listado abre formulario/modal/ruta hija según handoff del UI Designer, **sin crear ruta pública nueva por inferencia**.
- **Único campo obligatorio:** nombre recortado, 1–120 caracteres; nombre del evento no es nombre de usuario. Campos de fecha, horario, portada, bienvenida, PIN, galería, moderación y cuota son **configuración posterior** de EL-EP-002/003/004/011. No exigirlos para crear.
- Invocar `EventDraftService.createDraft` a través de un **adaptador HTTP autenticado real**. Endpoint candidato `POST /api/v1/events` **sujeto a revisión del contrato OpenAPI y ownership**; no se afirma implementado. El backend deriva owner de la sesión validada; jamás aceptar `organizerId` desde JSON/headers manipulables.
- Idempotencia del comando según contrato del dominio `idempotencyKey` y estrategia server/client aceptada: bloquear doble clic, reintentos seguros y retorno de un único `eventId` canónico. No prometer exactamente una vez sin pruebas de concurrencia.
- Valores iniciales aceptados de EL-EP-002/DEC-069: `DRAFT`, `America/Bogota`, `uploads_enabled=false`, `guest_gallery_enabled=false`, `moderation_mode=AUTO_PUBLISH`, `PIN desactivado`. Evento privado/inaccesible a invitados hasta que los contratos de publicación/apertura se satisfagan.
- Tras respuesta exitosa confirmada en backend: actualizar listado sin duplicado, seleccionar nuevo evento y mostrar próximos pasos de configuración. Ante 400/401/403/409/429/503 y timeout, conservar nombre, explicar estado y permitir recuperación segura; no crear localmente un «evento» falso.
- Requerir sesión ordinaria, Origin/CSRF para mutación donde apliquen contratos aceptados, no-store y protección frente a enumeración/IDOR. Política de límite de cantidad de eventos y capacidad: **no inventar límite nuevo**; consultar capacidad efectiva del dominio.
- Cancelar formulario sin escrituras; abandono/reentrada conserva solo estado local transitorio no sensible y no inventa drafts.

### C. Panel de administración — visión operativa (P0/P1 según contratos)
- Reutilizar **la consola existente** `AdminAppShell`, `AdminEventSearch`, `AdminEventDetail`, `AdminModerationPanel`, `ReportQueue`, `ReportDetail`, `JobsViewer` y `AuditLogViewer`; mantener sección/owner propio.
- Vista inicial accesible para administración **solo mediante su sesión/guard y ruta independientes**: no inyectar consola en Home público ni reutilizar `/mis-eventos`. La ruta administrativa efectiva y mecanismo de autenticación se deben **verificar/definir técnicamente**; `app.routes.ts` no es evidencia de montaje si `main.ts` usa otro router.
- Información operativa autorizada: búsqueda y filtros de eventos/organizadores; propietario, estado/fechas/TZ, plan/cuota/consumo, jobs/errores sanitizados, reportes/casos, intervenciones y trazabilidad. Mostrar `AVAILABLE/PARTIAL/UNAVAILABLE` por sección cuando lo soporte la proyección; no ofrecer acciones falsas.
- Panel de **casos**: reutilizar cola/detalle EL-EP-009; cuando contratos existentes lo expongan, mostrar identificador, tipo/motivo, severidad, estado, evento y recurso relacionado, tiempos de gestión, evidencias mínimas permitidas, historial/decisiones y acciones habilitadas. **No** presentar imágenes ni contenido sensible en listas/overview.
- Detalle de caso/medios solo con justificación, sesión admin vigente, capabilities y auditoría. Registrar motivo y resultado de toda intervención según owner; nunca habilitar suspensión por simple visibilidad del botón.
- Tarjetas/KPIs (ej. eventos por estado, casos abiertos, jobs fallidos) **PENDING DATA CONTRACT**: únicamente si existe lectura agregada autorizada, paginación/alcance y definición temporal; jamás sumar la primera página como «total global». No añadir tablas de estadísticas ni jobs nuevos solo para dibujar tarjetas.
- La administración **NO crea eventos como organizador ni en nombre de terceros** bajo esta épica. «Crear su evento» aplica exclusivamente al organizador; crear eventos por admin exigiría análisis formal de autoridad, auditoría y aprobación separada.

### D. Experiencia UI/UX transversal
- Identidad pública Phoeve en headers, títulos y textos nuevos; Manrope y tokens `--el-*` existentes; sin nueva librería/framework ni segundo frontend.
- Responsive 320px, 768px, 1440px; navegación por teclado, contraste, foco visible, estados anunciados (WCAG 2.2 AA objetivo); layouts distintos para mobile organizer y admin desktop adaptable.
- Confirmaciones para acciones de impacto; no para lectura. Estados vacíos útiles, fallos parciales, indicadores de carga diferenciados, errores accesibles, sin pérdidas de contexto al volver de detalle.
- Filtros, búsqueda, paginación y acciones accesibles solo si respaldados por contrato. Orden real/estable; no paginación local de datasets incompletos presentada como global.
- Tests visuales a tamaño de uso del logo Phoeve; assets y autorización de publicación de marca son gate independiente.

## Out of scope
- Reimplementar creación de DRAFT del dominio (EL-TK-020) o su persistencia; cambiar estados, reglas de fecha/TZ, PIN, QR, multimedia, cuotas, exportaciones, eliminación.
- Pagos, planes comerciales, facturación, invitados como cuentas, coparticipantes/coorganizadores, nuevas jerarquías de roles, impersonación.
- Que el administrador cree eventos, entre como owner, visualice galerías privadas sin grant, gestione por privilegios implícitos, o realice acciones fuera de EL-EP-012.
- Rediseñar colas de denuncias, auditoría o jobs ya propiedad de EL-EP-009/014/012.
- Cambiar `@eventlens/*`, cookies, rutas/contratos aceptados por estética, migraciones, DEC/TC/ARCH, tablas de contadores sin gate arquitectónico.
- Lanzamiento público de Phoeve o formularios Beta mientras EL-EP-017 y clearance de nombre estén pendientes.

## Business rules
- Identidad y permisos se derivan **siempre del servidor**: `OrganizerActorContext` para owner y `AdminActorContext` validado para admin; un campo cliente `x-admin-actor-id` no constituye identidad.
- Vista owner solo eventos propios, y recursos por evento revalidan ownership cada vez; falla seguro en 401/403/404 sin divulgar eventos ajenos.
- `DRAFT` no permite acceso guest ni uploads; crear no activa, publica, cobra, concede QR ni incrementa consumos inventados.
- Estados de cuenta restringida/suspendida y sesión vencida respetan reglas MOD-001/EL-EP-015; redireccionamiento seguro sin loops ni URLs externas.
- El estado y disponibilidad de acciones vienen de capabilities backend y son revalidados al mutar; ocultar botón no sustituye backend auth.
- Toda mutación de dominio conserva atomicidad transaccional/auditoría/idempotencia según contratos existentes; la UI nunca modifica directamente PostgreSQL.
- Las métricas agregadas deben contar con definición y permisos; si fuente no está disponible, mostrar estado parcial en lugar de 0.
- Un caso reportado no implica ocultamiento automático de media; intervención depende de revisión y owner EL-EP-009.
- Sin envío de correos reales, apertura de beta ni cambios legales implícitos por construir el dashboard.

## Main scenarios / historias de usuario
| ID | Actor | Historia / flujo | Resultado observable |
|---|---|---|---|
| US-019-01 | Organizador nuevo | Al entrar en Mis eventos sin eventos, deseo ver estado vacío con CTA claro | No confunde vacío con error; CTA funciona |
| US-019-02 | Organizador habilitado | Quiero ingresar solo el nombre y crear mi evento | Backend persiste un único DRAFT propio y UI lo confirma |
| US-019-03 | Organizador | Quiero abrir mi borrador y continuar configuración posteriormente | Vista de detalle toma snapshot/capabilities reales |
| US-019-04 | Organizador | Quiero visualizar mis eventos y su estado efectivo | Listado aislado por owner; cargando/vacío/error correctos |
| US-019-05 | Organizador | Quiero reintentar si falla la creación sin eventos duplicados | Mismo resultado idempotente o error claro sin pérdida de nombre |
| US-019-06 | Administración | Quiero llegar a una consola protegida y buscar eventos/organizadores | Solo admin autenticado ve resultados permitidos |
| US-019-07 | Administración | Quiero consultar ficha del evento y sus secciones operativas | Detalle parcial/total exacto, sin media automática |
| US-019-08 | Administración | Quiero abrir un caso desde la cola, ver severidad/estado/trazabilidad y actuar | Reutiliza case owner, permisos/razón/auditoría |
| US-019-09 | Administración | Quiero reconocer incidentes pendientes sin cifras engañosas | Indicadores respaldados por contratos o no disponibles |
| US-019-10 | Ambos | Quiero navegar en móvil/teclado con errores comprensibles | WCAG y regresión de flujos existentes |

## Edge cases
- Dos clics/requests concurrentes de crear; timeout tras COMMIT; misma idempotency key con payload distinto; sesión expira durante creación; 403 de cuenta suspendida/restringida; nombre de espacios o longitud inválida; fallo parcial al refrescar listado tras éxito.
- Evento queda CLOSED/SUSPENDED/DELETED/PENDING_DELETION mientras se muestra; cambios de permisos; otro owner solicita ID ajeno; dos pestañas con sesión cerrada.
- Listados admin masivos con paginación; filtros vacíos; fragmentos de sección UNAVAILABLE; caso reportado sin media; prohibición de acceso a datos personales; capacidades que cambian después de abrir la ficha; intento directo a ruta admin sin sesión.
- Fecha sin configurar y TZ inicialmente America/Bogota, sin deducir evento ACTIVE ni ofrecer URL QR válida.
- Assets Phoeve inaccesibles o fallback del logo; mobile overflow, zoom 200%, lectores de pantalla y reanudación tras fallo de red.

## Data
Reutilizar los contratos de `OrganizerEventModel`, `EventConfigurationModel`, `AdminEventDetailSnapshot`, `AdminSearchResult`, `AdminCaseDetailResult` y proyecciones existentes. Para la creación, comando `{name, idempotencyKey}` según contrato revisado; owner y fechas/autorización calculados en servidor. Evitar nuevos campos persistidos sin demostrar un requisito no cubierto por owner.

**Datos propuestos en pantalla:** organizador: nombre, estado, TZ, fecha de inicio opcional, modos/capabilities, uso/capacidad solo cuando disponibles. Administración: filtros autorizados, ficha agregada, owner/estado, alertas y casos, fecha/status/SLA interno **solo donde ya esté aprobado por EL-EP-009**, auditoría y jobs sanitizados. No exponer PIN, tokens, URLs firmadas, emails en logs, ni metadatos de otras cuentas.

## Permissions
| Capacidad | Organizador autenticado | Administración autenticada | Guest/anónimo |
|---|---|---|---|
| Ver lista de eventos propios | Sí, con sesión ordinaria | No como organizador; usa búsqueda admin | No |
| Crear DRAFT propio | Sí, nombre válido y permisos owner | **No**; falta facultad aprobada | No |
| Editar/configurar DRAFT propio | Sí, según capabilities y lifecycle | Solo corrección admin existente y autorizada | No |
| Consultar panel administrativo/casos | No | Sí, filtros/capabilities de dominios owners | No |
| Ver imágenes privadas de un caso | Solo donde ownership/visibilidad lo permita en módulos propios | Solo grant justificado, temporal y auditado | No |
| Suspender/reactivar evento | No | Solo operaciones administrativamente aprobadas | No |
| Crear eventos en nombre de terceros | No | **No autorizado en esta épica** | No |

## Integrations
- `apps/web/src/app/organizer/organizer-dashboard.component.ts`: conectar CTA vacío y CTA general con formulario de creación, sin rehacer listado y configuración.
- `apps/web/src/app/organizer/organizer.service.ts`: consumir cliente `@eventlens/api-client` generado para la mutación, tipado según OpenAPI; conservar GET existentes.
- `apps/api/src/events/organizer-events.controller.ts`: evaluar POST de creación (candidato `POST /api/v1/events`) a través de `EventDraftService.createDraft`; seguridad de cookie, Origin/CSRF, errores estables, requestId/correlationId, estado HTTP revisados por architect. Regenerar contrato/client, no editar salida generada manualmente.
- `apps/web/src/app/admin/*`: **componer** panel operativo a partir de servicios existentes y sus contratos; corregir integración real con identidad/guards/URLs sin confiar en `x-admin-actor-id`.
- `apps/web/src/app/navigation/all-routes.ts`, `main.ts`, `public-entry-routes.contract.ts`: conservar `/mis-eventos`; entrada administrativa independiente y segura requiere verificación. `app.routes.ts` legacy no se usa como justificación de ruta efectiva.
- `packages/admin-support`, `packages/media-inspection`, `packages/event-management`, `packages/capacity-management`, `packages/observability`: adapters/ports owners; sin duplicación de negocios.
- `docs/branding/`: consumir assets Phoeve aprobados sin rediseñar UI foundation ni convertir brand clearance en permiso de servicio público.

## Dependencies
| Predecesor / elemento | Estado observado | Contrato reutilizado / condición |
|---|---|---|
| EL-EP-001, EL-EP-018 (EL-TK-205..214) | Históricamente DONE | Sesión organizador, guard, enlace `/mis-eventos`, cliente/routing |
| EL-EP-002 (EL-TK-020, 047, 048) | Históricamente DONE | createDraft de dominio, listado y shell UI; **CTA no conectado** |
| EL-EP-003 / EL-EP-004 / EL-EP-011 | Dominios propietarios | Lifecycle, PIN/QR, capacidad; no redefinir reglas |
| EL-EP-012 (EL-TK-146..155) | Componentes/tickets existentes | Búsqueda, detalle, intervenciones, media grants y consola |
| EL-EP-009 / EL-EP-014 | Históricamente implementados en alcance propio | Casos, auditoría y observabilidad; no fabricar estadísticas |
| Contrato API / owner security | **GAP por verificar** | POST crear, integración admin, sesión/CSRF; pruebas runtime reales |
| Rebranding Phoeve | Trabajo en curso | Assets/textos públicos aprobados por producto para uso en UI |
| EL-EP-017 / Q-029 + clearance marca | BLOCKED / DEFERRED | **Bloquea publicación pública**, no planificación ni test privado |

**No crear tickets sin auditoría de cobertura** frente a EL-TK-020/047/048/146..155/205..214. El `planner` debe distinguir brecha de integración HTTP de brecha UI y evitar números nuevos mientras no se revise la serie disponible.

## Relevant non-functional requirements
- Privacidad/seguridad: owner isolation, least privilege, auth/CSRF/Origin, no-store, no exposición de media/casos/PII y auditoría de mutaciones. Seguridad no depende de ocultamiento visual.
- Rendimiento: usar paginación y consultas acotadas de owners; no añadir lecturas N+1 para tarjetas ni polling permanente sin necesidad. Objetivos de latencia concretos pendientes de presupuesto de rendimiento verificado.
- Accesibilidad: mobile-first organizer, responsive admin, WCAG 2.2 AA, focus/teclado/lector; mensajes en español.
- Confiabilidad: retry acotado, carga parcial por sección, idempotencia crear, refresh consistente, manejo de conexión perdida y estados vacíos reales.
- Arquitectura: monolito modular, app Angular única, PostgreSQL y storage privado; reusar `@eventlens/*`, OpenAPI tipado y CSS tokens, sin servicios nuevos.
- Operación/costo: no dashboards de telemetría en tiempo real ni materialized views sin justificación; datos reales, consultas simples y sin sobreingeniería.

## Success criteria — escenarios verificables
| Criterio | Evidencia exigida |
|---|---|
| AC-01 | Organizador con cero eventos ve CTA y puede crear un DRAFT solo con nombre válido; DB confirma `owner`, defaults DEC-069 y único evento |
| AC-02 | Doble clic/concurrencia/retry con clave conserva un único evento; conflicto de payload no duplica y se explica; error temporal no afirma creación |
| AC-03 | 401/403/404, sesión restringida, owner ajeno y cuenta bloqueada impiden lectura/mutación conforme políticas |
| AC-04 | Después de crear, `/mis-eventos` lista el borrador y permite abrir configuración autorizada; cancelar no persiste |
| AC-05 | Eventos con estados distintos muestran campos/capabilities verdaderos; no muestran botón de acción sin backend habilitado |
| AC-06 | Admin no autenticado/organizador/guest no obtiene consola/detalles/casos por navegación ni HTTP; `x-admin-actor-id` inyectado no concede autoridad |
| AC-07 | Admin autorizado busca un evento, consulta ficha completa/parcial y abre caso existente; sin media previa ni secretos |
| AC-08 | Intervención/caso requiere motivo, capability y auditoría según owner; fallos no muestran éxito ni habilitan acción |
| AC-09 | 320/768/1440 CSSpx, zoom 200%, teclado/foco/lector y estados loading/empty/error/retry pasan verificaciones |
| AC-10 | Tests unit/component, integración con PostgreSQL aislado, OpenAPI/client-check, web build/typecheck y Playwright root/navegación/mutación, sin usar datos dev reales |
| AC-11 | Sólo Phoeve visible en superficies nuevas aprobadas; identidades técnicas/tickets/decisiones históricos preservados; gates legales continúan |
| AC-12 | No duplicación de endpoints de búsqueda/admin, createDraft, jobs, moderación ni contadores; auditoría de diff demuestra composición de owners |

## Riesgos
1. **Alto: botones simulados:** creación sin POST y respuestas UI optimistas; requiere integración real.
2. **Alto: seguridad admin:** header `x-admin-actor-id` y ruta legacy no constituyen auth; definir backend session+capabilities y guard.
3. **Alto: divergencia entre UI y dominio:** estado/capability cambia; mutación debe revalidar.
4. **Medio: falsos indicadores:** contar solo página o datos incompletos para métricas globales.
5. **Medio: acoplamiento de ownership:** duplicar datos/casos/jobs en un «dashboard service» nuevo.
6. **Medio: pruebas inseguras:** aislar PostgreSQL; prohibido limpiar bases ajenas, conforme CR-005.
7. **Medio: rebranding y legal:** marca Phoeve sin autorización comercial definitiva; no alterar estado de EL-EP-017.
8. **Medio: definición visual insuficiente:** handoff UI y aceptación de diseño antes de ticket writing.

## Open questions — requieren decisión o evidencia
- **Q-019-01 (UI):** ¿Dashboard organizador parte directamente de «Mis eventos» o requiere home interno con resumen superior? Propuesta: mantener `/mis-eventos` y añadir resumen ligero dentro del shell, sin ruta nueva.
- **Q-019-02 (UI):** ¿Crear evento abre modal/panel lateral/ruta interna? Propuesta: formulario simple dentro del dashboard y transición a detalle tras persistir.
- **Q-019-03 (alcance admin):** ¿panel administrativo es solo consola tabulada ya existente o también portada con indicadores globales? Propuesta: consola/tablero operacional sin KPIs globales hasta contrato de agregación.
- **Q-019-04 (infra):** ¿Cuál es el mecanismo vigente de sesión y ruta administrativa realmente montado? Debe verificarse antes de READY.
- **Q-019-05 (API):** Confirmar `POST /api/v1/events`, DTO, idempotency key, CSRF, respuestas y manejo de rate limits a partir de contrato técnico y domain service.
- **Q-019-06 (casos):** Qué atributos concretos de case detail son visibles por capability/admin, y qué estados `UNAVAILABLE` expone owner.
- **Q-019-07 (KPIs):** Definiciones, cardinalidad y fuentes de proyección; excluir métricas sin respaldo.
- **Q-019-08 (marca):** confirmar assets Phoeve finales y texto/titular legal publicable, sin bloquear desarrollo privado.

No usar respuestas propuestas como decisiones aceptadas; resolver con discovery/product y revisión de architect/requirements/UI.

## UI/UX handoff solicitado
El `ui_designer` deberá entregar mapas de pantalla y prototipos verificables para: (1) Mis eventos vacío, lista, selección y creación; (2) configuración de evento post-creación; (3) consola admin búsqueda/detalle/casos; (4) responsive 320/768/1440, estados loading/error/partial/success y foco; (5) jerarquía de tarjetas, tabs, CTA y copy de Phoeve. Reutilizar tokens y componentes vigentes, no inventar otra app ni modo oscuro por el logo oscuro.

## Implementación por incrementos — propuesta sin tickets
| Bloque | Entrega incremental | Prioridad / dependencia |
|---|---|---|
| D1 | Auditoría de cobertura vs DOM, GET y componentes (sin tickets duplicados); guard API/admin | P0, primero |
| D2 | POST de borrador autenticado + OpenAPI + cliente generado + pruebas de autorización/idempotencia | P0, depende D1 |
| D3 | Formulario creación Angular + wiring dos CTAs + persistencia y navegación a configuración | P0, depende D2 |
| D4 | Reconciliar panel organizer/listado/detail con fuentes reales y UX estados | P0, consume D3/EL-EP-002 |
| D5 | Ruta y sesión real de admin + consola existente + navegación a detalle de eventos/casos | P0, tras verificación de identidad; paralelizable con D2 cuando owner lo permita |
| D6 | Resumenes/cards opcionales sin falsas métricas; adaptación visual Phoeve | P1, requiere fuentes autorizadas |
| D7 | Pruebas E2E role isolation, CSRF, fallos parciales y accesibilidad; review | P0, tras D3/D5 |

## Definition of Ready
- [x] Objetivo preliminar, actores y fronteras documentadas.
- [x] Brecha de creación UI constatada en `onCreateDraft()`.
- [x] Reutilización de EL-EP-002/009/012/018 y tickets existentes identificada.
- [ ] Producto confirma alcance exacto de las dos experiencias y resuelve Q-019-01..03.
- [ ] Architect comprueba ruta y sesión admin, contrato POST y riesgos de seguridad.
- [ ] Requirements Reviewer valida no duplicaciones, permisos, casos de error y aceptación.
- [ ] UI Designer entrega handoff y pasa gate UI.
- [ ] Dependencias y tickets candidatos auditados; no duplicar DONE.
- [ ] Se conserva legal/rebranding como gate de publicación separado.

**READY_FOR_TICKET_WRITING: NO.** Esta épica es un **borrador para revisión**, no una ampliación tácita de permisos ni una autorización para implementar.

## Priority
P0 para creación de borradores desde dashboard, ruta/autorización real, listado/detalle y uso seguro de consola existente. P1 para resúmenes visuales adicionales no necesarios para la primera gestión operativa.

## Change history
- 2026-10-13 — DRAFT generado a solicitud de crear una épica de visualización de paneles para organizador/administración y creación de eventos. Fuente: inspección estática de `stage` y contratos de EL-EP-002/009/012/018; no se ejecutaron pruebas, no se implementó código, no se asignaron tickets, no se alteraron DEC/TC/ARCH.
