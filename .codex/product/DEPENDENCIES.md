# EventLens — dependencias funcionales

**RECOMMENDED:** mapa de planificación. Una dependencia dura necesita contrato/resultado previo para completar la capacidad; no significa que todo diseño deba esperar. Las referencias entre módulos describen colaboración, pueden ser bidireccionales y no equivalen a dependencias de código. Los tickets vigentes de EL-EP-001 se registran en Tickets vigentes. **HISTÓRICO CONFIRMED:** EL-TK-001..004 fueron aprobados el 2026-10-07 y ahora están SUPERSEDED; EL-TK-005..019 los reemplazaron y quedaron READY en ese dictamen. **CONFIRMED — 2026-10-08:** el [dictamen final](sessions/2026-10-08-el-ep-001-ticket-remediation-review.md) aprobó los 19 activos EL-TK-005..019 y EL-TK-043..046, READY de requisitos; READY_FOR_IMPLEMENTATION: PARTIAL.

## Modules

| Desde | Hacia | Tipo | Razón |
|---|---|---|---|
| MOD-001 | MOD-009 | Funcional | Incorporar organizadores adultos invitados a BETA y proteger su cuenta. Consume contratos de los límites citados. |
| MOD-002 | MOD-001, MOD-006, MOD-009 | Funcional | Preparar, publicar y controlar disponibilidad temporal de un espacio privado. Consume contratos de los límites citados. |
| MOD-003 | MOD-002, MOD-006, MOD-008, MOD-009 | Funcional | Permitir aportes sin cuenta y conservar originales con procesamiento recuperable. Consume contratos de los límites citados. |
| MOD-004 | MOD-002, MOD-003, MOD-008, MOD-009 | Funcional | Compartir recuerdos autorizados y gestionar publicación, moderación y denuncias. Consume contratos de los límites citados. |
| MOD-005 | MOD-001, MOD-003, MOD-004, MOD-008, MOD-009 | Funcional | Entregar al organizador sus originales de forma individual o por paquetes. Consume contratos de los límites citados. |
| MOD-006 | MOD-001, MOD-009 | Funcional | Asignar condiciones BETA y aplicar límites/overrides sin alterar el plan base. Consume contratos de los límites citados. |
| MOD-007 | MOD-001, MOD-002, MOD-003, MOD-004, MOD-006, MOD-008, MOD-009 | Funcional | Permitir intervención operativa justificada y restringida sobre capacidades existentes. Consume contratos de los límites citados. |
| MOD-008 | MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, MOD-009 | Funcional | Aplicar consentimiento, retiro y eliminación sin conservar multimedia para auditoría. Consume contratos de los límites citados. |
| MOD-009 | MOD-001 a MOD-008 | Señales, no predecesora dura global | Auditoría, comunicación y métricas reciben hechos de cada dominio; construir contratos comunes desde el inicio evita ciclos de ejecución. |

## Epics

