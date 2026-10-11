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
| EL-TK-005 (DONE) | EL-TK-044 | EL-TK-006, EL-TK-007, EL-TK-010 |
| EL-TK-006 | EL-TK-005, EL-TK-044, EL-TK-046 | — |
| EL-TK-007 | EL-TK-005, EL-TK-044 | — |
| EL-TK-008 | — | EL-TK-009 |
| EL-TK-009 | EL-TK-008, EL-TK-044 | — |
| EL-TK-010 (DONE) | EL-TK-005 | EL-TK-011 |
| EL-TK-011 (DONE) | EL-TK-010, EL-TK-046 | EL-TK-012, EL-TK-013, EL-TK-018 |
| EL-TK-012 | EL-TK-011 | — |
| EL-TK-013 (DONE) | EL-TK-011, EL-TK-046 | EL-TK-014, EL-TK-015, EL-TK-017, EL-TK-019, EL-TK-020 |
| EL-TK-014 | EL-TK-013, EL-TK-046 | EL-TK-016 |
| EL-TK-015 | EL-TK-013, EL-TK-046 | — |
| EL-TK-016 | EL-TK-014, EL-TK-046 | — |
| EL-TK-017 | EL-TK-013, EL-TK-046 | — |
| EL-TK-018 | EL-TK-011, EL-TK-046 | EL-TK-019 |
| EL-TK-019 | EL-TK-013, EL-TK-018, EL-TK-046 | — |
| EL-TK-043 (DONE) | — | EL-TK-044 |
| EL-TK-044 (DONE) | EL-TK-043, EL-TK-046 | EL-TK-005, EL-TK-006, EL-TK-007, EL-TK-009, EL-TK-025, EL-TK-041, EL-TK-042, EL-TK-045 |
| EL-TK-045 | EL-TK-044, EL-TK-046 | — |
| EL-TK-046 (DONE) | contrato RecoveryAuthority acordado | EL-TK-006, EL-TK-011, EL-TK-013..019, EL-TK-044, EL-TK-045 |

Contratos EL-EP-013/014 mediante interfaces acordadas; sin dependencia dura de su implementación completa. El [quality gate aprobado de 2026-10-07](sessions/2026-10-07-el-ep-001-ticket-redesign-review.md) es histórico. Los 19 tickets vigentes remediados están READY de requisitos tras el [dictamen final de 2026-10-08](sessions/2026-10-08-el-ep-001-ticket-remediation-review.md); implementación PARTIAL, con gates técnicos y frontend conservados.

## Tickets vigentes — EL-EP-002 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-020 (DONE) | EL-TK-013 | EL-TK-021, EL-TK-022, EL-TK-023, EL-TK-024, EL-TK-025, EL-TK-027, EL-TK-028, EL-TK-029, EL-TK-030, EL-TK-031, EL-TK-047, EL-TK-049, EL-TK-051 |
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

## Tickets vigentes — EL-EP-003 (quality gate APPROVED)

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

12 activos READY de requisitos tras [dictamen de 2026-10-10](sessions/2026-10-10-el-ep-003-ticket-review.md); REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: PARTIAL (sujeto a contratos técnicos y dependencias de EL-EP-011/015 y auth administrativa EL-TK-044). Los contratos de EL-EP-011 y EL-EP-015 se consumen por interfaz y no se reinterpretan dentro de lifecycle.

## Tickets vigentes — EL-EP-004 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-074 | 020, 072, 084 | 075, 081, 082, 083 |
| EL-TK-075 | 027, 074 | 076, 077, 078, 083 |
| EL-TK-076 | 075 | primera carga EL-EP-005; 083 |
| EL-TK-077 | 075 | integración carga EL-EP-005; 083 |
| EL-TK-078 | 075, 072 | 083; retiro propio EL-EP-009 |
| EL-TK-079 | 027, 075 | 085 |
| EL-TK-080 | 074, 075 | 081, 085 |
| EL-TK-081 | 074, 084 | 085 |
| EL-TK-082 | 074; contrato EL-EP-009 | 083 |
| EL-TK-083 | 074..078, 082 | integración UI guest downstream |
| EL-TK-084 | 020, 027 | 074, 081, 085 |
| EL-TK-085 | 079, 080, 081, 084 | integración UI organizador downstream |

12 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de acceso guest, consentimiento, identidad, emisión inicial y superficies UI aprobadas en ui-mvp-epic-review.md#el-ep-004. La resolución de solicitudes de retiro permanece en EL-EP-009 y la carga de archivos en EL-EP-005; esta épica sólo entrega acceso, sesión, consentimiento, identidad guest y superficies de gestión y participación.

