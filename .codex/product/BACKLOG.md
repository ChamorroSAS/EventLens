# EventLens — índice de backlog de producto

**HISTÓRICO — gate de ejecución EL-TK-033, 2026-10-09:** requisitos READY y dependencias032/056 DONE; el alcance completo permaneció bloqueado hasta decidir `MalwareInspection`. [Hallazgo conservado](sessions/2026-10-09-el-tk-033-security-gate.md).

**HISTÓRICO — ARCH-016 antes de la implementación:** el usuario aprobó ClamAV local y architect cerró su contrato. El readiness autorizaba construir y validar el alcance; el resultado final de EL-TK-033 se registra abajo.

**RECOMMENDED:** primera descomposición funcional; prioridad P0 = necesaria para beta operativa segura; P1 = evaluación beta o preparación pública. Estado READY significa DoR de épica, no autorización de lanzar ni dependencias ya realizadas. NOT_READY conserva bloqueantes explícitos. Los tickets existentes se enumeran en su sección y permanecen sujetos a sus puertas de revisión.

## Epics

**CONFIRMED - 2026-10-08, gate UI actual:** todas16 MVP READY de requisitos. Intake004009 aprobado DEC-103..105, frontend planning YES. EL-EP-017 sigue NOT_READY juridico publico. Total17:16 READY/1 NOT_READY. [Matriz vigente](../context/ui-mvp-epic-review.md), [gate intake](sessions/2026-10-08-removal-intake.md). Solo001015 mantienen gates tecnicos frontend localizados; no implementacion/lanzamiento certificados.

| ID | Nombre | Módulo | Estado | Prioridad | Dependencias directas | Archivo |
|---|---|---|---|---|---|---|
| EL-EP-001 | Incorporar y proteger organizadores de la beta privada | MOD-001 | READY | P0 | Ninguna predecesora dura | [EL-EP-001](epics/EL-EP-001.md) |
| EL-EP-002 | Preparar y personalizar el espacio del evento | MOD-002 | READY | P0 | EL-EP-001 | [EL-EP-002](epics/EL-EP-002.md) |
| EL-EP-003 | Abrir y cerrar el evento según su vigencia | MOD-002 | READY | P0 | EL-EP-002, EL-EP-011 | [EL-EP-003](epics/EL-EP-003.md) |
| EL-EP-004 | Entrar por QR y participar con consentimiento sin cuenta | MOD-003 | READY | P0 | EL-EP-003 | [EL-EP-004](epics/EL-EP-004.md) |
| EL-EP-005 | Cargar recuerdos con tolerancia a fallos móviles | MOD-003 | READY | P0 | EL-EP-004, EL-EP-011 | [EL-EP-005](epics/EL-EP-005.md) |
| EL-EP-006 | Procesar multimedia preservando originales y aislando riesgos | MOD-003 | READY | P0 | EL-EP-005 | [EL-EP-006](epics/EL-EP-006.md) |
| EL-EP-007 | Visualizar recuerdos en una galería privada móvil | MOD-004 | READY | P0 | EL-EP-004, EL-EP-006 | [EL-EP-007](epics/EL-EP-007.md) |
| EL-EP-008 | Moderar, ocultar y recuperar contenido del evento | MOD-004 | READY | P0 | EL-EP-006, EL-EP-007 | [EL-EP-008](epics/EL-EP-008.md) |
| EL-EP-009 | Atender denuncias y solicitudes de retiro sin cuenta | MOD-004 | READY | P0 | EL-EP-004, EL-EP-007, EL-EP-014 | [EL-EP-009](epics/EL-EP-009.md) |
| EL-EP-010 | Recuperar originales individualmente y por exportación | MOD-005 | READY | P0 | EL-EP-006, EL-EP-008, EL-EP-013 | [EL-EP-010](epics/EL-EP-010.md) |
| EL-EP-011 | Aplicar planes BETA y ampliaciones controladas | MOD-006 | READY | P0 | EL-EP-001 | [EL-EP-011](epics/EL-EP-011.md) |
| EL-EP-012 | Operar y dar soporte con intervención administrativa justificada | MOD-007 | READY | P0 | EL-EP-001, EL-EP-014 | [EL-EP-012](epics/EL-EP-012.md) |
| EL-EP-013 | Informar al organizador sobre su cuenta y sus recuerdos | MOD-009 | READY | P0 | Ninguna predecesora dura | [EL-EP-013](epics/EL-EP-013.md) |
| EL-EP-014 | Detectar incidentes y reconstruir acciones relevantes | MOD-009 | READY | P0 | Ninguna predecesora dura | [EL-EP-014](epics/EL-EP-014.md) |
| EL-EP-015 | Eliminar eventos y cuentas con cancelación y purga controladas | MOD-008 | READY | P0 | EL-EP-001, EL-EP-003, EL-EP-008, EL-EP-010, EL-EP-013, EL-EP-014 | [EL-EP-015](epics/EL-EP-015.md) |
| EL-EP-016 | Evaluar la beta con evidencia de valor y confiabilidad | MOD-009 | READY | P1 | EL-EP-014 | [EL-EP-016](epics/EL-EP-016.md) |
| EL-EP-017 | Cerrar políticas jurídicas y de privacidad para apertura pública | MOD-008 | NOT_READY | P1 | EL-EP-009, EL-EP-015 | [EL-EP-017](epics/EL-EP-017.md) |

