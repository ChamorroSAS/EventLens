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
| EL-TK-043 | Provisionar un principal administrativo mediante alta controlada | EL-EP-001 | DONE | P0 | — | [EL-TK-043](tickets/EL-TK-043.md) |
| EL-TK-044 | Autenticar un principal administrativo provisto | EL-EP-001 | DONE | P0 | EL-TK-043, EL-TK-046 | [EL-TK-044](tickets/EL-TK-044.md) |
| EL-TK-045 | Revocar un principal administrativo | EL-EP-001 | READY | P0 | EL-TK-044, EL-TK-046 | [EL-TK-045](tickets/EL-TK-045.md) |
| EL-TK-046 | Reconciliar restricciones de MOD-001 tras recuperación | EL-EP-001 | DONE | P0 | contrato RecoveryAuthority acordado | [EL-TK-046](tickets/EL-TK-046.md) |
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
| EL-TK-034 | Aislar un original sospechoso en cuarentena | EL-EP-006 | DONE | P0 | EL-TK-033 | [EL-TK-034](tickets/EL-TK-034.md) |
| EL-TK-035 | Generar derivados web de una fotografía aprobada | EL-EP-006 | DONE | P0 | EL-TK-033 | [EL-TK-035](tickets/EL-TK-035.md) |
| EL-TK-036 | Generar derivados web de un video aprobado | EL-EP-006 | DONE | P0 | EL-TK-033 | [EL-TK-036](tickets/EL-TK-036.md) |
| EL-TK-037 | Aplicar el resultado exitoso del procesamiento | EL-EP-006 | DONE | P0 | EL-TK-035, EL-TK-036 | [EL-TK-037](tickets/EL-TK-037.md) |
| EL-TK-038 | Reintentar automáticamente un procesamiento técnico transitorio | EL-EP-006 | DONE | P0 | EL-TK-032, EL-TK-055 | [EL-TK-038](tickets/EL-TK-038.md) |
| EL-TK-039 | Cerrar un fallo técnico terminal de procesamiento | EL-EP-006 | DONE | P0 | EL-TK-033, EL-TK-038 | [EL-TK-039](tickets/EL-TK-039.md) |
| EL-TK-040 | Solicitar un nuevo ciclo para un fallo técnico elegible | EL-EP-006 | DONE | P0 | EL-TK-033, EL-TK-039 | [EL-TK-040](tickets/EL-TK-040.md) |
| EL-TK-041 | Liberar una cuarentena mediante actor autorizado | EL-EP-006 | READY | P0 | EL-TK-032, EL-TK-034, EL-TK-038, EL-TK-044 | [EL-TK-041](tickets/EL-TK-041.md) |
| EL-TK-042 | Eliminar una media en cuarentena mediante actor autorizado | EL-EP-006 | READY | P0 | EL-TK-034, EL-TK-044 | [EL-TK-042](tickets/EL-TK-042.md) |
| EL-TK-047 | Consultar mis eventos y su configuración autorizada | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-047](tickets/EL-TK-047.md) |
| EL-TK-048 | Navegar por la configuración de un evento propio | EL-EP-002 | READY | P0 | EL-TK-047 | [EL-TK-048](tickets/EL-TK-048.md) |
| EL-TK-049 | Autorizar y confirmar una carga de portada EVENT_COVER | EL-EP-002 | READY | P0 | EL-TK-020 | [EL-TK-049](tickets/EL-TK-049.md) |
| EL-TK-050 | Integrar el procesamiento seguro de una portada EventAsset | EL-EP-002 | READY | P0 | EL-TK-049 | [EL-TK-050](tickets/EL-TK-050.md) |
| EL-TK-051 | Asignar una portada READY segura mediante revisión CAS | EL-EP-002 | READY | P0 | EL-TK-020, EL-TK-050 | [EL-TK-051](tickets/EL-TK-051.md) |
| EL-TK-052 | Limpiar portadas anteriores o no asignadas sin borrar la vigente | EL-EP-002 | READY | P0 | EL-TK-051 | [EL-TK-052](tickets/EL-TK-052.md) |
| EL-TK-053 | Consultar el estado y capacidades autorizadas de una media | EL-EP-006 | DONE | P0 | ninguna | [EL-TK-053](tickets/EL-TK-053.md) |
| EL-TK-054 | Integrar estados de fallo y retry en la biblioteca compartida | EL-EP-006 | DONE | P0 | EL-TK-040, EL-TK-053 | [EL-TK-054](tickets/EL-TK-054.md) |
| EL-TK-055 | Reservar ejecuciones JobQueue PostgreSQL con lease y fencing | EL-EP-006 | DONE | P0 | ninguna | [EL-TK-055](tickets/EL-TK-055.md) |
| EL-TK-056 | Ejecutar inspección y transformación multimedia en aislamiento supervisado | EL-EP-006 | DONE | P0 | EL-TK-055, EL-TK-061 | [EL-TK-056](tickets/EL-TK-056.md) |
| EL-TK-057 | Limpiar outputs de intentos multimedia fallidos u obsoletos | EL-EP-006 | READY | P0 | EL-TK-037 | [EL-TK-057](tickets/EL-TK-057.md) |
| EL-TK-058 | Validar procesamiento mediante corpus móvil y métricas integradas | EL-EP-006 | READY | P0 | EL-TK-038, EL-TK-057 | [EL-TK-058](tickets/EL-TK-058.md) |
| EL-TK-059 | Habilitar el entorno mínimo real requerido para spikes técnicos | EL-EP-006 | DONE | P0 | — | [EL-TK-059](tickets/EL-TK-059.md) |
| EL-TK-060 | Evaluar aislamiento efectivo y quiescencia mediante spike controlado | EL-EP-006 | DONE | P0 | EL-TK-059 | [EL-TK-060](tickets/EL-TK-060.md) |
| EL-TK-061 | Evaluar inspección y rendiciones con corpus móvil mediante spike | EL-EP-006 | DONE | P0 | EL-TK-059, EL-TK-060 | [EL-TK-061](tickets/EL-TK-061.md) |
| EL-TK-062 | Calcular la línea temporal canónica del lifecycle de un evento | EL-EP-003 | READY | P0 | EL-TK-023, contrato EL-EP-011 | [EL-TK-062](tickets/EL-TK-062.md) |
| EL-TK-063 | Programar un evento DRAFT para apertura futura | EL-EP-003 | READY | P0 | EL-TK-020, EL-TK-023, EL-TK-062 | [EL-TK-063](tickets/EL-TK-063.md) |
| EL-TK-064 | Activar un evento SCHEDULED manual o automáticamente | EL-EP-003 | READY | P0 | EL-TK-063, EL-TK-062, EL-TK-055 | [EL-TK-064](tickets/EL-TK-064.md) |
| EL-TK-065 | Cerrar manualmente un evento ACTIVE | EL-EP-003 | READY | P0 | EL-TK-064 | [EL-TK-065](tickets/EL-TK-065.md) |
| EL-TK-066 | Reabrir un evento CLOSED antes de vencer | EL-EP-003 | READY | P0 | EL-TK-065, EL-TK-062 | [EL-TK-066](tickets/EL-TK-066.md) |
| EL-TK-067 | Avanzar automáticamente por vencimiento y fin de gracia | EL-EP-003 | READY | P0 | EL-TK-062,064,065,055; contrato EL-EP-015 | [EL-TK-067](tickets/EL-TK-067.md) |
| EL-TK-068 | Suspender administrativamente un evento conservando su estado previo | EL-EP-003 | READY | P0 | EL-TK-044 | [EL-TK-068](tickets/EL-TK-068.md) |
| EL-TK-069 | Reactivar un evento SUSPENDED recalculando su estado vigente | EL-EP-003 | READY | P0 | EL-TK-062,067,068,044 | [EL-TK-069](tickets/EL-TK-069.md) |
| EL-TK-070 | Extender la vigencia autorizada de un evento | EL-EP-003 | READY | P0 | EL-TK-062, contrato EL-EP-011 | [EL-TK-070](tickets/EL-TK-070.md) |
| EL-TK-071 | Consultar lifecycle y capacidades vigentes de un evento | EL-EP-003 | READY | P0 | EL-TK-063..070 | [EL-TK-071](tickets/EL-TK-071.md) |
| EL-TK-072 | Aplicar restricciones de acceso según el lifecycle vigente | EL-EP-003 | READY | P0 | EL-TK-064,065,067,068,069,071 | [EL-TK-072](tickets/EL-TK-072.md) |
| EL-TK-073 | Integrar el lifecycle en la interfaz de organizador e invitado | EL-EP-003 | READY | P0 | EL-TK-071, EL-TK-072 | [EL-TK-073](tickets/EL-TK-073.md) |
| EL-TK-074 | Resolver acceso público a un evento mediante credencial no adivinable | EL-EP-004 | READY | P0 | EL-TK-020, EL-TK-072, EL-TK-084 | [EL-TK-074](tickets/EL-TK-074.md) |
| EL-TK-075 | Validar PIN opcional y establecer una sesión anónima guest | EL-EP-004 | READY | P0 | EL-TK-027, EL-TK-074 | [EL-TK-075](tickets/EL-TK-075.md) |
| EL-TK-076 | Registrar consentimiento versionado antes de la primera carga | EL-EP-004 | READY | P0 | EL-TK-075 | [EL-TK-076](tickets/EL-TK-076.md) |
| EL-TK-077 | Registrar nombre o apodo del aportante en la sesión guest | EL-EP-004 | READY | P0 | EL-TK-075 | [EL-TK-077](tickets/EL-TK-077.md) |
| EL-TK-078 | Consultar Mis aportes mediante la sesión guest | EL-EP-004 | READY | P0 | EL-TK-075, EL-TK-072 | [EL-TK-078](tickets/EL-TK-078.md) |
| EL-TK-079 | Cambiar o desactivar el PIN de acceso y revocar sesiones guest existentes | EL-EP-004 | READY | P0 | EL-TK-027, EL-TK-075 | [EL-TK-079](tickets/EL-TK-079.md) |
| EL-TK-080 | Regenerar la credencial pública y revocar el enlace anterior | EL-EP-004 | READY | P0 | EL-TK-074, EL-TK-075 | [EL-TK-080](tickets/EL-TK-080.md) |
| EL-TK-081 | Consultar datos de compartir y QR del acceso vigente | EL-EP-004 | READY | P0 | EL-TK-074, EL-TK-084 | [EL-TK-081](tickets/EL-TK-081.md) |
| EL-TK-082 | Derivar a solicitud de retiro cuando la sesión guest no está disponible | EL-EP-004 | READY | P0 | EL-TK-074; contrato EL-EP-009 | [EL-TK-082](tickets/EL-TK-082.md) |
| EL-TK-083 | Integrar la experiencia guest de acceso, consentimiento y Mis aportes | EL-EP-004 | READY | P0 | EL-TK-074..078, EL-TK-082 | [EL-TK-083](tickets/EL-TK-083.md) |
| EL-TK-084 | Emitir la credencial pública inicial y publicar el acceso de un evento | EL-EP-004 | READY | P0 | EL-TK-020, EL-TK-027 | [EL-TK-084](tickets/EL-TK-084.md) |
| EL-TK-085 | Integrar la gestión de acceso, PIN y compartir en la interfaz del organizador | EL-EP-004 | READY | P0 | EL-TK-079,080,081,084 | [EL-TK-085](tickets/EL-TK-085.md) |
| EL-TK-086 | Autorizar un intento de carga y reservar capacidad del evento | EL-EP-005 | READY | P0 | EL-TK-075, EL-TK-076, EL-TK-077, EL-TK-072, contrato EL-EP-011 | [EL-TK-086](tickets/EL-TK-086.md) |
| EL-TK-087 | Emitir una URL temporal para carga directa al object storage privado | EL-EP-005 | READY | P0 | EL-TK-086 | [EL-TK-087](tickets/EL-TK-087.md) |
| EL-TK-088 | Confirmar la existencia y pertenencia del original cargado | EL-EP-005 | READY | P0 | EL-TK-087 | [EL-TK-088](tickets/EL-TK-088.md) |
| EL-TK-089 | Validar restricciones reales del archivo antes de aceptar el original | EL-EP-005 | READY | P0 | EL-TK-088, contrato EL-EP-011 | [EL-TK-089](tickets/EL-TK-089.md) |
| EL-TK-090 | Aceptar un original confirmado y transferirlo al pipeline asíncrono | EL-EP-005 | READY | P0 | EL-TK-089; contrato downstream consumido por EL-TK-032 (DONE) | [EL-TK-090](tickets/EL-TK-090.md) |
| EL-TK-091 | Renovar una transferencia temporal para un fallo de red elegible | EL-EP-005 | READY | P0 | EL-TK-086, EL-TK-087 | [EL-TK-091](tickets/EL-TK-091.md) |
| EL-TK-092 | Cancelar intentos no confirmados y liberar sus reservas | EL-EP-005 | READY | P0 | EL-TK-086, EL-TK-088, EL-TK-072, EL-TK-075 | [EL-TK-092](tickets/EL-TK-092.md) |
| EL-TK-093 | Consultar el estado de intentos y resultados de carga del lote | EL-EP-005 | READY | P0 | EL-TK-086,088,089,090,092 | [EL-TK-093](tickets/EL-TK-093.md) |
| EL-TK-094 | Integrar selección, progreso y retry por archivo en la interfaz guest | EL-EP-005 | READY | P0 | EL-TK-086..093 | [EL-TK-094](tickets/EL-TK-094.md) |
| EL-TK-095 | Validar el flujo completo de carga móvil y resultado parcial | EL-EP-005 | READY | P0 | EL-TK-086..094 | [EL-TK-095](tickets/EL-TK-095.md) |
| EL-TK-096 | Consultar la galería guest de media publicada y autorizada | EL-EP-007 | READY | P0 | EL-TK-074, EL-TK-075, EL-TK-072, EL-TK-037 | [EL-TK-096](tickets/EL-TK-096.md) |
| EL-TK-097 | Autorizar visualización temporal de un derivado privado | EL-EP-007 | READY | P0 | EL-TK-072, EL-TK-074, EL-TK-035, EL-TK-037 | [EL-TK-097](tickets/EL-TK-097.md) |
| EL-TK-098 | Consultar la biblioteca de media del organizador | EL-EP-007 | READY | P0 | EL-TK-047, EL-TK-053 | [EL-TK-098](tickets/EL-TK-098.md) |
| EL-TK-099 | Integrar la galería y viewer privados en la experiencia guest | EL-EP-007 | READY | P0 | EL-TK-096, EL-TK-097, EL-TK-101 | [EL-TK-099](tickets/EL-TK-099.md) |
| EL-TK-100 | Integrar la biblioteca de media en la interfaz del organizador | EL-EP-007 | READY | P0 | EL-TK-098, EL-TK-053, EL-TK-054 | [EL-TK-100](tickets/EL-TK-100.md) |
| EL-TK-101 | Revalidar visibilidad cuando cambia el acceso o la media | EL-EP-007 | READY | P0 | EL-TK-096, EL-TK-097, EL-TK-072, EL-TK-074 | [EL-TK-101](tickets/EL-TK-101.md) |
| EL-TK-102 | Validar privacidad y experiencia móvil de galería y biblioteca | EL-EP-007 | READY | P0 | EL-TK-096..101 | [EL-TK-102](tickets/EL-TK-102.md) |
| EL-TK-103 | Aprobar una media pendiente de revisión | EL-EP-008 | READY | P0 | 098,037 | [EL-TK-103](tickets/EL-TK-103.md) |
| EL-TK-104 | Rechazar una media pendiente de revisión | EL-EP-008 | READY | P0 | 098 | [EL-TK-104](tickets/EL-TK-104.md) |
| EL-TK-105 | Ocultar una media publicada sin eliminarla | EL-EP-008 | READY | P0 | 098,101 | [EL-TK-105](tickets/EL-TK-105.md) |
| EL-TK-106 | Volver a publicar una media oculta cuando sigue autorizada | EL-EP-008 | READY | P0 | 105,101 | [EL-TK-106](tickets/EL-TK-106.md) |
| EL-TK-107 | Mover una media elegible a papelera conservando su estado previo | EL-EP-008 | READY | P0 | 098,053; contrato EL-EP-006 | [EL-TK-107](tickets/EL-TK-107.md) |
| EL-TK-108 | Restaurar una media de papelera respetando bloqueos vigentes | EL-EP-008 | READY | P0 | 107 | [EL-TK-108](tickets/EL-TK-108.md) |
| EL-TK-109 | Entregar a purga una media cuya papelera venció | EL-EP-008 | READY | P0 | 107,055; contrato EL-EP-015 | [EL-TK-109](tickets/EL-TK-109.md) |
| EL-TK-110 | Cambiar el modo de moderación sin reescribir contenido existente | EL-EP-008 | READY | P0 | 028,037 | [EL-TK-110](tickets/EL-TK-110.md) |
| EL-TK-111 | Integrar acciones de moderación y papelera en la biblioteca del organizador | EL-EP-008 | READY | P0 | 100,103..108,110 | [EL-TK-111](tickets/EL-TK-111.md) |
| EL-TK-112 | Validar moderación, papelera y restauración de extremo a extremo | EL-EP-008 | READY | P0 | 103..111 | [EL-TK-112](tickets/EL-TK-112.md) |
| EL-TK-113 | Registrar una denuncia sobre contenido visible | EL-EP-009 | READY | P0 | contrato media visible EL-EP-007; contrato EL-EP-014 | [EL-TK-113](tickets/EL-TK-113.md) |
| EL-TK-114 | Retirar irreversiblemente un aporte propio con sesión guest válida | EL-EP-009 | READY | P0 | 078; contrato EL-EP-015 | [EL-TK-114](tickets/EL-TK-114.md) |
| EL-TK-115 | Registrar una solicitud de retiro sin sesión válida | EL-EP-009 | READY | P0 | 082 | [EL-TK-115](tickets/EL-TK-115.md) |
| EL-TK-116 | Clasificar severidad y priorizar denuncias para revisión administrativa | EL-EP-009 | READY | P0 | 113, 115, 044; contrato EL-EP-014 | [EL-TK-116](tickets/EL-TK-116.md) |
| EL-TK-117 | Autorizar acceso administrativo justificado a la media de un caso | EL-EP-009 | READY | P0 | 116,044,097; contrato EL-EP-014 | [EL-TK-117](tickets/EL-TK-117.md) |
| EL-TK-118 | Aplicar ocultamiento preventivo por decisión administrativa | EL-EP-009 | READY | P0 | 116,117,101 | [EL-TK-118](tickets/EL-TK-118.md) |
| EL-TK-119 | Resolver un caso de reporte o retiro registrando la intervención | EL-EP-009 | READY | P0 | 116,117; contratos EL-EP-013/014/015 | [EL-TK-119](tickets/EL-TK-119.md) |
| EL-TK-120 | Consultar la cola y detalle de casos para revisión administrativa | EL-EP-009 | READY | P0 | 113,115,116 | [EL-TK-120](tickets/EL-TK-120.md) |
| EL-TK-121 | Integrar reporte y retiro en la experiencia pública/guest | EL-EP-009 | READY | P0 | 099, 113, 114, 115 | [EL-TK-121](tickets/EL-TK-121.md) |
| EL-TK-122 | Integrar cola y resolución de casos en la consola administrativa | EL-EP-009 | READY | P0 | 116..120; contrato EL-EP-012 | [EL-TK-122](tickets/EL-TK-122.md) |
| EL-TK-123 | Validar privacidad y resolución de reportes/retiros de extremo a extremo | EL-EP-009 | READY | P0 | 113..122 | [EL-TK-123](tickets/EL-TK-123.md) |
| EL-TK-124 | Autorizar la descarga individual de un original elegible | EL-EP-010 | READY | P0 | 098,053; contrato EL-EP-006 | [EL-TK-124](tickets/EL-TK-124.md) |
| EL-TK-125 | Crear una solicitud de exportación con snapshot fijo de elegibles | EL-EP-010 | READY | P0 | 098; contrato EL-EP-008 | [EL-TK-125](tickets/EL-TK-125.md) |
| EL-TK-126 | Encolar y preparar una exportación asíncrona multipartes | EL-EP-010 | READY | P0 | 125,055 | [EL-TK-126](tickets/EL-TK-126.md) |
| EL-TK-127 | Publicar disponibilidad y expiración de una exportación preparada | EL-EP-010 | READY | P0 | 126 | [EL-TK-127](tickets/EL-TK-127.md) |
| EL-TK-128 | Invalidar exportaciones afectadas por retiro o pérdida de acceso | EL-EP-010 | READY | P0 | 125,126; contratos EL-EP-008/009/015 | [EL-TK-128](tickets/EL-TK-128.md) |
| EL-TK-129 | Autorizar la descarga temporal de una parte de exportación | EL-EP-010 | READY | P0 | 127,128 | [EL-TK-129](tickets/EL-TK-129.md) |
| EL-TK-130 | Reintentar o regenerar una exportación fallida o expirada cuando siga autorizada | EL-EP-010 | READY | P0 | 126,127,128 | [EL-TK-130](tickets/EL-TK-130.md) |
| EL-TK-131 | Consultar estado, partes y disponibilidad de una exportación | EL-EP-010 | READY | P0 | 125..130 | [EL-TK-131](tickets/EL-TK-131.md) |
| EL-TK-132 | Integrar descarga individual y exportación en la biblioteca del organizador | EL-EP-010 | READY | P0 | 100,124..131 | [EL-TK-132](tickets/EL-TK-132.md) |
| EL-TK-133 | Validar recuperación individual y exportación de extremo a extremo | EL-EP-010 | READY | P0 | 124..132 | [EL-TK-133](tickets/EL-TK-133.md) |
| EL-TK-134 | Asignar y resolver el plan BETA efectivo de un evento | EL-EP-011 | READY | P0 | contrato EL-EP-001 | [EL-TK-134](tickets/EL-TK-134.md) |
| EL-TK-135 | Consultar consumo comercial y capacidad disponible del evento | EL-EP-011 | READY | P0 | 134, 136, 137 | [EL-TK-135](tickets/EL-TK-135.md) |
| EL-TK-136 | Reservar y liberar capacidad comercial de forma atómica | EL-EP-011 | READY | P0 | 134 | [EL-TK-136](tickets/EL-TK-136.md) |
| EL-TK-137 | Consolidar consumo al aceptar o purgar originales | EL-EP-011 | READY | P0 | 136; contratos EL-EP-005/015 | [EL-TK-137](tickets/EL-TK-137.md) |
| EL-TK-138 | Emitir señales deduplicadas de uso al 80 y 100 por ciento | EL-EP-011 | READY | P0 | 135,137 | [EL-TK-138](tickets/EL-TK-138.md) |
| EL-TK-139 | Crear una solicitud de ampliación para almacenamiento o vigencia | EL-EP-011 | READY | P0 | 134,135 | [EL-TK-139](tickets/EL-TK-139.md) |
| EL-TK-140 | Responder una solicitud de información adicional de ampliación | EL-EP-011 | READY | P0 | 139 | [EL-TK-140](tickets/EL-TK-140.md) |
| EL-TK-141 | Revisar y decidir solicitudes de ampliación | EL-EP-011 | READY | P0 | 139,044 | [EL-TK-141](tickets/EL-TK-141.md) |
| EL-TK-142 | Aplicar overrides administrativos y retorno al plan base | EL-EP-011 | READY | P0 | 134,141; contrato EL-EP-003 | [EL-TK-142](tickets/EL-TK-142.md) |
| EL-TK-143 | Integrar capacidad y solicitudes de ampliación en la experiencia del organizador | EL-EP-011 | READY | P0 | 135,139,140 | [EL-TK-143](tickets/EL-TK-143.md) |
| EL-TK-144 | Integrar revisión y overrides de capacidad en la consola administrativa | EL-EP-011 | READY | P0 | 141,142; contrato EL-EP-012 | [EL-TK-144](tickets/EL-TK-144.md) |
| EL-TK-145 | Validar capacidad, ampliaciones y overrides de extremo a extremo | EL-EP-011 | READY | P0 | 134..144 | [EL-TK-145](tickets/EL-TK-145.md) |
| EL-TK-146 | Buscar eventos y organizadores desde la consola administrativa | EL-EP-012 | READY | P0 | 044; contrato EL-EP-002 | [EL-TK-146](tickets/EL-TK-146.md) |
| EL-TK-147 | Consultar un detalle administrativo agregado sin preview de media | EL-EP-012 | READY | P0 | 146; contratos propietarios vigentes | [EL-TK-147](tickets/EL-TK-147.md) |
| EL-TK-148 | Consultar jobs y errores técnicos sanitizados desde soporte | EL-EP-012 | READY | P0 | 147; contrato JobQueue | [EL-TK-148](tickets/EL-TK-148.md) |
| EL-TK-149 | Ejecutar acciones administrativas autorizadas sobre jobs | EL-EP-012 | READY | P0 | 148,044; contrato JobQueue | [EL-TK-149](tickets/EL-TK-149.md) |
| EL-TK-150 | Autorizar acceso multimedia administrativo por soporte o incidente | EL-EP-012 | READY | P0 | 147, 044, contrato MediaViewGrant (097); contrato EL-EP-014 | [EL-TK-150](tickets/EL-TK-150.md) |
| EL-TK-151 | Orquestar intervenciones administrativas mediante contratos propietarios | EL-EP-012 | READY | P0 | 147; contratos propietarios | [EL-TK-151](tickets/EL-TK-151.md) |
| EL-TK-152 | Reutilizar solicitudes, reportes e invitaciones en el detalle administrativo | EL-EP-012 | READY | P0 | 147; contratos EL-EP-001/009/011 | [EL-TK-152](tickets/EL-TK-152.md) |
| EL-TK-153 | Integrar diagnóstico y operaciones de jobs en la consola administrativa | EL-EP-012 | READY | P0 | 148,149 | [EL-TK-153](tickets/EL-TK-153.md) |
| EL-TK-154 | Integrar búsqueda, detalle e intervenciones en la consola administrativa | EL-EP-012 | READY | P0 | 146,147,150..153 | [EL-TK-154](tickets/EL-TK-154.md) |
| EL-TK-155 | Validar soporte e intervención administrativa de extremo a extremo | EL-EP-012 | READY | P0 | 146..154 | [EL-TK-155](tickets/EL-TK-155.md) |
| EL-TK-156 | Registrar intenciones de notificación idempotentes desde hechos de dominio | EL-EP-013 | READY | P0 | contratos de hechos propietarios | [EL-TK-156](tickets/EL-TK-156.md) |
| EL-TK-157 | Encolar y procesar correos de notificación con proveedor desacoplado | EL-EP-013 | READY | P0 | 156, 055; contrato JobQueue | [EL-TK-157](tickets/EL-TK-157.md) |
| EL-TK-158 | Proyectar avisos contextuales vigentes para el panel del organizador | EL-EP-013 | READY | P0 | 156 | [EL-TK-158](tickets/EL-TK-158.md) |
| EL-TK-159 | Generar avisos de lifecycle, gracia y eliminación próxima | EL-EP-013 | READY | P0 | 156; contratos EL-EP-003/015 | [EL-TK-159](tickets/EL-TK-159.md) |
| EL-TK-160 | Generar avisos de capacidad al 80 y 100 por ciento | EL-EP-013 | READY | P0 | 156; contrato 138 | [EL-TK-160](tickets/EL-TK-160.md) |
| EL-TK-161 | Generar avisos de exportación disponible y expiración | EL-EP-013 | READY | P0 | 156; contrato EL-EP-010 | [EL-TK-161](tickets/EL-TK-161.md) |
| EL-TK-162 | Generar avisos de cuenta, seguridad y cambios del evento | EL-EP-013 | READY | P0 | 156; contratos EL-EP-001/003 | [EL-TK-162](tickets/EL-TK-162.md) |
| EL-TK-163 | Generar avisos de denuncias e intervenciones según severidad autorizada | EL-EP-013 | READY | P0 | 156; contratos EL-EP-009/014 | [EL-TK-163](tickets/EL-TK-163.md) |
| EL-TK-164 | Integrar avisos contextuales y plantillas de correo accesibles | EL-EP-013 | READY | P0 | 157..163 | [EL-TK-164](tickets/EL-TK-164.md) |
| EL-TK-165 | Validar notificaciones, deduplicación y obsolescencia de extremo a extremo | EL-EP-013 | READY | P0 | 156..164 | [EL-TK-165](tickets/EL-TK-165.md) |
| EL-TK-166 | Registrar eventos de auditoría mínimos y sanitizados | EL-EP-014 | READY | P0 | ninguna predecesora funcional dura | [EL-TK-166](tickets/EL-TK-166.md) |
| EL-TK-167 | Consultar auditoría contextual con filtros y paginación | EL-EP-014 | READY | P0 | 166 | [EL-TK-167](tickets/EL-TK-167.md) |
| EL-TK-168 | Instrumentar señales operativas sanitizadas de aplicación y dependencias | EL-EP-014 | READY | P0 | ninguna predecesora funcional dura | [EL-TK-168](tickets/EL-TK-168.md) |
| EL-TK-169 | Detectar degradación de JobQueue, workers y procesamiento | EL-EP-014 | READY | P0 | 168; contrato JobQueue | [EL-TK-169](tickets/EL-TK-169.md) |
| EL-TK-170 | Detectar fallos de storage, base de datos, scheduler y disponibilidad | EL-EP-014 | READY | P0 | 168, 184 | [EL-TK-170](tickets/EL-TK-170.md) |
| EL-TK-171 | Ejecutar backups PostgreSQL y retención operativa mínima | EL-EP-014 | READY | P0 | baseline EL-TD-008; DEC-062 | [EL-TK-171](tickets/EL-TK-171.md) |
| EL-TK-172 | Verificar restauración PostgreSQL y objetivos RPO RTO | EL-EP-014 | READY | P0 | 171; contrato EL-EP-015 | [EL-TK-172](tickets/EL-TK-172.md) |
| EL-TK-173 | Registrar y correlacionar incidentes operativos con evidencia mínima | EL-EP-014 | READY | P0 | 166,169,170 | [EL-TK-173](tickets/EL-TK-173.md) |
| EL-TK-174 | Validar backup, recuperación y alertamiento operativo integrado | EL-EP-014 | READY | P0 | 170,171,172 | [EL-TK-174](tickets/EL-TK-174.md) |
| EL-TK-175 | Integrar visor de auditoría contextual en la consola administrativa | EL-EP-014 | READY | P0 | 167; contrato EL-EP-012 | [EL-TK-175](tickets/EL-TK-175.md) |
| EL-TK-176 | Validar auditoría, observabilidad y recuperación de extremo a extremo | EL-EP-014 | READY | P0 | 166..175, 184 | [EL-TK-176](tickets/EL-TK-176.md) |
| EL-TK-184 | Aplicar retención de auditoría y rotación de logs técnicos | EL-EP-014 | READY | P0 | 166, 168 | [EL-TK-184](tickets/EL-TK-184.md) |
| EL-TK-177 | Definir el contrato de métricas agregadas de la Beta | EL-EP-016 | READY | P1 | contratos de dominios propietarios; telemetría 168 | [EL-TK-177](tickets/EL-TK-177.md) |
| EL-TK-178 | Medir confiabilidad de cargas y procesamiento multimedia | EL-EP-016 | READY | P1 | 177; contratos EL-EP-005/006 | [EL-TK-178](tickets/EL-TK-178.md) |
| EL-TK-179 | Medir soporte funcional y recuperación de recuerdos | EL-EP-016 | READY | P1 | 177; contratos EL-EP-010/012, 173 | [EL-TK-179](tickets/EL-TK-179.md) |
| EL-TK-180 | Medir participación indicativa por evento | EL-EP-016 | READY | P1 | 177; contrato EL-EP-004 | [EL-TK-180](tickets/EL-TK-180.md) |
| EL-TK-181 | Gestionar ventana, volumen mínimo y extensión de la evaluación Beta | EL-EP-016 | READY | P1 | 177 | [EL-TK-181](tickets/EL-TK-181.md) |
| EL-TK-182 | Clasificar el resultado de la Beta con prevalencia de incidentes críticos | EL-EP-016 | READY | P1 | 178..181; evidencia operacional EL-EP-014 | [EL-TK-182](tickets/EL-TK-182.md) |
| EL-TK-183 | Generar el informe final reproducible de evaluación Beta | EL-EP-016 | READY | P1 | 177..182 | [EL-TK-183](tickets/EL-TK-183.md) |

