# EL-TK-027 — Establecer el PIN inicial de un borrador

## Parent epic

EL-EP-002

## Status

DONE (2026-10-11)


**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este ticket sin hallazgos pendientes. Véase [dictamen final](../sessions/2026-10-07-el-ep-002-ticket-final-review.md). READY conserva las dependencias de ejecución.

## User story

**Como** organizador propietario, **quiero** establecer el PIN inicial de mi borrador, **para** dejar preparada su protección adicional antes de publicar.

## Criterios de aceptación

**Dado** un DRAFT propio sin PIN y una cadena que cumple exactamente `[0-9]{6}`, incluidos ceros a la izquierda, **cuando** lo establece por primera vez, **entonces** queda habilitado para configuración futura de acceso y no vuelve a mostrarse. Actor ajeno, letras, espacios, especiales, longitud distinta o intento de sustituir/desactivar un PIN ya establecido no modifica la configuración; estos últimos comportamientos pertenecen a EL-EP-004.

## Validaciones y permisos

Solo propietario de DRAFT. No emite, modifica ni revoca acceso, enlace o QR; esos comportamientos pertenecen a EL-EP-004.

## Datos / contratos afectados

Estado de PIN y credencial protegida sin texto plano. La entrada se trata como cadena para preservar ceros a la izquierda; nunca exponerla en auditoría, logs, eventos, lectura ni devolverla tras guardarla.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** ninguno.
- **can_parallelize_with:** otros comandos de configuración sobre contratos definidos; conflictos de revisión se serializan.

## Pruebas requeridas

Establecimiento válido, validación, aislamiento y ausencia de emisión de acceso.

## Observabilidad / auditoría

Registrar activación sin PIN ni secreto.

## Prioridad / estimación

P0 / S

## Traceability

Q-006, Q-037, Q-038; DEC-004, DEC-072, DEC-073; EL-EP-002, EL-EP-004.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final de 2026-10-08:** remediación APPROVED; READY del 2026-10-07 permanece histórico. Hereda el handoff [EL-EP-002](../../context/ui-mvp-epic-review.md#el-ep-002), su contrato común y EL-TD-001..007 sin seleccionar librerías/CSS/iconos.

### Confirmación y conflictos de escritura
**Dado** actor vigente autorizado y revisión esperada, **cuando** guarda esta acción, **entonces** el servidor valida owner/estado/barreras y confirma cambio, recibo de idempotencia y auditoría/jobs pertinentes en una transacción SQL; rollback no conserva cambio ni intención parcial. Replay compatible devuelve el mismo efecto/recibo; misma clave con payload distinto o revisión obsoleta da conflicto sin sobrescribir. La UI sólo anuncia éxito de esta sección tras confirmación, nunca el guardado de otra.

### Interacción y accesibilidad
EventAccessSettings/PinInput consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

### PIN inicial concurrente y recuperación
**Dado** DRAFT sin PIN y dos primeras escrituras válidas concurrentes, **cuando** compiten, **entonces** sólo una confirma el PIN/revisión; la otra recibe recibo compatible si es replay o conflicto si es intención distinta, sin sustituir el ganador. Nunca devolver ni registrar PIN/hash en DTO, auditoría, eventos o logs.

MOD-002 integra su cambio de revisión/policy de PIN con el puerto `RecoveryAuthority`: PREPARE externo → SQL corto con recibo/auditoría → ACK; éxito sólo tras ACK. ACK incierto conserva barrera fail-closed; retry conserva operationId. PITR a antes del cambio no rehabilita PIN/revisión anterior: checkpoint/facts/epoch íntegros antes de liberar scope. No construye adapter/authority compartida ni usa EL-TK-046 (owner MOD-001) como implementación MOD-002. PG real prueba ganador único y rollback; simulación de puerto/crash antes SQL/después commit/antes ACK y PITR/gap prueban no autorización obsoleta.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.

## Implementación y Verificación — 2026-10-11
- Implementado método `EventDraftService.setInitialPin(command: SetInitialPinCommand)` en `@eventlens/event-management`.
- Reglas verificadas:
  - Formato estricto per DEC-073: exactamente 6 dígitos numéricos (`^[0-9]{6}$`), preservando ceros a la izquierda (`"001234"`). Cualquier otro carácter, espacio o longitud se rechaza con `INVALID_PIN_FORMAT`.
  - Cero exposición per DEC-004: hasheo criptográfico con salt mediante `scryptSync`, sin exponer PIN ni hash en auditoría, logs ni en el `EventRecord` retornado.
  - Aislamiento de propietario: solo el organizador creador puede configurar el PIN (`UNAUTHORIZED` si es ajeno).
  - Estado: restringido estrictamente a `DRAFT` (`EVENT_NOT_IN_DRAFT`).
  - Límite per DEC-072: intentos de modificar o cambiar un PIN inicial ya configurado se rechazan con `PIN_ALREADY_CONFIGURED` (la gestión posterior corresponde a EL-EP-004).
  - Concurrencia e idempotencia: serialización pesimista bajo `SELECT ... FOR UPDATE`, ganador único ante carreras concurrentes y replay limpio para llamadas idénticas.
- Validación en contenedor Docker oficial (`infra/validation/event-management/run.mjs`) con PostgreSQL 16: 115 tests PASS.

