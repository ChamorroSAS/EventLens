# EL-TK-025 — Corregir la zona horaria de un evento que alcanzó ACTIVE

## Parent epic

EL-EP-002

## Status

READY

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer declaró este ticket implementable, sin hallazgos pendientes. Se conservan sus dependencias de ejecución. Véase [dictamen](../sessions/2026-10-07-el-ep-002-ticket-review.md).

## User story

**Como** administrador autorizado, **quiero** corregir justificadamente la zona horaria de un evento que alcanzó ACTIVE, **para** resolver una excepción sin permitir edición ordinaria del organizador.

## Criterios de aceptación

**Dado** un evento no DELETED que alcanzó ACTIVE, zona IANA válida y justificación, **cuando** un administrador corrige TZ, **entonces** conserva fecha/hora local, recalcula UTC y queda auditado. Hora DST inexistente se rechaza sin cambio; una repetida exige offset elegido válido. **Dado** actor no administrador, justificación ausente o TZ inválida, **cuando** intenta corregir, **entonces** no modifica el evento.

## Validaciones y permisos

Solo administración autorizada con justificación. Requiere el contrato de estado de EL-EP-003; no ejecuta lifecycle ni recalcula vencimiento.

## Datos / contratos afectados

Zona, inicio local, UTC, justificación y evidencia de corrección.

## Dependencias de tickets

- **depends_on:** EL-TK-020, EL-TK-023, EL-TK-044.
- **blocks:** ninguno.
- **can_parallelize_with:** preparación del contrato MOD-007 y EL-EP-003; ejecución sensible respeta EL-TK-044.

## Pruebas requeridas

Autorización, justificación, TZ válida, auditoría y no modificación ante rechazo.

## Observabilidad / auditoría

Registrar actor, evento, valores anterior/nuevo, justificación y resultado.

## Prioridad / estimación

P0 / S

## Traceability

Q-015, Q-022, Q-035; DEC-017, DEC-019, DEC-035, DEC-036, DEC-070; EL-EP-002, EL-EP-003, EL-EP-014.

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
AdministrativeActionReason y EventScheduleForm administrativo consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

### Intervención administrativa vigente
**Dado** ActorContext administrativo vigente de EL-TK-044 y grant MOD-007 específico de recurso/acción/motivo, **cuando** corrige TZ con revisión esperada, **entonces** MOD-002 autoriza y registra actor, grant, motivo y valores sin escritura directa desde MOD-007. Identidad sola, grant revocado/ajeno/expirado o motivo ausente no cambia el evento. RecoveryAuthority/epoch y barreras se validan por puertos; identidad administrativa técnica PENDING se conserva como gate, no se resuelve aquí.

La coordinación con `RecalculateSchedule` de EL-EP-003 informa la corrección y conserva su política post-ACTIVE: no recalcula silenciosamente vencimiento/gracia ni deadlines de borrado. No ejecuta lifecycle. Pruebas API/PG de grant y conflicto, Vitest de policy temporal y PITR anterior a revocación prueban que una identidad/grant restaurados no autorizan.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). Gate técnico de credenciales/sesiones administrativas EL-TK-044 PENDING; grant MOD-007 identificado.