## Tickets vigentes — EL-EP-005 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-086 | 075, 076, 077, 072; contrato EL-EP-011 | 087, 090, 091, 092, 093, 094, 095 |
| EL-TK-087 | 086 | 088, 091, 094, 095 |
| EL-TK-088 | 087 | 089, 090, 092, 094, 095 |
| EL-TK-089 | 088; contrato EL-EP-011 | 090, 092, 094, 095 |
| EL-TK-090 | 089 | 092, 094, 095; emite contrato downstream consumido por 032 (DONE) |
| EL-TK-091 | 086, 087 | 094, 095 |
| EL-TK-092 | 086, 088, 072, 075 | 093, 094, 095 |
| EL-TK-093 | 086, 088, 089, 090, 092 | 094, 095 |
| EL-TK-094 | 086..093 | 095; integración UI downstream |
| EL-TK-095 | 086..094 | validación integrada de EL-EP-005 |

10 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: PARTIAL a nivel de épica (EL-TK-089 conserva gate técnico localizado para inspección segura de archivos no confiables antes de su aceptación en el pipeline). EL-TK-086 depende de la identidad guest (EL-TK-077) además de consentimiento y lifecycle. EL-TK-090 produce el contrato de original aceptado que consume EL-TK-032 (DONE) sin duplicar procesamiento de EL-EP-006.

## Tickets vigentes — EL-EP-007 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-096 | 074, 075, 072; EL-TK-037 | 099, 101, 102 |
| EL-TK-097 | 072, 074, 035, 037 | 099, 101, 102 |
| EL-TK-098 | 047, 053 | 100, 102 |
| EL-TK-099 | 096, 097, 101 | 102; UI guest downstream |
| EL-TK-100 | 098, 053, 054 | 102; UI owner downstream |
| EL-TK-101 | 096, 097, 072, 074 | 099, 102 |
| EL-TK-102 | 096..101 | validación integrada de EL-EP-007 |

7 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de galería guest PUBLISHED, grants temporales de derivados (DEC-063), biblioteca de media para el organizador, revalidación server-side y superficies UI aprobadas en ui-mvp-epic-review.md#el-ep-007. Se corrigió el ciclo 099 ↔ 101 (099 consume 101; 099 solo bloquea 102), se desacopló MediaViewGrant (097) de la consulta de galería guest (096) permitiendo su consumo compartido, y se eliminaron bloqueos asimétricos hacia 101. Moderación, retiro y descargas conservan ownership en EL-EP-008, EL-EP-009 y EL-EP-010 respectivamente.

## Tickets vigentes — EL-EP-008 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-103 | 098,037 | 111,112 |
| EL-TK-104 | 098 | 107,111,112 |
| EL-TK-105 | 098,101 | 106,107,111,112 |
| EL-TK-106 | 105,101 | 111,112 |
| EL-TK-107 | 098,053; contrato EL-EP-006 | 108,109,111,112 |
| EL-TK-108 | 107 | 111,112 |
| EL-TK-109 | 107,055; contrato EL-EP-015 | 112; consumidor purge EL-EP-015 |
| EL-TK-110 | 028,037 | 111,112 |
| EL-TK-111 | 100,103..108,110 | 112 |
| EL-TK-112 | 103..111 | validación EL-EP-008 |

10 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de moderación cotidiana, papelera de 7 días (DEC-096), restauración fiel a previous_state (DEC-086), entrega a purga al vencer (contrato EL-EP-015), cambio de modo de moderación sin impacto retroactivo (DEC-087) e integración en OrganizerMediaLibrary. Superficies UI reutilizadas del catálogo canónico (§8.5..9), sin componentes nuevos. Seguridad/cuarentena en EL-EP-006 y purga física en EL-EP-015.

## Tickets vigentes — EL-EP-009 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-113 | contrato media visible EL-EP-007; contrato EL-EP-014 | 116,120,121,123 |
| EL-TK-114 | 078; contrato EL-EP-015 | 121,123 |
| EL-TK-115 | 082 | 116,120,121,123 |
| EL-TK-116 | 113,115,044; contrato EL-EP-014 | 117,118,119,120,122,123 |
| EL-TK-117 | 116,044,097; contrato EL-EP-014 | 118,119,122,123 |
| EL-TK-118 | 116,117,101 | 119,122,123 |
| EL-TK-119 | 116,117; contratos EL-EP-013/014/015 | 122,123 |
| EL-TK-120 | 113,115,116 | 122,123 |
| EL-TK-121 | 099,113,114,115 | 123 |
| EL-TK-122 | 116..120; contrato EL-EP-012 | 123 |
| EL-TK-123 | 113..122 | validación EL-EP-009 |