## Tickets

**CONFIRMED — CR-002:** TC-001..004 RESOLVED/ACCEPTED; DEC-061..064 sustituyen parcialmente DEC-060. Conservados9módulos/17épicas/8READY/9NOT_READY/IDs/prioridades. Afectadas EL-EP-003/005/006/007/010/011/012/013/014/015 por carga directa/storage externo/PITR/jobs/administración. PL-001..014 permanecen; diseño/validación concreta pendientes antes de beta.

| ID | Nombre | Épica | Estado | Prioridad | Depende de | Archivo |
|---|---|---|---|---|---|---|
| EL-TK-005 | Emitir una invitación BETA | EL-EP-001 | READY | P0 | EL-TK-044 | [EL-TK-005](tickets/EL-TK-005.md) |
| EL-TK-006 | Revocar una invitación BETA no usada | EL-EP-001 | READY | P0 | EL-TK-005, EL-TK-044, EL-TK-046 | [EL-TK-006](tickets/EL-TK-006.md) |
| EL-TK-007 | Consultar invitaciones BETA | EL-EP-001 | READY | P0 | EL-TK-005, EL-TK-044 | [EL-TK-007](tickets/EL-TK-007.md) |
| EL-TK-008 | Solicitar acceso a la BETA | EL-EP-001 | READY | P0 | — | [EL-TK-008](tickets/EL-TK-008.md) |
| EL-TK-009 | Revisar solicitudes de acceso BETA | EL-EP-001 | READY | P0 | EL-TK-008, EL-TK-044 | [EL-TK-009](tickets/EL-TK-009.md) |
| EL-TK-010 | Iniciar el registro de un organizador invitado | EL-EP-001 | READY | P0 | EL-TK-005 | [EL-TK-010](tickets/EL-TK-010.md) |
| EL-TK-011 | Verificar el correo y activar una cuenta pendiente | EL-EP-001 | READY | P0 | EL-TK-010, EL-TK-046 | [EL-TK-011](tickets/EL-TK-011.md) |
| EL-TK-012 | Reenviar la verificación de correo | EL-EP-001 | READY | P0 | EL-TK-011 | [EL-TK-012](tickets/EL-TK-012.md) |
| EL-TK-013 | Iniciar sesión como organizador verificado | EL-EP-001 | READY | P0 | EL-TK-011, EL-TK-046 | [EL-TK-013](tickets/EL-TK-013.md) |
| EL-TK-014 | Consultar mis sesiones activas | EL-EP-001 | READY | P0 | EL-TK-013, EL-TK-046 | [EL-TK-014](tickets/EL-TK-014.md) |
| EL-TK-015 | Cerrar mi sesión actual | EL-EP-001 | READY | P0 | EL-TK-013, EL-TK-046 | [EL-TK-015](tickets/EL-TK-015.md) |
| EL-TK-016 | Cerrar una sesión propia seleccionada | EL-EP-001 | READY | P0 | EL-TK-014, EL-TK-046 | [EL-TK-016](tickets/EL-TK-016.md) |
| EL-TK-017 | Cerrar todas mis otras sesiones | EL-EP-001 | READY | P0 | EL-TK-013, EL-TK-046 | [EL-TK-017](tickets/EL-TK-017.md) |
| EL-TK-018 | Solicitar recuperación de contraseña | EL-EP-001 | READY | P0 | EL-TK-011, EL-TK-046 | [EL-TK-018](tickets/EL-TK-018.md) |
| EL-TK-019 | Completar una recuperación de contraseña | EL-EP-001 | READY | P0 | EL-TK-013, EL-TK-018, EL-TK-046 | [EL-TK-019](tickets/EL-TK-019.md) |
| EL-TK-043 | Provisionar un principal administrativo mediante alta controlada | EL-EP-001 | READY | P0 | — | [EL-TK-043](tickets/EL-TK-043.md) |
| EL-TK-044 | Autenticar un principal administrativo provisto | EL-EP-001 | READY | P0 | EL-TK-043, EL-TK-046 | [EL-TK-044](tickets/EL-TK-044.md) |
| EL-TK-045 | Revocar un principal administrativo | EL-EP-001 | READY | P0 | EL-TK-044, EL-TK-046 | [EL-TK-045](tickets/EL-TK-045.md) |
| EL-TK-046 | Reconciliar restricciones de MOD-001 tras recuperación | EL-EP-001 | READY | P0 | contrato RecoveryAuthority acordado | [EL-TK-046](tickets/EL-TK-046.md) |
| EL-TK-020 | Crear un borrador de evento | EL-EP-002 | READY | P0 | EL-TK-013 | [EL-TK-020](tickets/EL-TK-020.md) |
| EL-TK-021 | Cambiar el nombre de un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-021](tickets/EL-TK-021.md) |
| EL-TK-022 | Definir la bienvenida de un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-022](tickets/EL-TK-022.md) |
| EL-TK-023 | Definir la fecha y hora local de un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-023](tickets/EL-TK-023.md) |
| EL-TK-024 | Cambiar la zona horaria de un evento preparado | EL-EP-002 | READY | P0 | EL-TK-020, EL-TK-023 | [EL-TK-024](tickets/EL-TK-024.md) |
| EL-TK-025 | Corregir la zona horaria de un evento que alcanzó ACTIVE | EL-EP-002 | READY | P0 | EL-TK-020, EL-TK-023, EL-TK-044 | [EL-TK-025](tickets/EL-TK-025.md) |
| EL-TK-027 | Establecer el PIN inicial de un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-027](tickets/EL-TK-027.md) |
| EL-TK-028 | Elegir el modo de moderación de un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-028](tickets/EL-TK-028.md) |
| EL-TK-029 | Configurar la carga de invitados en un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-029](tickets/EL-TK-029.md) |
| EL-TK-030 | Configurar la galería invitada en un borrador | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-030](tickets/EL-TK-030.md) |
| EL-TK-031 | Previsualizar un borrador como invitado | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-031](tickets/EL-TK-031.md) |
| EL-TK-032 | Encolar el procesamiento de un original aceptado | EL-EP-006 | DONE | P0 | Contrato de carga aceptada de EL-EP-005 | [EL-TK-032](tickets/EL-TK-032.md) |
| EL-TK-033 | Inspeccionar un original antes de transformarlo | EL-EP-006 | DONE | P0 | EL-TK-032, EL-TK-056 | [EL-TK-033](tickets/EL-TK-033.md) |
| EL-TK-034 | Aislar un original sospechoso en cuarentena | EL-EP-006 | READY | P0 | EL-TK-033 | [EL-TK-034](tickets/EL-TK-034.md) |
| EL-TK-035 | Generar derivados web de una fotografía aprobada | EL-EP-006 | READY | P0 | EL-TK-033 | [EL-TK-035](tickets/EL-TK-035.md) |
| EL-TK-036 | Generar derivados web de un video aprobado | EL-EP-006 | READY | P0 | EL-TK-033 | [EL-TK-036](tickets/EL-TK-036.md) |
| EL-TK-037 | Aplicar el resultado exitoso del procesamiento | EL-EP-006 | READY | P0 | EL-TK-035, EL-TK-036 | [EL-TK-037](tickets/EL-TK-037.md) |
| EL-TK-038 | Reintentar automáticamente un procesamiento técnico transitorio | EL-EP-006 | READY | P0 | EL-TK-032, EL-TK-055 | [EL-TK-038](tickets/EL-TK-038.md) |
| EL-TK-039 | Cerrar un fallo técnico terminal de procesamiento | EL-EP-006 | READY | P0 | EL-TK-033, EL-TK-038 | [EL-TK-039](tickets/EL-TK-039.md) |
| EL-TK-040 | Solicitar un nuevo ciclo para un fallo técnico elegible | EL-EP-006 | READY | P0 | EL-TK-033, EL-TK-039 | [EL-TK-040](tickets/EL-TK-040.md) |
| EL-TK-041 | Liberar una cuarentena mediante actor autorizado | EL-EP-006 | READY | P0 | EL-TK-032, EL-TK-034, EL-TK-038, EL-TK-044 | [EL-TK-041](tickets/EL-TK-041.md) |
| EL-TK-042 | Eliminar una media en cuarentena mediante actor autorizado | EL-EP-006 | READY | P0 | EL-TK-034, EL-TK-044 | [EL-TK-042](tickets/EL-TK-042.md) |
| EL-TK-047 | Consultar mis eventos y su configuración autorizada | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-047](tickets/EL-TK-047.md) |
| EL-TK-048 | Navegar por la configuración de un evento propio | EL-EP-002 | READY | P0 | EL-TK-047 | [EL-TK-048](tickets/EL-TK-048.md) |
| EL-TK-049 | Autorizar y confirmar una carga de portada EVENT_COVER | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-049](tickets/EL-TK-049.md) |
| EL-TK-050 | Integrar el procesamiento seguro de una portada EventAsset | EL-EP-002 | READY | P0 | EL-TK-049 | [EL-TK-050](tickets/EL-TK-050.md) |
| EL-TK-051 | Asignar una portada READY segura mediante revisión CAS | EL-EP-002 | READY | P0 | EL-TK-020, EL-TK-050 | [EL-TK-051](tickets/EL-TK-051.md) |
| EL-TK-052 | Limpiar portadas anteriores o no asignadas sin borrar la vigente | EL-EP-002 | READY | P0 | EL-TK-051 | [EL-TK-052](tickets/EL-TK-052.md) |
| EL-TK-053 | Consultar el estado y capacidades autorizadas de una media | EL-EP-006 | READY | P0 | ninguna | [EL-TK-053](tickets/EL-TK-053.md) |
| EL-TK-054 | Integrar estados de fallo y retry en la biblioteca compartida | EL-EP-006 | READY | P0 | EL-TK-040, EL-TK-053 | [EL-TK-054](tickets/EL-TK-054.md) |
| EL-TK-055 | Reservar ejecuciones JobQueue PostgreSQL con lease y fencing | EL-EP-006 | DONE | P0 | ninguna | [EL-TK-055](tickets/EL-TK-055.md) |
| EL-TK-056 | Ejecutar inspección y transformación multimedia en aislamiento supervisado | EL-EP-006 | DONE | P0 | EL-TK-055, EL-TK-061 | [EL-TK-056](tickets/EL-TK-056.md) |
| EL-TK-057 | Limpiar outputs de intentos multimedia fallidos u obsoletos | EL-EP-006 | READY | P0 | EL-TK-037 | [EL-TK-057](tickets/EL-TK-057.md) |
| EL-TK-058 | Validar procesamiento mediante corpus móvil y métricas integradas | EL-EP-006 | READY | P0 | EL-TK-038, EL-TK-057 | [EL-TK-058](tickets/EL-TK-058.md) |
| EL-TK-059 | Habilitar el entorno mínimo real requerido para spikes técnicos | EL-EP-006 | DONE | P0 | — | [EL-TK-059](tickets/EL-TK-059.md) |
| EL-TK-060 | Evaluar aislamiento efectivo y quiescencia mediante spike controlado | EL-EP-006 | DONE | P0 | EL-TK-059 | [EL-TK-060](tickets/EL-TK-060.md) |
| EL-TK-061 | Evaluar inspección y rendiciones con corpus móvil mediante spike | EL-EP-006 | DONE | P0 | EL-TK-059, EL-TK-060 | [EL-TK-061](tickets/EL-TK-061.md) |