**CONFIRMED — 2026-10-10, EL-EP-014/016:** requirements_reviewer y ui_designer aprueban EL-TK-166..176, EL-TK-184 y EL-TK-177..183 como READY; cubren registro mínimo/sanitizado de auditoría, consulta con filtros/paginación, telemetría y health neutrales de proveedor, alertas operativas de colas e infra, backups PostgreSQL diarios con PITR (RPO≤1h/RTO≤4h), verificación de restore periódico con no-resurrección, redundancia/recuperación de ObjectStorage (DEC-062/063), incidentes operacionales, retención de auditoría (12m) y rotación de logs (30d) en EL-TK-184, visor contextual de auditoría en consola administrativa (AuditLogViewer/Detail, UI_REQUIRED: YES, READY_FOR_FRONTEND_PLANNING: YES), validación integrada E2E de EL-EP-014; y métricas agregadas Beta desacopladas a telemetría 168 (cargas válidas, éxito foto/video, latencias, soporte funcional catalogado, descarga, participación indicativa, cohorte real vs pruebas internas), ventana 8..12 semanas / volumen mínimo, snapshot inmutable (182), clasificación y reporte reproducible (183) para EL-EP-016 (UI_REQUIRED: NO, UX_READINESS: NOT_REQUIRED).

**CONFIRMED — 2026-10-10, EL-EP-005:** EL-TK-086..095 aprobados por requirements_reviewer como READY; cubren autorización/reserva atómica vinculada a consentimiento (076) e identidad (077), carga directa a storage privado, confirmación real, validación de restricciones (089 conserva gate técnico PARTIAL para inspección segura de archivos no confiables), aceptación/handoff al contrato downstream transaccional de EL-TK-032 (DONE), retry por archivo, cancelación por policy (DEC-085), consulta de lote, interfaz guest accesible e integración E2E. Implementación conforme a dependencias técnicas y ObjectStorage privado (DEC-063).

