# EL-TK-024 — Cambiar la zona horaria de un evento preparado

## Parent epic

EL-EP-002

## Status

DONE

**COMPLETADO — 2026-10-12:** Implementado en `EventDraftService.changeTimezone` en `@eventlens/event-management`. Valida propiedad exclusiva del organizador, estados DRAFT y SCHEDULED (bloquea eventos que ya alcanzaron ACTIVE), validación de zona IANA, conservación estricta de hora local (`starts_at_local`), recálculo determinista de UTC (`scheduled_at`), rechazo de horas inexistentes por DST (`DST_GAP_TIME`) sin mutar el evento, exigencia de offset explícito en solapamiento ambiguo (`AMBIGUOUS_LOCAL_TIME`), emisión de advertencia `warning: 'RECALCULATED_SCHEDULE'` en SCHEDULED, idempotencia transaccional y auditoría inmutable (`EVENT_TIMEZONE_CHANGED`). Verificado con pruebas unitarias y de integración contra PostgreSQL 16 real.

## User story

**Como** organizador propietario, **quiero** cambiar la zona IANA de mi evento DRAFT o SCHEDULED, **para** ajustar su preparación a la hora local correcta.

## Criterios de aceptación

**Dado** un evento propio DRAFT o SCHEDULED y zona IANA válida, **cuando** la cambia, **entonces** conserva la fecha/hora local y recalcula UTC. Si hay hora DST inexistente se rechaza sin cambio; si es repetida exige offset elegido válido. **Dado** SCHEDULED, **cuando** inicia el cambio, **entonces** ve advertencia de recálculo. Un DRAFT sin fecha cambia solo su TZ. **Dado** zona inválida o evento que ya alcanzó ACTIVE, **cuando** intenta cambiarla, **entonces** no se modifica.

## Validaciones y permisos

Solo propietario en DRAFT/SCHEDULED. No ejecuta apertura, vencimiento ni su recálculo: pertenecen a EL-EP-003.

## Datos / contratos afectados

Zona IANA, inicio local e instante UTC; no expiración ni transiciones.

## Dependencias de tickets

- **depends_on:** EL-TK-020, EL-TK-023.
- **blocks:** ninguno.
- **can_parallelize_with:** otros comandos de configuración sobre contratos definidos; conflictos de revisión se serializan.

## Pruebas requeridas

TZ válida/inválida, conservación de hora local, advertencia SCHEDULED y bloqueo tras haber alcanzado ACTIVE.

## Observabilidad / auditoría

Auditar actor, evento, TZ anterior/nueva y resultado.

## Prioridad / estimación

P0 / S

## Traceability

Q-015, Q-022, Q-035; DEC-017, DEC-035, DEC-036, DEC-058, DEC-070; EL-EP-002, EL-EP-003.

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
EventScheduleForm/TimezoneSelect consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

### Integración temporal de preparación
**Dado** cambio válido anterior a ACTIVE permitido por esta acción, **cuando** se guarda inicio/TZ, **entonces** coordina con `RecalculateSchedule` propietario de EL-EP-003/MOD-002 mediante revisión/transacción y contrato acordado, de forma que el calendario no queda obsoleto. DEC-077 recalcula vencimiento desde el ancla y DEC-082 usa N×24h; EL-EP-002 no implementa cálculo ni transiciones ni extiende los estados editables del ticket. DRAFT sin inicio no inventa vencimiento.

Fecha/TZ/offset se muestran textuales; DST inexistente rechaza sin cambio y repetida exige offset explícito. SCHEDULED muestra advertencia de recálculo conservando hora local. Pruebas de contrato con puerto de EL-EP-003, DST y conflicto concurrente prueban que no se confirma configuración con programación de revisión anterior.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