**HISTÓRICO CONFIRMED:** EL-TK-005..019 sustituyeron la descomposición anterior y quedaron READY el 2026-10-07. [Dictamen](sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). **CONFIRMED — 2026-10-08:** la remediación autorizada de EL-TK-005..019 y EL-TK-043..046 fue APPROVED; los 19 activos están READY de requisitos. READY_FOR_IMPLEMENTATION: PARTIAL; YES sólo para 008 backend, 043 provisión operativa y 046 integración del puerto MOD-001, con los límites del [dictamen final](sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). La UI de EL-EP-001 sigue con gate PARTIAL: no se generan tickets frontend.

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó el gate final de EL-EP-002. EL-TK-020..031 estaban READY, sin hallazgos pendientes. READY_FOR_IMPLEMENTATION: YES en aquel snapshot. [Dictamen final](sessions/2026-10-07-el-ep-002-ticket-final-review.md). El dictamen PARTIAL previo se conserva como histórico. No se modifica lifecycle ni acceso publicado de otras épicas.

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó EL-TK-032..042, todos READY y sin hallazgos pendientes en aquel snapshot. READY_FOR_IMPLEMENTATION: YES histórico. [Dictamen](sessions/2026-10-07-el-ep-006-ticket-review.md). No se implementó ni avanzó a otra épica.