11 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de reportes (sin auto-ocultamiento, DEC-088), retiro propio inmediato e irreversible con sesión guest (DEC-089, DEC-097), intake sin sesión con campos mínimos requeridos (DEC-103..105), clasificación de severidad y prioridad, acceso administrativo justificado a media de casos, ocultamiento preventivo administrativo y resolución formal con trazabilidad. Superficies UI reutilizadas del catálogo canónico (§5.26..27 y §12.11..15), sin componentes nuevos. Purga en EL-EP-015, auditoría en EL-EP-014 y consola administrativa en EL-EP-012.

## Tickets vigentes — EL-EP-010 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-124 | 098,053; contrato EL-EP-006 | 132,133 |
| EL-TK-125 | 098; contrato EL-EP-008 | 126,128,131,132,133 |
| EL-TK-126 | 125,055 | 127,128,130,131,132,133 |
| EL-TK-127 | 126 | 129,131,132,133; avisos EL-EP-013 |
| EL-TK-128 | 125,126; contratos EL-EP-008/009/015 | 129,131,132,133 |
| EL-TK-129 | 127,128 | 132,133 |
| EL-TK-130 | 126,127,128 | 131,132,133 |
| EL-TK-131 | 125..130 | 132,133 |
| EL-TK-132 | 100,124..131 | 133 |
| EL-TK-133 | 124..132 | validación EL-EP-010 |

10 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de descarga individual de original seguro para organizador (DEC-009/013/075), exportación asíncrona multipartes con snapshot fijo (DEC-046..049/079/090), disponibilidad 48h, invalidación inmediata ante retiros de privacidad o revocación de acceso (DEC-090), grants temporales de partes, regeneración/retry autorizado y consulta de estado/partes/progreso real en OrganizerMediaLibrary. Superficies UI reutilizadas del catálogo canónico (§9.1..8), sin centros de exportación paralelos ni componentes nuevos. Descargas guest siguen fuera de alcance.

## Tickets vigentes — EL-EP-011 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-134 | contrato EL-EP-001 | 135,136,139,141,142,143,144,145 |
| EL-TK-135 | 134, 136, 137 | 138,139,143,144,145 |
| EL-TK-136 | 134 | contrato upload 086/092; 137,145 |
| EL-TK-137 | 136; contratos EL-EP-005/015 | 135,138,145 |
| EL-TK-138 | 135,137 | consumidor EL-EP-013; 145 |
| EL-TK-139 | 134,135 | 140,141,143,144,145 |
| EL-TK-140 | 139 | 141,143,144,145 |
| EL-TK-141 | 139,044 | 142,144,145 |
| EL-TK-142 | 134,141; contrato EL-EP-003 | 144,145 |
| EL-TK-143 | 135,139,140 | 145 |
| EL-TK-144 | 141,142; contrato EL-EP-012 | 145 |
| EL-TK-145 | 134..144 | validación EL-EP-011 |

12 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de plan BETA base y límites efectivos, consulta de consumo comercial y reservas separadas de storage operacional (DEC-079), reserva y liberación atómica de cuota (DEC-080), consolidación de consumo en aceptación/purga física, emisión de señales deduplicadas al 80% y 100%, solicitud de ampliación (DEC-093..095/100..102), respuesta en misma solicitud, revisión administrativa con motivo, aplicación de overrides/retorno al plan base con denegación de vencimiento pasado y superficies UI de organizador y consola administrativa. Superficies UI reutilizadas del catálogo canónico (ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011), sin componentes nuevos. Carga en EL-EP-005, lifecycle en EL-EP-003 y notificaciones en EL-EP-013.

## Tickets vigentes — EL-EP-012 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-146 | 044; contrato EL-EP-002 | 147,154,155 |
| EL-TK-147 | 146; contratos propietarios | 148,150,151,152,153,154,155 |
| EL-TK-148 | 147; contrato JobQueue | 149,153,154,155 |
| EL-TK-149 | 148,044; contrato JobQueue | 153,154,155 |
| EL-TK-150 | 147, 044, contrato MediaViewGrant (097); contrato EL-EP-014 | 154,155 |
| EL-TK-151 | 147; contratos propietarios | 154,155 |
| EL-TK-152 | 147; contratos EL-EP-001/009/011 | 154,155 |
| EL-TK-153 | 148,149 | 154,155 |
| EL-TK-154 | 146,147,150..153 | 155 |
| EL-TK-155 | 146..154 | validación EL-EP-012 |

10 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de búsqueda administrativa sanitizada sin preview multimedia, detalle agregado con estado parcial explícito, consulta y diagnóstico de jobs con errores técnicos sanitizados (DEC-061..064), comandos autorizados sobre jobs (retry/cancel/marcar no repetir), acceso multimedia administrativo condicionado a razón operativa registrada (DEC-019/020), orquestación de intervenciones mediante delegación a contratos propietarios sin bypass de reglas de dominio, y superficies UI unificadas en consola administrativa. Superficies UI reutilizadas del catálogo canónico (ui-mvp-epic-review.md §EL-EP-012), sin consola paralela ni componentes nuevos. Políticas conservan ownership en sus módulos propietarios.

