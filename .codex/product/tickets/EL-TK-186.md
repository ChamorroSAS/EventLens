# EL-TK-186 — Emitir y consumir evidencia de reautenticación sensible de cuenta

## Parent epic
EL-EP-001

## Status
DRAFT

## User story
**Como** organizador, **quiero** reautenticar una operación específica sobre su cuenta, **para** autorizar solicitud/cancelación sin nuevos mecanismos de login.

## Alcance funcional
Implementar challenge/verify/consume de MOD-001; evidencia ligada a sesión, operación, accountId, revision/intentionHash; autenticación restringida durante eliminación pendiente.

## Fuera de alcance
No ejecuta comandos de eliminación MOD-008 ni sustituye contraseña con token por correo.

## Criterios de aceptación
### Escenario 1
Dado challenge válido, cuando se verifica credencial vigente, entonces se emite evidencia opaca de un solo uso válida ≤5 minutos.

### Escenario 2
Dada evidencia usada, expirada, de otra sesión/recurso/operación/revisión, cuando se consume, entonces se deniega sin estado mutado.

### Escenario 3
Dada cuenta pendiente, cuando inicia sesión propia, entonces solo accede a consulta y cancelación autorizada, sin crear eventos ni reactivar capacidades.

## Reglas de negocio
Challenge y evidence ≤5 minutos por reloj servidor; consumo exactamente una vez unido al comando SQL/authority; los estados UNKNOWN no revalidan evidencia consumida.

## Validaciones y permisos
Solo owner con sesión/credencial actual; rate limit compartido, CSRF/Origin, auditoría minimizada.

## Casos de error y estados vacíos
401/403/409/429 y 503 sanitizados, ACK incierto, doble submit, replay, renovación de sesión.

## Datos / contratos afectados
Operaciones OpenAPI beginAccountReauthentication/verifyAccountReauthentication y proof ownership MOD-001.

## Dependencias técnicas y funcionales
EL-TK-185; EL-TK-013/014 y recuperación 018/019 se reutilizan.

## Dependencias de tickets
- **depends_on:** EL-TK-185; EL-TK-013/014 y recuperación 018/019 se reutilizan.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
PostgreSQL real consumo concurrente/rollback, caducidad/revisión, login restringido, Origin/CSRF, OpenAPI, Playwright mínimo de variante UI.

## Observabilidad / auditoría
Auditar operationId y resultado sin credencial/evidencia/challenge reutilizable.

## Prioridad / estimación
P0 / L

## Traceability
DEC-107/108; ARCH-017/018; EL-EP-001, EL-EP-015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación propuesto
REQUIREMENTS_READY: YES (contratos aceptados, pendiente revisión formal del ticket).
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
REVIEW_STATUS: PENDING — propuesta documental sin prueba ejecutada ni dictamen automatizado de requirements_reviewer.