**CONFIRMED — 2026-10-08, EL-EP-002:** remediación APPROVED; 11 tickets actualizados 020..025/027..031 y seis nuevos 047..052, total 17 activos READY de requisitos. REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: PARTIAL (16 YES; 025 NO por gate administrativo044 PENDING). 026 SUPERSEDED histórico, sustituido por049..052. UI002 conserva frontend YES. [Dictamen final](sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). [Sesión](sessions/2026-10-08-el-ep-002-ticket-remediation.md).

**CONFIRMED — 2026-10-08, EL-EP-006:** remediación APPROVED de nueve existentes032/033/035/036/037/038/040/041/042 y seis nuevos053..058;034/039 VALID KEEP intactos. Total17 READY de requisitos; REQUIREMENTS_READY:YES; READY_FOR_IMPLEMENTATION:PARTIAL con7 gates técnicos localizados. UI006 YES. [Dictamen final](sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). [Sesión](sessions/2026-10-08-el-ep-006-ticket-remediation.md).

**HISTÓRICO CONFIRMED — paquete TB-01..05 ratificado (previo a ejecución/adopción):** ocho owners033/035/036/041/042/044/056/058 y tres nuevos059..061, once READY de requisitos tras [dictamen final APPROVED](sessions/2026-10-08-technical-blockers-ticket-review.md). REQUIREMENTS_READY:YES; READY_FOR_IMPLEMENTATION:PARTIAL (044/059YES propio,otros9NO full con scopes preparatorios habilitados). Dictámenes previos de001/006 conservan historia; el paquete sólo actualiza estos scopes. TB-03 contrato APPROVED, auth aún no implementada. PREPARATORY_SCOPE_READY/BLOCKED_SCOPE/BLOCKED_BY en cada owner;059 mínimo YES para implementación propia,060/061 NO hasta entorno real/PASS requerido. [Fuente ratificada](sessions/2026-10-08-technical-blockers-approved-contracts.md), [sesión del paquete](sessions/2026-10-08-technical-blockers-ticket-integration.md). No spikes ejecutados ni PASS declarados.

