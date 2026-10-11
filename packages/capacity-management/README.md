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

## Validation

La implementación cuenta con una suite completa de pruebas:
- Pruebas unitarias: `test/capacity-plan.unit.test.ts` (6 tests)
- Pruebas de integración PostgreSQL 16 real: `test/capacity-plan.integration.test.ts` (3 tests)

Evidencia reproducible disponible en `infra/validation/capacity-management`.