**CONFIRMED — 2026-10-10, EL-EP-007:** EL-TK-096..102 aprobados por requirements_reviewer como READY; cubren consulta de galería guest PUBLISHED, grants temporales de derivados privados (DEC-063, desacoplado en EL-TK-097 para consumo guest/owner), biblioteca de media para el organizador con estados de EL-EP-006, integración UI guest (EL-TK-099 con ciclo 099 ↔ 101 resuelto) y organizador conforme al catálogo (§5.20..24/§8.1..4), revalidación server-side (EL-TK-101) y validación integrada E2E. Moderación, retiro y descargas conservan ownership en EL-EP-008, EL-EP-009 y EL-EP-010 respectivamente.

**CONFIRMED — 2026-10-10, EL-EP-008:** EL-TK-103..112 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren aprobación/rechazo/ocultamiento de media, papelera de 7 días (DEC-096), restauración fiel a previous_state sin bypass de moderación/seguridad (DEC-086), entrega a purga al vencer (DEC-086/096, contrato EL-EP-015), cambio de modo de moderación sin impacto retroactivo (DEC-087), integración en OrganizerMediaLibrary y validación E2E. Catálogo UI reutilizado (§8.5..9), sin nuevos componentes.

**CONFIRMED — 2026-10-10, EL-EP-009:** EL-TK-113..123 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren registro de denuncias sin auto-ocultamiento (DEC-088), retiro propio inmediato e irreversible con sesión guest (DEC-089, DEC-097), intake sin sesión con campos mínimos requeridos (DEC-103..105), clasificación de severidad y prioridad, acceso administrativo justificado a media de casos, ocultamiento preventivo administrativo, resolución formal con trazabilidad, consulta de cola/detalle, integración pública y de consola administrativa, y validación integrada E2E. Catálogo UI reutilizado (§5.26..27 y §12.11..15), sin nuevos componentes.

