# EL-TK-186 — Emitir y consumir evidencia de reautenticación sensible de cuenta

## Parent epic
EL-EP-001

## Status
READY

## User story
**Como** organizador, **quiero** reautenticar una operación específica sobre su cuenta, **para** autorizar solicitud/cancelación sin nuevos mecanismos de login.

## Alcance funcional
Implementar challenge/verify/consume de MOD-001; evidencia ligada a sesión, operación, accountId, revision/intentionHash; autenticación restringida durante eliminación pendiente. El [contrato aprobado de reautenticación](../../context/account-reauthentication-contract.md) es normativo para binding servidor, expiración/invalidación, consumo/rollback, replay, errores públicos y OpenAPI; no se implementa la variante UI de EL-TK-201.

## Fuera de alcance
No ejecuta comandos de eliminación MOD-008 ni sustituye contraseña con token por correo.

## Criterios de aceptación
### Escenario 1
Dado challenge válido, cuando se verifica credencial vigente, entonces se emite evidencia opaca de un solo uso válida ≤5 minutos.

### Escenario 2
Dada evidencia usada, expirada, de otra sesión/recurso/operación/revisión, cuando se intenta consumir para un efecto nuevo o incompatible, entonces se deniega sin estado mutado. El consumidor recupera el receipt del replay exacto autenticado y autorizado antes de exigir una prueba nueva, aun si la original fue consumida o venció, sin repetir efectos ni consumo; PREPARE/ACK incierto se reconcilia según el contrato aprobado.

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
EL-TK-185, EL-TK-013, EL-TK-014, EL-TK-046 para verifier/contexto de sesión/RecoveryAuthority; recuperación018/019 se reutiliza cuando corresponda, sin convertir un reset en requisito del challenge. La exposición exige el verifier/cutover y pruebas de185; SHA humano no acredita la reautenticación nueva.

## Dependencias de tickets
- **depends_on:** EL-TK-185, EL-TK-013, EL-TK-014, EL-TK-046.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
PostgreSQL real consumo concurrente/rollback, caducidad/revisión, login restringido, Origin/CSRF y OpenAPI. La variante UI y su integración Playwright pertenecen a EL-TK-201; aquí se verifica el contrato consumido por esa integración, sin implementar otra variante.

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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — architect y requirements_reviewer APPROVED individualmente.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO — correctivo backend; ui_designer confirma delimitación sin nueva UI.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED.
REVIEW_STATUS: APPROVED — [dictámenes formales185..187](../sessions/2026-10-12-el-tk-185-187-readiness.md).

Histórico: DRAFT en la propuesta original y fuera de la revisión188..202; READY tras revisión individual del 2026-10-12. No acredita implementación, pruebas, migración/cutover ni validation gates PASS.