## Superseded/deprecated

EL-TK-026 — SUPERSEDED por EL-TK-049..052, sin borrar criterios/aprobación histórica.

EL-TK-001..004 — SUPERSEDED por EL-TK-005..019; se preservan como historial. EL-EP-TEMPLATE.md permanece como plantilla, no como épica del backlog.

## Readiness vigente tras ARCH-015 — 2026-10-09

**CONFIRMED:** [impacto localizado](sessions/2026-10-09-arch-015-backlog-impact.md). Sin nuevos requisitos, tickets, prioridades ni IDs. ARCH-015 y059/060/061 DONE resuelven tooling/rendiciones/aislamiento y adopción experimental TB-01/TB-02; no implementan pipeline productivo ni satisfacen gates Beta.

- EL-TK-033/035/036/041/042/056: REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION NO → YES para alcance propio por contratos cerrados. Integración conserva predecesoras reales,044 para rutas humanas.
- EL-TK-032/034/037/038/039/040/050/051/052/053/054/055/057: YES/YES confirmado con límites/predecesoras reales; no end-to-end disponible.
- EL-TK-058: YES/NO por pipeline/adapters productivos y fase REQUIRED_FOR_INTEGRATION inexistentes. Preparación harness/métricas permitida; no bloqueado por TB-01/TB-02 ni por producir evidencia de gate.
- EL-TK-059/060/061: DONE conservado (061 corrige índice READY obsoleto); readiness de ejecución propio YES,060/061 PASS. Recomendaciones históricas no sustituyen adopción ARCH-015.
- EL-TK-031/049 sin cambios;044 sólo corrige inversa blocks de025, sin cambio de readiness; upstream013/020/043/046 revisados como límites sin impacto nuevo (013 conservaNO por contrato organizador pendiente, no resuelto por auth administrativa).