**CONFIRMED — 2026-10-10, EL-EP-010:** EL-TK-124..133 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren autorización de descarga individual de original seguro para organizador (DEC-009/013/075), solicitud de exportación con snapshot fijo de elegibles (DEC-046/090), preparación asíncrona multipartes (~5GB configurable, DEC-047/063/064/079), disponibilidad 48h (DEC-048), invalidación inmediata ante retiro o pérdida de acceso (DEC-090), grants temporales de partes, regeneración/retry autorizado, consulta de estado/partes/progreso real, integración en OrganizerMediaLibrary y validación integrada E2E. Catálogo UI reutilizado (§9.1..8), sin centros paralelos ni componentes nuevos.

**CONFIRMED — 2026-10-10, EL-EP-011:** EL-TK-134..145 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren plan BETA y límites efectivos, consulta de consumo comercial y reservas separadas de almacenamiento operacional (DEC-079), reserva y liberación atómica de capacidad (DEC-080), consolidación en aceptación/purga física, emisión deduplicada de umbrales 80/100%, solicitud de ampliación (DEC-093..095/100..102), respuesta en misma solicitud, revisión administrativa con motivo, aplicación de overrides/retorno al plan base con denegación de vencimiento pasado, integración UI owner y admin y validación integrada E2E. Catálogo UI reutilizado (ui-capacity-lifecycle.md y ui-mvp-epic-review.md §EL-EP-011), sin nuevos componentes.

