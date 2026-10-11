# Capacity Management: MOD-006

`@eventlens/capacity-management` implementa la frontera de MOD-006 (Gestión comercial de capacidad, planes, límites y vigencia del evento) conforme a `EL-EP-011`, `DEC-011`, `DEC-020`, `DEC-026`, `DEC-027`, `DEC-079`, `DEC-080`, `DEC-082`, `DEC-095`, `DEC-100` y `DEC-102`.

## Capabilities

### 1. Asignar y resolver plan BETA y límites efectivos (EL-TK-134)
- **Plan base BETA (MVP)**:
  - Almacenamiento comercial: 10 GB decimales = `10.000.000.000` bytes (DEC-079).
  - Cantidad de archivos: 1500 archivos por evento (DEC-011).
  - Tamaño máximo de foto: 25 MB decimales = `25.000.000` bytes.
  - Tamaño máximo de video: 500 MB decimales = `500.000.000` bytes.
  - Duración máxima de video: 300 segundos (5 minutos).
  - Vigencia: 30 días calendario por defecto (exactas 24 horas por día, DEC-082).
- **Overrides administrativos independientes (DEC-027, DEC-095)**:
  - Los overrides son independientes del plan base y nunca mutan el registro canónico de `plan`.
  - Exigen contexto administrativo activo (`AdminActorContext` con `actorType: 'ADMIN_HUMAN'`).
  - Exigen motivo obligatorio no vacío (`reason`, DEC-020, DEC-095).
  - Permiten ajustar almacenamiento comercial, cantidad máxima de archivos y vigencia total.
- **Resolución determinista de límites efectivos (`resolveEffectiveLimits`)**:
  - Combina plan base y override activo más reciente (`isOverrideActive: true`, `activeOverrideId`).
  - Si no existe override activo, devuelve exactamente el plan base (`isOverrideActive: false`).
- **Retorno al plan base y guardas temporales (`removeOverride`, DEC-102)**:
  - Marca el override como `REMOVED` y reestablece los límites del plan base.
  - **Guarda DEC-102**: Después de que el evento alcanza estado `ACTIVE`, se bloquean reducciones de vigencia o retornos al plan base que dejen la fecha de vencimiento resultante en el pasado (`CANNOT_REDUCE_BELOW_PAST_EXPIRATION`).
- **Auditoría append-only**:
  - Emite eventos auditables en `admin_audit_event` para `PLAN_ASSIGNED`, `PLAN_OVERRIDE_APPLIED` y `PLAN_OVERRIDE_REMOVED` sin secretos.

### 2. Reserva y liberación atómica de capacidad (EL-TK-136)
- **Contrato de reserva consumido por uploads (`reserveCapacity`, DEC-080)**:
  - Compromete bytes y cupos de archivo (`fileSlots`) de forma estrictamente atómica en PostgreSQL.
  - Bloqueo y serialización a nivel de fila (`event_capacity_balance FOR UPDATE`) para evitar sobreasignación bajo alta concurrencia de cargas simultáneas.
  - Valida límites de almacenamiento general (`storageBytes`), cupos máximos de archivos (`maxFiles`) y tamaños individuales (`maxPhotoBytes`, `maxVideoBytes`).
  - Idempotencia por `(eventId, idempotencyKey)`: peticiones repetidas con idénticos parámetros retornan la reserva existente sin duplicar cupo ni descontar bytes extra (`isExisting: true`).
- **Liberación idempotente de cancelaciones (`releaseReservation`)**:
  - Reconcilia intentos cancelados o vencidos marcando la reserva como `RELEASED` con motivo auditable.
  - Idempotencia garantizada: reintentos de liberación sobre reservas ya canceladas son inocuos y seguros (no generan doble liberación ni errores espurios).
- **Consolidación de cuota (`commitReservation`)**:
  - Transiciona reservas de `ACTIVE` a `COMMITTED` al confirmar archivos originales aceptados, transfiriendo atómicamente el saldo a consumo firme en `event_capacity_balance`.
- **Preservación ante reducción de límites (DEC-080)**:
  - Si un override posterior reduce la cuota por debajo del total en uso y reservas, las reservas preexistentes se respetan sin eliminación de archivos, bloqueando únicamente nuevas reservas hasta que vuelva a haber margen disponible.
- **Consulta de capacidad (`getCapacitySnapshot`)**:
  - Devuelve snapshot consistente con límites efectivos, consumo firme, reservas activas y balance disponible.

## Validation

La implementación cuenta con una suite completa de pruebas:
- Pruebas unitarias: `test/capacity-plan.unit.test.ts` (6 tests) y `test/capacity-reservation.unit.test.ts` (7 tests).
- Pruebas de integración PostgreSQL 16 real: `test/capacity-plan.integration.test.ts` (3 tests) y `test/capacity-reservation.integration.test.ts` (3 tests).
- Total: 19/19 tests pasando con 100% de éxito.

Evidencia reproducible disponible en `infra/validation/capacity-management`.