**CONFIRMED — EL-TK-056 DONE, 2026-10-09:** implementación y gates de código aprobados; evidencia y alcance en [sesión](sessions/2026-10-09-el-tk-056-implementation.md).

**CONFIRMED — EL-TK-032 DONE, 2026-10-09:** aceptación transaccional del original y encolado idempotente implementados y revisados; [sesión](sessions/2026-10-09-el-tk-032-implementation.md). Se satisfacen las dependencias de 033, 038 y 041 que corresponden a 032; cada ticket aún requiere verificar sus otras predecesoras y readiness.

**CONFIRMED — EL-TK-033 DONE, 2026-10-09 hora local:** el tester independiente reportó 46/46 PASS (32 integración PostgreSQL real y 14 unitarias); regresiones 055: 25/25 y 056: 21/21 PASS. El manifest de 29 archivos coincide con el código revisado. Véase [cierre y evidencia](tickets/EL-TK-033.md#cierre-de-implementación--2026-10-09-hora-local). Se preservan sus aristas downstream; completar 033 no aprueba automáticamente readiness de 034/035/036/039/040. MEDIA-001/CAP-001/DR-001/EXPORT-001 permanecen NOT_EVALUATED; almacenamiento definitivo sigue DEFERRED. El siguiente candidato por prioridad P0 y dependencia es EL-TK-034, sujeto a su propia verificación de readiness y predecesoras cuando se solicite continuar. No se inicia otro ticket en este cierre.