**CONFIRMED — 2026-10-10, EL-EP-012:** EL-TK-146..155 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren búsqueda administrativa sanitizada sin preview de media, consulta de detalle agregado con estado parcial explícito, consulta y diagnóstico de jobs con errores técnicos sanitizados (DEC-061..064), comandos autorizados sobre jobs (retry/cancel/marcar no repetir), acceso multimedia administrativo condicionado a razón operativa registrada (DEC-019/020), orquestación de intervenciones mediante delegación a contratos propietarios sin bypass de reglas de dominio, integración UI en consola administrativa y validación integrada E2E. Catálogo UI reutilizado (ui-mvp-epic-review.md §EL-EP-012), sin consola paralela ni nuevos componentes.

**CONFIRMED — 2026-10-10, EL-EP-013:** EL-TK-156..165 aprobados por requirements_reviewer y validados desde UI/UX como READY; cubren persistencia de NotificationIntent idempotente desde hechos confirmados, procesamiento asíncrono de emails con proveedor desacoplado mediante JobQueue durable (DEC-021, DEC-061..064), proyección de avisos contextuales vigentes en panel sin duplicados ni avisos obsoletos, generación de avisos de lifecycle/gracia/eliminación próxima, capacidad 80/100%, exportación disponible/expirada, cuenta/seguridad/cambios, denuncias e intervenciones según severidad, integración UI de avisos y plantillas accesibles y validación integrada E2E. Catálogo UI reutilizado (ui-mvp-epic-review.md §EL-EP-013), sin NotificationCenter obligatorio ni nuevos componentes.