## Tickets vigentes — EL-EP-013 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-156 (DONE) | hechos de dominios propietarios | 157..165 |
| EL-TK-157 (DONE) | 156, 055; contrato JobQueue (DEC-064) | 164,165 |
| EL-TK-158 (DONE) | 156 | 164,165 |
| EL-TK-159 | 156; contratos EL-EP-003/015 | 164,165 |
| EL-TK-160 | 156; contrato 138 | 164,165 |
| EL-TK-161 | 156; contrato EL-EP-010 | 164,165 |
| EL-TK-162 | 156; hechos de dominio EL-EP-001/003 | 164,165 |
| EL-TK-163 | 156; hechos de dominio EL-EP-009; contrato EL-EP-014 | 164,165 |
| EL-TK-164 | 157..163 | 165 |
| EL-TK-165 | 156..164 | validación EL-EP-013 |

10 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de persistencia de NotificationIntent idempotente a partir de hechos de dominio confirmados, procesamiento asíncrono de correos con puerto desacoplado mediante JobQueue durable (DEC-021, DEC-061..064), proyección de avisos contextuales vigentes para el panel del organizador sin duplicados ni avisos obsoletos, generación de avisos de lifecycle/gracia/eliminación próxima, capacidad al 80% y 100%, exportación disponible/expirada, cuenta/seguridad/cambios, denuncias e intervenciones según severidad, e integración UI de avisos y plantillas de correo accesibles. Superficies UI reutilizadas del catálogo canónico (ui-mvp-epic-review.md §EL-EP-013), sin NotificationCenter obligatorio ni nuevos componentes. Proveedor de correo desacoplado por puerto.

## Tickets vigentes — EL-EP-014 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-166 | ninguna predecesora funcional dura | 167,173,175,176,184 |
| EL-TK-167 | 166 | 175,176; consumidor EL-EP-012 |
| EL-TK-168 | ninguna predecesora funcional dura | 169,170,176,184; telemetría 177 |
| EL-TK-169 | 168; contrato JobQueue | 173,176 |
| EL-TK-170 | 168, 184 | 173,174,176 |
| EL-TK-171 | baseline EL-TD-008; DEC-062 | 172,174,176 |
| EL-TK-172 | 171; contrato EL-EP-015 | 174,176 |
| EL-TK-173 | 166,169,170 | 176 |
| EL-TK-174 | 170,171,172 | 176; evidencia Beta |
| EL-TK-175 | 167; contrato EL-EP-012 | 176 |
| EL-TK-176 | 166..175, 184 | EL-EP-016; validación EL-EP-014 |
| EL-TK-184 | 166, 168 | 170, 176 |