| Épica | Depende de | Tipo | Razón |
|---|---|---|---|
| EL-EP-001 | — | Base compartida | Un adulto invitado obtiene una cuenta verificada y conserva control seguro de sus sesiones. |
| EL-EP-002 | EL-EP-001 | Dura para completar resultado | El organizador prepara un evento privado y comprueba la experiencia de invitado antes de publicarlo. |
| EL-EP-003 | EL-EP-002, EL-EP-011 | Dura para completar resultado | El acceso y la recuperación de recuerdos siguen un ciclo temporal comprensible y controlado. |
| EL-EP-004 | EL-EP-003 | Dura para completar resultado | El invitado accede al evento autorizado y aporta con consentimiento trazable sin registrarse. |
| EL-EP-005 | EL-EP-004, EL-EP-011 | Dura para completar resultado | El invitado envía fotos/videos con progreso y recuperación por archivo sin perder el lote. |
| EL-EP-006 | EL-EP-005 | Dura para completar resultado | Los originales aceptados generan versiones web y fallos/amenazas quedan aislados sin pérdida. |
| EL-EP-007 | EL-EP-004, EL-EP-006 | Dura para completar resultado | Invitados y organizador visualizan recuerdos autorizados de forma sencilla desde navegador. |
| EL-EP-008 | EL-EP-006, EL-EP-007 | Dura para completar resultado | El organizador controla qué se publica y corrige eliminaciones normales durante siete días. |
| EL-EP-009 | EL-EP-004, EL-EP-007, EL-EP-014 | Dura para completar resultado | Personas afectadas reportan y reciben intervención proporcional sin registrarse. |
| EL-EP-010 | EL-EP-006, EL-EP-008, EL-EP-013 | Dura para completar resultado | El organizador recupera sus recuerdos originales sin depender de versiones optimizadas. |
| EL-EP-011 | EL-EP-001 | Dura para completar resultado | Cada evento tiene capacidad conocida y ampliable sin alterar las condiciones base del plan. |
| EL-EP-012 | EL-EP-001, EL-EP-014 | Dura para completar resultado | Administración diagnostica y ejecuta operaciones permitidas sin acceso indiscriminado a recuerdos. |
| EL-EP-013 | — | Base compartida | El organizador conoce hitos, riesgos y disponibilidad de descargas con correo y avisos útiles. |
| EL-EP-014 | — | Base compartida | Operación detecta fallos y reconstruye intervenciones sin registrar recuerdos ni datos innecesarios. |
| EL-EP-015 | EL-EP-001, EL-EP-003, EL-EP-008, EL-EP-010, EL-EP-013, EL-EP-014 | Dura para completar resultado | El usuario solicita borrar sin accidente y el sistema elimina contenido dentro de las ventanas definidas. |
| EL-EP-016 | EL-EP-014 | Dura para completar resultado | El producto decide continuar, corregir o avanzar según uso real, seguridad y recuperación de recuerdos. |
| EL-EP-017 | EL-EP-009, EL-EP-015 | Dura para completar resultado | La apertura pública en Colombia dispone de políticas revisadas y procedimientos operables. |

## Colaboraciones transversales

- EL-EP-013 y EL-EP-014 definen comunicaciones y auditoría desde el inicio; cada épica MVP los integra para completar su resultado. Son dependencias de calidad compartidas, no cadenas que obliguen a terminar todos los dominios antes de crear la base.
- EL-EP-012 expone intervenciones de EL-EP-003/004/006/008/009/011/015; cada acción requiere que el contrato de su épica propietaria esté cerrado. Una consola READY no habilita ejecutar políticas NOT_READY.
- EL-EP-007 consume revocación/control de visibilidad de EL-EP-004/008/009; EL-EP-010 respeta el retiro y eliminación de EL-EP-009/015.
- EL-EP-008 entrega purga de papelera coordinada con EL-EP-015 y consumo EL-EP-011; los bloqueantes se conservan en la épica propietaria.

## Puertas de avance

**CONFIRMED — 2026-10-08:** PL-001/002/011/012 respondidas en [DEC-077..080](DECISIONS.md). Dependencias y fases conservadas. PL-005..010 y PL-013/014 tienen respuestas registradas en DEC-085..092; PL-006 y precisiones posteriores respondidas en DEC-096..102; los requisitos y gates específicos de EL-EP-003/011 se registran en la [sesión de revisión](sessions/2026-10-08-vigencia-cuotas.md).