**HISTÓRICO CONFIRMED:** EL-TK-005..019 sustituyeron la descomposición anterior y quedaron READY el 2026-10-07. [Dictamen](sessions/2026-10-07-el-ep-001-ticket-redesign-review.md). **CONFIRMED — 2026-10-08:** la remediación autorizada de EL-TK-005..019 y EL-TK-043..046 fue APPROVED; los 19 activos están READY de requisitos. READY_FOR_IMPLEMENTATION: PARTIAL; YES sólo para 008 backend, 043 provisión operativa y 046 integración del puerto MOD-001, con los límites del [dictamen final](sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). La UI de EL-EP-001 sigue con gate PARTIAL: no se generan tickets frontend.

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó el gate final de EL-EP-002. EL-TK-020..031 estaban READY, sin hallazgos pendientes. READY_FOR_IMPLEMENTATION: YES en aquel snapshot. [Dictamen final](sessions/2026-10-07-el-ep-002-ticket-final-review.md). El dictamen PARTIAL previo se conserva como histórico. No se modifica lifecycle ni acceso publicado de otras épicas.

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó EL-TK-032..042, todos READY y sin hallazgos pendientes en aquel snapshot. READY_FOR_IMPLEMENTATION: YES histórico. [Dictamen](sessions/2026-10-07-el-ep-006-ticket-review.md). No se implementó ni avanzó a otra épica.

