# EL-TK-191 — Solicitar eliminación de cuenta con reautenticación y suspensión global

## Parent epic
EL-EP-015

## Status
READY

## User story
**Como** organizador, **quiero** solicitar borrar su cuenta tras reautenticar, **para** impedir nuevas operaciones y cerrar acceso público de sus eventos.

## Alcance funcional
Comando owner account deletion consume evidencia MOD-001 atómicamente, solicita eliminación con ventana de siete días, bloquea creación de eventos y acceso público de hijos; MOD-001 emite/valida la sesión de consulta/cancelación restringida después de ACK confirmado; barreras PREPARE/ACK. MOD-008 no crea otra identidad ni sesión.

## Fuera de alcance
No reemplaza verifier MOD-001 ni crea nueva ventana de 72h para eventos hijos.

## Criterios de aceptación
### Escenario 1
Dada evidencia válida y confirmación, cuando solicita, entonces cuenta queda pendiente 7d, todos los eventos pierden acceso público y solo consulta/cancelación permitidas.

### Escenario 2
Dada evidencia ajena, expirada o consumida para una operación nueva/incompatible, cuando intenta, entonces se rechaza sin request ni reactivación. Para el replay exacto de la misma operación/payload/Idempotency-Key, tras autenticación y ownership actuales se consulta primero el receipt compatible, incluso si la prueba ya fue consumida o venció; no se repite el efecto ni el consumo. PREPARE/ACK incierto requiere reconciliar la misma operación sin inferir éxito.

### Escenario 3
Dada cuenta con eventos cerrados/suspendidos, cuando solicita, entonces conserva restricciones y no desplaza plazos anteriores.

## Reglas de negocio
Se fija cancelUntil +7 días para cuenta; expiración inicia purga de hijos sin ventana adicional de evento.

## Validaciones y permisos
Owner con credencial vigente y prueba ligada a operation/account/revision/sesión; IDOR/CSRF.

## Casos de error y estados vacíos
Reauth inválida, request duplicado, autoridad indeterminada, sesiones revocadas.

## Datos / contratos afectados
MOD-001 consume evidence; MOD-008 account request; MOD-002 eventos; RecoveryAuthority barriers.

## Dependencias técnicas y funcionales
EL-TK-186, EL-TK-188; EP001 sesión restringida.

## Dependencias de tickets
- **depends_on:** EL-TK-186, EL-TK-188; EP001 sesión restringida.
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Tests PostgreSQL16, reauth one-use en mismo comando, hijos múltiples, PREPARE/SQL/ACK y fallo email.

## Observabilidad / auditoría
Solo resultado/correlationId y actor minimizados; no proof ni credencial.

## Prioridad / estimación
P0 / L

## Traceability
DEC-044/091/092/107/108; ARCH-017/018; EL-EP-001/015

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER de producto

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — dictámenes individuales architect y requirements_reviewer APPROVED.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED — dictamen ui_designer; sin diseño de UI nueva.
REVIEW_STATUS: APPROVED — [dictámenes formales y validación documental](../sessions/2026-10-12-el-ep-015-ticket-readiness.md).

Histórico: DRAFT en la propuesta original; READY tras revisión individual del 2026-10-12. No acredita implementación, ejecución de pruebas ni PASS de validation gates.
