# EL-TK-191 — Solicitar eliminación de cuenta con reautenticación y suspensión global

## Parent epic
EL-EP-015

## Status
DRAFT

## User story
**Como** organizador, **quiero** solicitar borrar su cuenta tras reautenticar, **para** impedir nuevas operaciones y cerrar acceso público de sus eventos.

## Alcance funcional
Comando owner account deletion consume evidencia MOD-001 atómicamente, solicita eliminación con ventana de siete días, bloquea creación de eventos y acceso público de hijos; inicia sesión de consulta/cancelación restringida; barreras PREPARE/ACK.

## Fuera de alcance
No reemplaza verifier MOD-001 ni crea nueva ventana de 72h para eventos hijos.

## Criterios de aceptación
### Escenario 1
Dada evidencia válida y confirmación, cuando solicita, entonces cuenta queda pendiente 7d, todos los eventos pierden acceso público y solo consulta/cancelación permitidas.

### Escenario 2
Dada evidencia ajena, expirada o reutilizada, cuando intenta, entonces se rechaza sin request ni reactivación.

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

## Gate de implementación propuesto
REQUIREMENTS_READY: YES (contratos aceptados, pendiente revisión formal del ticket).
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
REVIEW_STATUS: PENDING — propuesta documental sin prueba ejecutada ni dictamen automatizado de requirements_reviewer.
