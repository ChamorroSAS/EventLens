# EL-TK-021 — Cambiar el nombre de un borrador

## Parent epic

EL-EP-002

## Status

DONE

**COMPLETADO — 2026-10-12:** Implementado en `EventDraftService.updateDraftName` en `@eventlens/event-management`. Valida propiedad exclusiva del organizador, estado DRAFT obligatorio, longitud [1, 120] caracteres tras trim, idempotencia persistente y auditoría inmutable (`EVENT_DRAFT_NAME_UPDATED`). Verificado con pruebas unitarias y de integración en PostgreSQL 16.

## User story

**Como** organizador propietario, **quiero** cambiar el nombre de mi borrador, **para** identificar correctamente mi evento.

## Criterios de aceptación

**Dado** un DRAFT propio y un nombre válido, **cuando** lo actualiza, **entonces** el nombre nuevo se conserva. **Dado** nombre inválido o evento ajeno, **cuando** lo intenta, **entonces** no cambia el evento y recibe error apropiado.

## Validaciones y permisos

Solo propietario; no modifica fecha/hora, bienvenida, portada ni acceso.

## Datos / contratos afectados

Nombre y timestamp de actualización del evento.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** ninguno.
- **can_parallelize_with:** otros comandos de configuración sobre contratos definidos; conflictos de revisión se serializan.

## Pruebas requeridas

Actualización válida, validación e intento de otro organizador.

## Observabilidad / auditoría

Auditar actor, evento y resultado.

## Prioridad / estimación

P0 / S

## Traceability

Q-004, Q-034; DEC-069; EL-EP-002.

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
EventBasicInfoForm consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