**CONFIRMED — 2026-10-08, EL-EP-002:** remediación APPROVED; 11 tickets actualizados 020..025/027..031 y seis nuevos 047..052, total 17 activos READY de requisitos. REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: PARTIAL (16 YES; 025 NO por gate administrativo044 PENDING). 026 SUPERSEDED histórico, sustituido por049..052. UI002 conserva frontend YES. [Dictamen final](sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). [Sesión](sessions/2026-10-08-el-ep-002-ticket-remediation.md).

**CONFIRMED — 2026-10-08, EL-EP-006:** remediación APPROVED de nueve existentes032/033/035/036/037/038/040/041/042 y seis nuevos053..058;034/039 VALID KEEP intactos. Total17 READY de requisitos; REQUIREMENTS_READY:YES; READY_FOR_IMPLEMENTATION:PARTIAL con7 gates técnicos localizados. UI006 YES. [Dictamen final](sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). [Sesión](sessions/2026-10-08-el-ep-006-ticket-remediation.md).

**HISTÓRICO CONFIRMED — paquete TB-01..05 ratificado (previo a ejecución/adopción):** ocho owners033/035/036/041/042/044/056/058 y tres nuevos059..061, once READY de requisitos tras [dictamen final APPROVED](sessions/2026-10-08-technical-blockers-ticket-review.md). REQUIREMENTS_READY:YES; READY_FOR_IMPLEMENTATION:PARTIAL (044/059YES propio,otros9NO full con scopes preparatorios habilitados). Dictámenes previos de001/006 conservan historia; el paquete sólo actualiza estos scopes. TB-03 contrato APPROVED, auth aún no implementada. PREPARATORY_SCOPE_READY/BLOCKED_SCOPE/BLOCKED_BY en cada owner;059 mínimo YES para implementación propia,060/061 NO hasta entorno real/PASS requerido. [Fuente ratificada](sessions/2026-10-08-technical-blockers-approved-contracts.md), [sesión del paquete](sessions/2026-10-08-technical-blockers-ticket-integration.md). No spikes ejecutados ni PASS declarados.