| Puerta | Requisitos | Estado |
|---|---|---|
| Generar tickets de una épica | READY de requisitos + validación de requirements_reviewer; contratos conocidos y gates aplicables de baseline/UI según [AGENTS.md](../../AGENTS.md#product-planning-workflow) | PENDING por épica |
| Operar BETA completa | EL-EP-001 a EL-EP-016 listas, verificadas e integradas; cerrar PL-001 a PL-014 | PENDING |
| Abrir al público | EL-EP-017/Q-029 cerradas; resultado beta evaluado; ajustes necesarios resueltos | PENDING; jurídico bloqueante de apertura pública |
| Comercializar con checkout | Discovery de precio/moneda/impuestos/pagos/reembolsos y condiciones; posterior aprobación | PENDING fase comercial |

## External dependencies

**HISTÓRICO — CR-002/DEC-061..064:** separación física DB/app superada para Beta por DEC-106/EL-TD-008: PostgreSQL16 y aplicación en mismo host, servicios/contenedores independientes; desarrollo dockerizado Compose/MinIO. API/worker/scheduler siguen independientes del monolito, JobQueue PostgreSQL; Redis no adoptado. Media Beta externa/storage definitivo DEFERRED. [Baseline vigente](../context/technical-baseline.md#el-td-008--local-environment-and-beta-topology). PITR producción obligatorio/RPO≤1h/RTO≤4h/backups completos diarios7d/restauraciones periódicas; media con redundancia/recuperación propias.

**CONFIRMED:** TC-001..004 RESOLVED/ACCEPTED (CR-002). **PENDING implementación/validación:** recursos/adapters/cola/scheduler y pruebas Beta; tooling/runtime multimedia adoptados ARCH-015, proveedores DEFERRED. `architect` concreta; PL funcionales y Q-029 público siguen pendientes.

## Tickets vigentes — EL-EP-001

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-005 | EL-TK-044 | EL-TK-006, EL-TK-007, EL-TK-010 |
| EL-TK-006 | EL-TK-005, EL-TK-044, EL-TK-046 | — |
| EL-TK-007 | EL-TK-005, EL-TK-044 | — |
| EL-TK-008 | — | EL-TK-009 |
| EL-TK-009 | EL-TK-008, EL-TK-044 | — |
| EL-TK-010 | EL-TK-005 | EL-TK-011 |
| EL-TK-011 | EL-TK-010, EL-TK-046 | EL-TK-012, EL-TK-013, EL-TK-018 |
| EL-TK-012 | EL-TK-011 | — |
| EL-TK-013 | EL-TK-011, EL-TK-046 | EL-TK-014, EL-TK-015, EL-TK-017, EL-TK-019, EL-TK-020 |
| EL-TK-014 | EL-TK-013, EL-TK-046 | EL-TK-016 |
| EL-TK-015 | EL-TK-013, EL-TK-046 | — |
| EL-TK-016 | EL-TK-014, EL-TK-046 | — |
| EL-TK-017 | EL-TK-013, EL-TK-046 | — |
| EL-TK-018 | EL-TK-011, EL-TK-046 | EL-TK-019 |
| EL-TK-019 | EL-TK-013, EL-TK-018, EL-TK-046 | — |
| EL-TK-043 | — | EL-TK-044 |
| EL-TK-044 | EL-TK-043, EL-TK-046 | EL-TK-005, EL-TK-006, EL-TK-007, EL-TK-009, EL-TK-025, EL-TK-041, EL-TK-042, EL-TK-045 |
| EL-TK-045 | EL-TK-044, EL-TK-046 | — |
| EL-TK-046 | contrato RecoveryAuthority acordado | EL-TK-006, EL-TK-011, EL-TK-013..019, EL-TK-044, EL-TK-045 |

Contratos EL-EP-013/014 mediante interfaces acordadas; sin dependencia dura de su implementación completa. El [quality gate aprobado de 2026-10-07](sessions/2026-10-07-el-ep-001-ticket-redesign-review.md) es histórico. Los 19 tickets vigentes remediados están READY de requisitos tras el [dictamen final de 2026-10-08](sessions/2026-10-08-el-ep-001-ticket-remediation-review.md); implementación PARTIAL, con gates técnicos y frontend conservados.

## Tickets vigentes — EL-EP-002 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-020 | EL-TK-013 | EL-TK-021, EL-TK-022, EL-TK-023, EL-TK-024, EL-TK-025, EL-TK-027, EL-TK-028, EL-TK-029, EL-TK-030, EL-TK-031, EL-TK-047, EL-TK-049, EL-TK-051 |
| EL-TK-021 | EL-TK-020 | — |
| EL-TK-022 | EL-TK-020 | — |
| EL-TK-023 | EL-TK-020 | EL-TK-024, EL-TK-025 |
| EL-TK-024 | EL-TK-020, EL-TK-023 | — |
| EL-TK-025 | EL-TK-020, EL-TK-023, EL-TK-044 | — |
| EL-TK-027 | EL-TK-020 | — |
| EL-TK-028 | EL-TK-020 | — |
| EL-TK-029 | EL-TK-020 | — |
| EL-TK-030 | EL-TK-020 | — |
| EL-TK-031 | EL-TK-020 | — |
| EL-TK-047 | EL-TK-020 | EL-TK-048 |
| EL-TK-048 | EL-TK-047 | — |
| EL-TK-049 | EL-TK-020 | EL-TK-050 |
| EL-TK-050 | EL-TK-049 | EL-TK-051 |
| EL-TK-051 | EL-TK-020, EL-TK-050 | EL-TK-052 |
| EL-TK-052 | EL-TK-051 | — |

17 activos READY de requisitos; REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: PARTIAL: 16 YES para su alcance contractual propio neutral,025 NO por contrato técnico administrativo044 PENDING. [Dictamen final](sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). 026 permanece SUPERSEDED histórico, sin predecesora vigente; su flujo se sustituye por 049 → 050 → 051 → 052. Las referencias históricas ajenas a 026 no se reescriben. [Remediación](sessions/2026-10-08-el-ep-002-ticket-remediation.md).

La [aprobación final de 2026-10-07](sessions/2026-10-07-el-ep-002-ticket-final-review.md) es histórica. EL-TK-025 consume identidad administrativa044 y grant MOD-007; gate técnico administrativo PENDING conservado. EL-TK-023/024/025 consumen RecalculateSchedule EL-EP-003 por contrato, sin mover cálculo/transiciones a002. EL-TK-027 integra RecoveryAuthority de MOD-002 por puerto; EL-TK-046 sólo pertenece a MOD-001 y no es su implementación.

EL-TK-048 compone navegación frontend compartida. Los formularios existentes consumen su superficie durante ejecución frontend; esta integración no añade una predecesora artificial al backend aislado ni un ciclo020 ↔ 048. 031 usa EventSnapshot y assets opcionales por contrato sin requerir ejecutar reemplazos para preview sin portada.

## Tickets propuestos — EL-EP-003 (DRAFT; pendiente requirements_reviewer)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-062 | EL-TK-023; contrato vigencia EL-EP-011 | 063,064,067,069,070 |
| EL-TK-063 | 020,023,062 | 064,071 |
| EL-TK-064 | 063,062,055 | 065,067,071,072 |
| EL-TK-065 | 064 | 066,067,071,072 |
| EL-TK-066 | 065,062 | 071,072 |
| EL-TK-067 | 062,064,065,055; contrato EL-EP-015 | 069,071,072 |
| EL-TK-068 | 044 | 069,071,072 |
| EL-TK-069 | 062,067,068,044 | 071,072 |
| EL-TK-070 | 062; contrato ampliaciones EL-EP-011 | 071,072 |
| EL-TK-071 | 063..070 | 072,073 |
| EL-TK-072 | 064,065,067,068,069,071 | consumidores guest/upload/gallery/export |
| EL-TK-073 | 071,072 | integración UX downstream |

EL-TK-062..073 son una descomposición DRAFT del resultado de EL-EP-003. No se consideran READY hasta dictamen de requirements_reviewer. Los contratos de EL-EP-011 y EL-EP-015 se consumen por interfaz y no se reinterpretan dentro de lifecycle.

## Tickets propuestos — EL-EP-004 (DRAFT; pendiente requirements_reviewer)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-074 | 020,072 | 075,081,082,083 |
| EL-TK-075 | 027,074 | 076,077,078,082,083 |
| EL-TK-076 | 075 | primera carga EL-EP-005; 083 |
| EL-TK-077 | 075 | integración carga EL-EP-005; 078,083 |
| EL-TK-078 | 075,077,072 | 082,083; retiro propio EL-EP-009 |
| EL-TK-079 | 027,075 | 083 |
| EL-TK-080 | 074,075 | 081,083 |
| EL-TK-081 | 074,080 | 083 |
| EL-TK-082 | 074,075; contrato EL-EP-009 | 083 |
| EL-TK-083 | 074..082 | integración UI downstream |

EL-TK-074..083 son una descomposición DRAFT del resultado de EL-EP-004. No se consideran READY hasta dictamen de requirements_reviewer. La resolución de solicitudes de retiro permanece en EL-EP-009 y la carga de archivos en EL-EP-005; esta épica sólo entrega acceso, sesión, consentimiento, identidad guest y superficies propias.

## Tickets vigentes — EL-EP-006 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-032 (DONE) | Contrato de carga aceptada de EL-EP-005 | EL-TK-033, EL-TK-038, EL-TK-041 |
| EL-TK-033 (DONE) | EL-TK-032, EL-TK-056 | EL-TK-034, EL-TK-035, EL-TK-036, EL-TK-039, EL-TK-040 |
| EL-TK-034 (DONE) | EL-TK-033 | EL-TK-041, EL-TK-042 |
| EL-TK-035 (DONE) | EL-TK-033 | EL-TK-037 |
| EL-TK-036 | EL-TK-033 | EL-TK-037 |
| EL-TK-037 | EL-TK-035, EL-TK-036 | EL-TK-057; consumidores EL-EP-007 |
| EL-TK-038 | EL-TK-032, EL-TK-055 | EL-TK-039, EL-TK-041, EL-TK-058 |
| EL-TK-039 | EL-TK-033, EL-TK-038 | EL-TK-040; elegibilidad EL-EP-010 |
| EL-TK-040 | EL-TK-033, EL-TK-039 | EL-TK-054 |
| EL-TK-041 | EL-TK-032, EL-TK-034, EL-TK-038, EL-TK-044 | — |
| EL-TK-042 | EL-TK-034, EL-TK-044 | — |
| EL-TK-053 | ninguna | EL-TK-054 |
| EL-TK-054 | EL-TK-040, EL-TK-053 | — |
| EL-TK-055 (DONE) | ninguna | EL-TK-038, EL-TK-056 |
| EL-TK-056 (DONE) | EL-TK-055, EL-TK-061 | EL-TK-033 |
| EL-TK-057 | EL-TK-037 | EL-TK-058 |
| EL-TK-058 | EL-TK-038, EL-TK-057 | — |

17 READY de requisitos;034/039 VALID KEEP sin modificación. REQUIREMENTS_READY:YES; READY_FOR_IMPLEMENTATION:PARTIAL (10 YES/7 NO técnicos localizados). [Dictamen final](sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). [Remediación autorizada](sessions/2026-10-08-el-ep-006-ticket-remediation.md). [Dictamen2026-10-07](sessions/2026-10-07-el-ep-006-ticket-review.md) histórico; nuevo gate APPROVED.

055 capacidad de lease independiente del handler038;032 consume publish por contrato sin depender de055 claim.033 depende056, que consume055.057 consume refs activas de037 y puertos inventory/executor/lease/storage/retención acordados; no exige éxito de cada intento para limpiar su output. Primitives compartidas con052 no cambian su handler cover ni agregan predecesora de toda épica015.054 integra host biblioteca007 por contrato, no implementa biblioteca nueva ni requiere toda épica007.

041/042 consumen044 para administración humana y grant MOD-007; automatización autorizada separada no exige cookie044.046 es sólo integración MOD-001, no autoridad de MOD-003.037 aplica DEC-087/PL-007 ANSWERED por MediaGovernance dueño008, sin publicación contra barreras. Portada026 SUPERSEDED se referencia vía049..052/050 con pipeline033/035 compartido; otras referencias históricas fuera006 no se reescriben.

## Paquete técnico TB-01..05 — APPROVED (historia de creación; resultado vigente abajo)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-059 | — | EL-TK-060, EL-TK-061 |
| EL-TK-060 | EL-TK-059 | EL-TK-061 sólo tras PASS explícito |
| EL-TK-061 | EL-TK-059, EL-TK-060 | EL-TK-056 sólo tras PASS y handoff técnico evaluado |

059 entrega únicamente REQUIRED_FOR_SPIKES mínimo. No depende de056/adapters/APIworker ni055 productivo.060 puede concluir FAIL evidenciado;061 requiere060 PASS y059 capacidades efectivas, no sólo status completado.061 precede056 y adapters033/035/036 por dependencias existentes; integración058 continúa tras pipeline/cleanup reales y fase REQUIRED_FOR_INTEGRATION disponible. No ciclo enabler→producción→enabler.

044 conserva043/046 y agrega bloqueos inversos041/042 ya consumidores humanos; TB-03 contrato APPROVED no equivale a auth implementada. Scopes preparatorios/BLOCKED_SCOPE/BLOCKED_BY de los ocho targets están en tickets; dictámenes anteriores históricos para esos scopes;[dictamen final](sessions/2026-10-08-technical-blockers-ticket-review.md) APPROVED:11 READY de requisitos, implementación PARTIAL con044/059YES yotros9NO full. [Paquete](sessions/2026-10-08-technical-blockers-ticket-integration.md), [fuente](sessions/2026-10-08-technical-blockers-approved-contracts.md). Fases INTEGRATION/BETA no son predecesoras del primer incremento/spikes. Sin cambios a055,043,045,046 o cualquier owner ajeno.

## Historial de dependencias

EL-TK-001..004 están SUPERSEDED y no son predecesoras de ejecución. Su grafo histórico se conserva en sus archivos y en el dictamen anterior. Sustitución: 001 → 005..009; 002 → 010..012; 003 → 013..017; 004 → 018..019.

**Gate UI actual - 2026-10-08:** [matriz vigente](../context/ui-mvp-epic-review.md), [gate intake](sessions/2026-10-08-removal-intake.md). Todas16 MVP READY de requisitos; 15 UI requeridas UX READY,016 NOT_REQUIRED. PL-024..026 respondidas DEC-103..105. Frontend001015 PARTIAL tecnico localizado. EL-EP-017 juridico publico pendiente. Sin tickets/codigo.

## Dependencias/readiness tras ARCH-015 — 2026-10-09 (HISTÓRICO pre-implementación de EL-TK-033)

[Dictamen por ticket](sessions/2026-10-09-arch-015-backlog-impact.md) distingue construcción propia por contrato de ejecución integrada.059DONE →060PASS →061PASS →ARCH-015 ACCEPTED_SIMPLIFIED satisface experimentos/adopción; no implementa055/056/adapters. La recomendación de ejecutar056 en ese dictamen era vigente antes de su implementación; véase su estado DONE actual abajo.

Cadena productiva:055 DONE →056 →033;032 →033;033 →035/036 →037 →057 →058;032/055 →038 →058.041 consume032/034/038 y044;042 consume034/044.044 conserva043/046.060/061 no requieren pipeline productivo, sin ciclo enabler→producción→enabler. En la fecha del dictamen, EL-TK-056 era la siguiente capacidad P0 habilitada por sus dependencias satisfechas.

**CONFIRMED — EL-TK-032 DONE, 2026-10-09:** quedan satisfechos los nodos 032 y 056 para la cadena hacia 033. Las aristas funcionales no cambian: 033 sigue dependiendo también de 032 y 056; 038 y 041 consumen el trabajo de 032 además de sus otras dependencias. La finalización no cambia automáticamente readiness de downstream ni cierra gates operativos.

**CONFIRMED — EL-TK-033 DONE, 2026-10-09 hora local:** dependencias EL-TK-032/056 satisfechas; evidencia independiente 46/46 PASS y regresiones 055/056 PASS en el [cierre del ticket](tickets/EL-TK-033.md#cierre-de-implementación--2026-10-09-hora-local). No cambian las aristas downstream ni su readiness por inferencia; cada ticket conserva sus propios requisitos y predecesoras.

**CONFIRMED — EL-TK-034 DONE, 2026-10-10:** EL-TK-033→034 queda satisfecha. Las aristas 034→041/042 se conservan; completar 034 no satisface sus otras predecesoras ni cambia automáticamente su readiness. Véase el [cierre y evidencia](tickets/EL-TK-034.md).

**CONFIRMED — EL-TK-035 DONE, 2026-10-10:** EL-TK-033→035 queda satisfecha. La arista 035→037 se conserva como dependencia satisfecha; EL-TK-037 aún espera EL-TK-036. Esta finalización no cambia el readiness de EL-TK-036/037 ni otras aristas. Véase el [cierre y evidencia](tickets/EL-TK-035.md).

Portada:049 →050 →051 →052 conserva cadena funcional.050 consume contratos/adapters033/035/056/055 para integración real, no toda implementación guest ni pipeline duplicado.052 y057 comparten inventory/drain, no dependen bidireccionalmente.031 permite portada opcional; no exige procesamiento para preview sin portada. Son colaboraciones/precondiciones de integración explícitas, no nuevas predecesoras duras para construir handlers por puertos.

TB-01/TB-02 dejan de bloquear.033/035/036/041/042/056 YES propio;058 NO ejecución integrada hasta pipeline/adapters y fase REQUIRED_FOR_INTEGRATION reales, con preparación habilitada.055 y056 están DONE. EL-TK-032 también está DONE; 033 tiene satisfechas sus dependencias 032/056, sujeto a verificar su readiness vigente. MEDIA-001/CAP-001/DR-001/EXPORT-001 VALIDATION_REQUIRED; no PASS ni proveedor nuevo. Las afirmaciones previas de paquete/spikes pendientes son históricas respecto a esta reevaluación. Véanse el [cierre de EL-TK-056](sessions/2026-10-09-el-tk-056-implementation.md) y la [sesión de EL-TK-032](sessions/2026-10-09-el-tk-032-implementation.md).