12 activos READY de requisitos tras dictamen de requirements_reviewer y ui_designer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES para el alcance propio de auditoría mínima y sanitizada, consulta paginada con filtros, telemetría y health neutrales de proveedor, detección de colas/jobs degradados, alertas de infraestructura y disponibilidad agregada, backups PostgreSQL diarios con PITR (RPO≤1h/RTO≤4h), verificación de restore periódico con preservación de tombstones, redundancia/recuperación de ObjectStorage (DEC-062/063), incidentes operacionales, retención de auditoría (12m) y rotación de logs (30d) en EL-TK-184, visor contextual de auditoría en consola administrativa (AuditLogViewer/Detail, UI_REQUIRED: YES, READY_FOR_FRONTEND_PLANNING: YES) y validación integrada E2E. Superficies UI reutilizadas del catálogo canónico (ui-mvp-epic-review.md#el-ep-014), sin dashboard operacional nuevo ni nuevos componentes. Proveedores de observabilidad y storage definitivo permanecen DEFERRED bajo gate operacional DR-001.

## EL-EP-015 — no ticketizado en este PR

READY de requisitos, pero READY_FOR_TICKET_WRITING: PARTIAL y READY_FOR_IMPLEMENTATION: PARTIAL. No se generan tickets hasta cerrar el gate técnico de reautenticación/UI sensible. La eliminación ordinaria backend puede planificarse después sin habilitar LEGAL_OR_SECURITY_HOLD pendiente jurídico.

## Tickets vigentes — EL-EP-016 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-177 | contratos de dominios propietarios; telemetría EL-TK-168 | 178..183 |
| EL-TK-178 | 177; contratos EL-EP-005/006 | 182,183 |
| EL-TK-179 | 177; contratos EL-EP-010/012, EL-TK-173 | 182,183 |
| EL-TK-180 | 177; contrato EL-EP-004 | 182,183 |
| EL-TK-181 | 177 | 182,183 |
| EL-TK-182 | 178..181; evidencia operacional EL-EP-014 (EL-TK-174, EL-TK-176) | 183 |
| EL-TK-183 | 177..182 | decisión operativa posterior a Beta |

7 activos READY de requisitos tras dictamen de requirements_reviewer de 2026-10-10; REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: YES (UI_REQUIRED: NO, UX_READINESS: NOT_REQUIRED conforme a ui-mvp-epic-review.md#el-ep-016) para el contrato de métricas agregadas y minimizadas de la Beta desacoplado a telemetría EL-TK-168, confiabilidad de cargas y procesamiento multimedia (cargas válidas ≥95%, fotos ≥98%, video ≥95%, latencias p95), soporte funcional clasificado (`category: FUNCTIONAL`) y descargas de recuerdos, participación indicativa, ventana 8..12 semanas / volumen mínimo con discriminador determinista de cohorte (`cohort_inclusion`), congelación de snapshot inmutable y clasificación con prevalencia absoluta de incidentes críticos en EL-TK-182, e informe final reproducible en EL-TK-183 basado en dicho snapshot inmutable. Inicio Beta y responsable formal permanecen datos operativos de ejecución, no blockers funcionales.

## EL-EP-017 — no ticketizado

NOT_READY. Q-029 y revisión jurídica profesional siguen siendo blocker explícito; no se generan tickets de implementación ni se inventan políticas legales.

## Tickets vigentes — EL-EP-006 (quality gate APPROVED)

| Ticket | Depende de | Bloquea |
|---|---|---|
| EL-TK-032 (DONE) | Contrato de carga aceptada de EL-EP-005 | EL-TK-033, EL-TK-038, EL-TK-041 |
| EL-TK-033 (DONE) | EL-TK-032, EL-TK-056 | EL-TK-034, EL-TK-035, EL-TK-036, EL-TK-039, EL-TK-040 |
| EL-TK-034 (DONE) | EL-TK-033 | EL-TK-041, EL-TK-042 |
| EL-TK-035 (DONE) | EL-TK-033 | EL-TK-037 |
| EL-TK-036 (DONE) | EL-TK-033 | EL-TK-037 |
| EL-TK-037 (DONE) | EL-TK-035, EL-TK-036 | EL-TK-057; consumidores EL-EP-007 |
| EL-TK-038 (DONE) | EL-TK-032, EL-TK-055 | EL-TK-039, EL-TK-041, EL-TK-058 |
| EL-TK-039 (DONE) | EL-TK-033, EL-TK-038 | EL-TK-040; elegibilidad EL-EP-010 |
| EL-TK-040 (DONE) | EL-TK-033, EL-TK-039 | EL-TK-054 |
| EL-TK-041 (DONE) | EL-TK-032, EL-TK-034, EL-TK-038, EL-TK-044 | — |
| EL-TK-042 (DONE) | EL-TK-034, EL-TK-044 | — |
| EL-TK-053 (DONE) | ninguna | EL-TK-054 |
| EL-TK-054 (DONE) | EL-TK-040, EL-TK-053 | — |
| EL-TK-055 (DONE) | ninguna | EL-TK-038, EL-TK-056 |
| EL-TK-056 (DONE) | EL-TK-055, EL-TK-061 | EL-TK-033 |
| EL-TK-057 (DONE) | EL-TK-037 | EL-TK-058 |
| EL-TK-058 (DONE) | EL-TK-038, EL-TK-057 | — |

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

**CONFIRMED — EL-TK-037 DONE, 2026-10-10:** dependencias 035 y 036 satisfechas; implementación de promoción atómica CAS aprobada por reviewer y tester independiente (63/63 enfocadas, 262/262 regresión combinada, 21/21 EL-TK-056). Quedan satisfechas las dependencias de EL-TK-057 y consumidores de galería de EL-EP-007. Véase el [cierre](tickets/EL-TK-037.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-037-successful-processing-final-validation).

**CONFIRMED — EL-TK-053 DONE, 2026-10-11:** consulta de estado y capacidades autorizadas implementada y verificada bajo Docker con PostgreSQL 16 (15/15 pruebas unitarias e integradas, 331/331 regresión total PASS). Satisface la consulta neutral y segura de estado requerida por EL-TK-054 y consumidores de galería/biblioteca sin fugar secretos, credenciales ni conceder descargas o reintentos indebidos. Véase el [cierre](tickets/EL-TK-053.md).

**CONFIRMED — EL-TK-054 DONE, 2026-10-11:** integración frontend de estados de fallo técnico, reintento y cuarentena en `@eventlens/web` (`OrganizerMediaCard`, `ProcessingFailedPanel`, `RetryProcessingAction`, `QuarantinedMediaState`, `DownloadOriginalAction`) verificada bajo Docker con suite Vitest de Angular 21 (9/9 passed), typecheck estricto y bundle de producción en 3.3s. Satisface la separación DEC-075/DEC-076 y precondiciones para la biblioteca de medios de EL-EP-007 ([EL-TK-100](tickets/EL-TK-100.md)). Véase el [cierre](tickets/EL-TK-054.md).

Portada:049 →050 →051 →052 conserva cadena funcional.050 consume contratos/adapters033/035/056/055 para integración real, no toda implementación guest ni pipeline duplicado.052 y057 comparten inventory/drain, no dependen bidireccionalmente.031 permite portada opcional; no exige procesamiento para preview sin portada. Son colaboraciones/precondiciones de integración explícitas, no nuevas predecesoras duras para construir handlers por puertos.



TB-01/TB-02 dejan de bloquear.033/035/036/041/042/056 YES propio;058 NO ejecución integrada hasta pipeline/adapters y fase REQUIRED_FOR_INTEGRATION reales, con preparación habilitada.055 y056 están DONE. EL-TK-032 también está DONE; 033 tiene satisfechas sus dependencias 032/056, sujeto a verificar su readiness vigente. MEDIA-001/CAP-001/DR-001/EXPORT-001 VALIDATION_REQUIRED; no PASS ni proveedor nuevo. Las afirmaciones previas de paquete/spikes pendientes son históricas respecto a esta reevaluación. Véanse el [cierre de EL-TK-056](sessions/2026-10-09-el-tk-056-implementation.md) y la [sesión de EL-TK-032](sessions/2026-10-09-el-tk-032-implementation.md).

**CONFIRMED — EL-TK-043 DONE, 2026-10-11:** provisión administrativa inicial y posterior gobernada por MOD-001 implementada en `@eventlens/identity`. Procedimiento de bootstrap único deshabilitado permanentemente tras su consumo, alta posterior autorizada, guardia de elevación pública y auditoría con cero secretos. Suite 18/18 PASS (12 unitarias y 6 de integración contra PostgreSQL 16 real). Véase el [cierre](tickets/EL-TK-043.md) y la [evidencia](../../infra/validation/identity/README.md).

**CONFIRMED — EL-TK-044 DONE, 2026-10-11:** autenticación de principal administrativo y ciclo de vida de sesiones implementado en `@eventlens/identity` conforme a TB-03, ARCH-013 y AQR-003. Verificación SHA-256 de secreto de 256 bits con separación de propósito/sujeto, comparación constante y dummy para desconocidos; salida neutral uniforme; emisión de token y cookie `__Host-el_admin_session` sin fixation; expiración 8h absoluta y 30m idle con toque monótono no extensible; reautenticación con rotación de token, invalidación del previo y `auth_time <= 5 min` para operaciones sensibles; emisión de `AdminActorContext` (`ADMIN_HUMAN`) sin grants de MOD-007 prefijados; integración con RecoveryAuthority (PREPARE → SQL → ACK). Suite total de identity 35/35 PASS (17 específicas de EL-TK-044: 13 unitarias y 4 de integración contra PostgreSQL 16 real). Véase el [cierre](tickets/EL-TK-044.md) y la [evidencia](../../infra/validation/identity/README.md).

**CONFIRMED — EL-TK-041 DONE, 2026-10-11:** dependencias 032, 034, 038 y 044 satisfechas; implementación de liberación de cuarentena por actor autorizado aprobada por reviewer y tester independiente en `@eventlens/media-inspection` (`QuarantineReleaseService`) con migración `202610110017_quarantine_release` (19/19 pruebas enfocadas PASS: 13 unitarias y 6 de integración contra PostgreSQL 16 real; 0 errores de typecheck/build). Genera nueva generación y revisión atómica (`generation + 1n`, `revision + 1n`), asigna estado `UPLOADED`, y encola trabajo obligatorio `MEDIA_INSPECTION` sin marcar el medio directamente como seguro o `PUBLISHED`. Invariante de aislamiento y roles estrictamente verificado: organizador denegado (`ORGANIZER_DENIED`), administrador humano exige `AdminActorContext` (`EL-TK-044`) y grant activo MOD-007 (`action: 'RELEASE_QUARANTINE'`), y automatización de seguridad utiliza identidad de servicio y scope explícito sin sesiones humanas. Historial previo de cuarentena en `media_quarantine_audit` preservado intacto. Idempotencia por `operationId` y registro durable de `NotificationIntent` para el organizador (`ADMINISTRATIVE_INTERVENTION_QUARANTINE_RELEASE`) completados. Véase el [cierre](tickets/EL-TK-041.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-041-quarantine-release-by-authorized-actor-final-validation).

**CONFIRMED — EL-TK-042 DONE, 2026-10-11:** dependencias 034 y 044 satisfechas; implementación de eliminación de cuarentena por actor autorizado aprobada por reviewer y tester independiente en `@eventlens/media-inspection` (`QuarantineDeleteService`) con migración `202610110018_quarantine_delete` (19/19 pruebas enfocadas PASS: 13 unitarias y 6 de integración contra PostgreSQL 16 real; 0 errores de typecheck/build). Confirma barrera durable y disposición restrictiva atómica: transición a `status = 'DELETED'`, avance de revisión (`revision + 1n`), terminación de ciclos activos (`status = 'TERMINATED'`), cancelación de trabajos pendientes/en reintento en `job_queue` (`cancelled = true`), y bloqueo irreversible de accesos y reprocesamiento. Delega la purga física al contrato de retención/purga propietario (EL-EP-008 / EL-EP-015) mediante emisión durable de `QuarantinePurgeIntent` con deduplicación determinista. Invariante de aislamiento y roles estrictamente verificado: organizador denegado (`ORGANIZER_DENIED`), administrador humano exige `AdminActorContext` (`EL-TK-044`) y grant activo MOD-007 (`action: 'DELETE_QUARANTINE'`), y automatización de seguridad utiliza identidad de servicio y scope explícito sin sesiones humanas. Idempotencia por `operationId` y registro durable de `NotificationIntent` para el organizador (`ADMINISTRATIVE_INTERVENTION_QUARANTINE_DELETE`) completados. Véase el [cierre](tickets/EL-TK-042.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-042-quarantine-deletion-by-authorized-actor-final-validation).

**CONFIRMED — EL-TK-057 DONE, 2026-10-11:** dependencia 037 satisfecha; implementación de limpieza de outputs de intentos multimedia fallidos u obsoletos aprobada por reviewer y tester independiente en `@eventlens/media-inspection` (`AttemptCleanupService`) con migración `202610110019_attempt_cleanup` (19/19 pruebas enfocadas PASS: 13 unitarias y 6 de integración contra PostgreSQL 16 real; 0 errores de typecheck/build). Cumple con el alcance funcional e invariantes de protección de contenido activo: el original en `media_catalog.original` y los derivados activos en `media_active_derivative` están estrictamente blindados y nunca se borran. Exige quiescencia de writers y ausencia de leases activos en `job_queue` (`status = 'PROCESSING'`), realiza eliminaciones de almacenamiento fuera de la transacción SQL y registra atómicamente en PostgreSQL el recibo (`media_attempt_cleanup_receipt`), auditoría (`media_attempt_cleanup_audit`) y ledger físico (`media_physical_cleanup_ledger`) con restricción única `UNIQUE(namespace, key)` garantizando que no haya doble liberación física. Incluye protección atómica bajo CAS guard contra carreras de promoción concurrente (`PROMOTION_CLEANUP_RACE`), gestión de fallos parciales / estados `UNKNOWN` para reintento acotado, e idempotencia determinista por `operationId`. Desbloquea downstream EL-TK-058. Véase el [cierre](tickets/EL-TK-057.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-057-attempt-output-cleanup-final-validation).

**CONFIRMED — EL-TK-058 DONE, 2026-10-11:** dependencias 038 y 057 satisfechas; validación integrada del pipeline multimedia con corpus móvil reproducible y métricas instrumentadas aprobada por reviewer y tester independiente en `@eventlens/media-inspection` (`PipelineValidationService`, `PostgresPipelineValidationRepository`, `PHOTO_SLO_TARGETS`, `VIDEO_SLO_TARGETS`) con migración `202610110020_pipeline_validation` (16/16 pruebas enfocadas PASS: 13 unitarias y 3 de integración contra PostgreSQL 16 real; 0 errores de typecheck/build). Cumple con el alcance funcional de validación de pipeline e integridad: el original en `media_catalog.original` permanece idéntico en bytes y checksum antes y después del procesamiento (`isByteIdentical: true`), detectando mutaciones con `ORIGINAL_BYTE_MUTATION_DETECTED`. Instrumenta latencias desde aceptación completa de carga hasta preview utilizable cubriendo espera en cola, inspección y transformación, calcula mediana y p95 verificando SLOs de foto (mediana ≤ 15s, p95 ≤ 60s, éxito ≥ 98%) y video (mediana ≤ 2 min, p95 ≤ 5 min, éxito ≥ 95%), y maneja honestamente datos insuficientes con `INSUFFICIENT_OBSERVATIONS` sin inventar muestras. Valida resiliencia ante inyección de fallos: workers con leases expirados son rechazados (`LEASE_LOST`), amenazas son aisladas en cuarentena sin promoción de derivados, y outputs obsoletos son limpiados mediante `AttemptCleanupService`. Véase el [cierre](tickets/EL-TK-058.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-058-mobile-corpus-processing-and-integrated-metrics-final-validation).

**CONFIRMED — EL-TK-156 DONE, 2026-10-11:** persistencia de intenciones de notificación idempotentes desde hechos de dominio completada y validada en `@eventlens/notifications` (`NotificationIntentService`) con migración `202610110022_notification_intent` (16/16 pruebas PASS: 11 unitarias y 5 de integración contra PostgreSQL 16 real; 0 errores de typecheck/build). Convierte hechos confirmados de dominios propietarios en intenciones durables en PostgreSQL (`notification_intent`) con clave de deduplicación semántica `dedup_key`, `recipient_ref`, `notification_type`, `resource_ref`, `status: 'PENDING'`, `payload` JSONB sanitizado y ventanas temporales (`effective_at`, `expires_at`). Garantiza deduplicación determinista e `IDEMPOTENT_REPLAY` ante repeticiones exactas, detectando y rechazando discrepancias con `IDEMPOTENCY_CONFLICT`. Maneja obsolescencia y supersession atómica (`status = 'SUPERSEDED'`) ante nuevos hechos que invaliden condiciones previas o mediante revalidación previa a delivery, previniendo la comunicación de riesgos caducados. Ejecuta bajo transacciones atómicas PostgreSQL (`SqlTransaction`) con rollback limpio verificado ante fallos, y registra auditoría en `notification_audit_event` sin exposición de credenciales ni secretos. Desbloquea downstream EL-TK-157, EL-TK-158 y generadores de avisos de dominio. Véase el [cierre](tickets/EL-TK-156.md).

**CONFIRMED — EL-TK-157 DONE, 2026-10-11:** worker asíncrono y encolado de correos de notificación con puerto desacoplado completado y validado en `@eventlens/notifications` (`EmailNotificationService`, `EmailRenderer`, `FakeEmailSender`) con migración `202610110023_notification_delivery_attempt` (27/27 pruebas PASS: 11 unitarias de intención, 5 de integración de intención, 8 unitarias de email y 3 de integración de email con PostgreSQL 16 real y `JobQueuePostgres`; 0 errores de typecheck/build). Publica jobs transaccionales en JobQueue (`type: 'NOTIFICATION_EMAIL'`, `queue: 'notification-email'`, `dedupKey: email-job:${dedupKey}`), renderiza plantillas accesibles en HTML y texto plano con escaping estricto y sanitización contra fuga de credenciales. Desacopla el envío mediante la interfaz `EmailSender` (proveedor definitivo DEFERRED per DEC-021), ejecuta worker asíncrono con política de reintentos JobQueue (hasta 3 intentos con backoff exponencial), transición a `DEAD` y actualización de la intención a `FAILED` al agotar presupuesto. Aplica guarda de obsolescencia (`SKIPPED_OBSOLETE`), omitiendo el envío si la intención quedó `SUPERSEDED` o `CANCELLED` antes de la ejecución. Garantiza que la entrega no se acredite antes de la confirmación (`isDeliveryAcredited` estrictamente falso hasta registrar `SENT`). Registra auditoría sanitizada en `notification_audit_event`. Desbloquea downstream EL-TK-164 y EL-TK-165. Véase el [cierre](tickets/EL-TK-157.md).

**CONFIRMED — EL-TK-158 DONE, 2026-10-11:** proyección de avisos contextuales vigentes para el panel del organizador completada y validada en `@eventlens/notifications` (`NoticeProjectionService`) (42/42 pruebas PASS: 12 unitarias y 3 de integración contra PostgreSQL 16 real de proyección, sumadas a las 27 pruebas de intención y email; 0 errores de typecheck/build). Proyecta intenciones vigentes en contratos estructurados `InAppNotice` (`id`, `intentId`, `notificationType`, `title`, `fact`, `date`, `validUntil`, `consequence`, `action` con label y destination, `severity`, `resourceRef`, `recipientRef`) sin exigir un NotificationCenter obligatorio ni nuevos componentes (reutiliza catálogo canónico `ui-mvp-epic-review.md §EL-EP-013`). Filtra de forma atómica en PostgreSQL avisos no vigentes: excluye estados `SUPERSEDED` y `CANCELLED`, avisos con ventana de expiración vencida (`expires_at <= asOf`) y hechos futuros aún no vigentes (`effective_at > asOf`). Garantiza aislamiento estricto por cuenta/destinatario (`recipient_ref`) y filtrado opcional por evento (`resource_ref`). Deduplica de forma determinista para proyectar únicamente el aviso más reciente y relevante ante eventos reiterados (`notificationType:resourceRef`). Maneja estados vacíos de manera limpia (`hasActiveNotices: false`, `notices: []`), permitiendo al panel no renderizar banners o EmptyStates invasivos. Preserva la regla canónica de seguridad: los enlaces hacia destinos propietarios se reautorizan al navegar sin que el aviso conceda permisos de acceso. Desbloquea downstream EL-TK-164 y EL-TK-165. Véase el [cierre](tickets/EL-TK-158.md).