**CONFIRMED — EL-TK-035 DONE, 2026-10-10:** candidatos fotográficos privados con rendiciones ARCH-015 implementados. Suite enfocada PASS 60/60; regresión combinada PASS 139/139; EL-TK-056 PASS 21/21; typecheck/build/migraciones y reviewers PASS. Véase el [cierre del ticket](tickets/EL-TK-035.md) y [evidencia](../../infra/validation/media-inspection/README.md#el-tk-035-photo-derivatives-final-validation). La dependencia 033→035 queda satisfecha; 037 aún depende de 036. Gates MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen NOT_EVALUATED; no se selecciona storage definitivo.

**CONFIRMED — 2026-10-10, EL-EP-003:** requirements_reviewer aprobó el quality gate de EL-TK-062..073; los 12 tickets están READY de requisitos. REQUIREMENTS_READY: YES; READY_FOR_IMPLEMENTATION: PARTIAL (sujeto a contratos técnicos y dependencias de EL-EP-011/015 y auth administrativa EL-TK-044). [Dictamen](sessions/2026-10-10-el-ep-003-ticket-review.md).

**DRAFT — 2026-10-10, EL-EP-004:** ticket_writer descompuso acceso guest en EL-TK-074..083. Los 10 tickets permanecen DRAFT hasta requirements_reviewer; no implican implementación ni cierre de dependencias de EL-EP-003/009. GitHub Issues se crearán sólo cuando este cambio llegue a main mediante el workflow de sincronización.

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

**HISTÓRICO — cierre de EL-TK-033, 2026-10-09 hora local:** el tester independiente reportó 46/46 PASS (32 integración PostgreSQL real y 14 unitarias); regresiones 055: 25/25 y 056: 21/21 PASS. El manifest de 29 archivos coincide con el código revisado. Véase [cierre y evidencia](tickets/EL-TK-033.md#cierre-de-implementación--2026-10-09-hora-local). Se preservan sus aristas downstream; completar 033 no aprueba automáticamente readiness de 034/035/036/039/040. MEDIA-001/CAP-001/DR-001/EXPORT-001 permanecen NOT_EVALUATED; almacenamiento definitivo sigue DEFERRED. En aquel cierre, el siguiente candidato por prioridad P0 y dependencia era EL-TK-034; su cierre actual se registra a continuación.

**CONFIRMED — EL-TK-034 DONE, 2026-10-10:** tester independiente PASS 79/79 en inspección y cuarentena; corrida específica de cuarentena PASS 33/33; regresión job-queue PASS 25/25. Typecheck, build, pruebas PostgreSQL 16 real y MinIO de laboratorio, manifiesto de fuentes y migración común 007: PASS. Reviewer y critical_review aprobados sin hallazgos. Véase [cierre del ticket](tickets/EL-TK-034.md) y [evidencia](../../infra/validation/media-inspection/README.md#el-tk-034-quarantine-evidence-final). Se satisface la arista 033→034; las aristas 034→041/042 permanecen sin cambios y no se recalcula readiness de esos tickets. Gating MEDIA-001/CAP-001/DR-001/EXPORT-001 sigue NOT_EVALUATED; adapter durable productivo de RecoveryAuthority pendiente y storage definitivo DEFERRED. No se ejecuta otro ticket.

**CONFIRMED — EL-TK-036 DONE, 2026-10-10:** tester y reviewer aprobaron la implementación. Corridas: video enfocada 60/60, regresión combinada 199/199 (conserva marcador EL-TK-033) y runtime EL-TK-056 21/21; se verificaron 18/18 hashes de fuentes, digest de imagen coincidente y 9 migraciones únicas con hashes de origen/copia coincidentes. Véase el [cierre](tickets/EL-TK-036.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-036-final-validation). Quedan satisfechas las dependencias 035/036 de EL-TK-037, que continúa READY y no fue ejecutado. Los gates MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen NOT_EVALUATED; almacenamiento definitivo DEFERRED.

**CONFIRMED — EL-TK-037 DONE, 2026-10-10:** tester y reviewer aprobaron la implementación de promoción atómica CAS. Corridas: enfocada 63/63, regresión combinada media-inspection 262/262 y runtime EL-TK-056 21/21; typecheck, build y migraciones repetidas PASS. Véase el [cierre](tickets/EL-TK-037.md) y la [evidencia](../../infra/validation/media-inspection/README.md#el-tk-037-successful-processing-final-validation). Queda satisfecha la dependencia de EL-TK-057 y consumidores de galería de EL-EP-007. Gates MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen NOT_EVALUATED; almacenamiento definitivo DEFERRED.

**CONFIRMED — EL-TK-043 DONE, 2026-10-11:** provisión administrativa inicial y posterior gobernada por MOD-001 implementada en `@eventlens/identity`. Procedimiento de bootstrap único deshabilitado permanentemente tras su consumo, alta posterior autorizada, guardia de elevación pública y auditoría con cero secretos. Suite 18/18 PASS (12 unitarias y 6 de integración contra PostgreSQL 16 real). Véase el [cierre](tickets/EL-TK-043.md) y la [evidencia](../../infra/validation/identity/README.md).

**CONFIRMED — EL-TK-044 DONE, 2026-10-11:** autenticación de principal administrativo y ciclo de vida de sesiones implementado en `@eventlens/identity` conforme a TB-03, ARCH-013 y AQR-003. Verificación SHA-256 de secreto de 256 bits con separación de propósito/sujeto, comparación constante y dummy para desconocidos; salida neutral uniforme; emisión de token y cookie `__Host-el_admin_session` sin fixation; expiración 8h absoluta y 30m idle con toque monótono no extensible; reautenticación con rotación de token, invalidación del previo y `auth_time <= 5 min` para operaciones sensibles; emisión de `AdminActorContext` (`ADMIN_HUMAN`) sin grants de MOD-007 prefijados; integración con RecoveryAuthority (PREPARE → SQL → ACK). Suite total de identity 35/35 PASS (17 específicas de EL-TK-044: 13 unitarias y 4 de integración contra PostgreSQL 16 real). Véase el [cierre](tickets/EL-TK-044.md) y la [evidencia](../../infra/validation/identity/README.md).

