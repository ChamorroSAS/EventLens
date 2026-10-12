# EL-TK-185 — Corregir el verifier humano y migrar credenciales de organizador

## Parent epic
EL-EP-001

## Status
DRAFT

## User story
**Como** sistema de identidad, **quiero** verificar contraseñas con perfil Argon2id y migración segura, **para** habilitar reautenticación sin digests rápidos ni sesiones antiguas autorizadas.

## Alcance funcional
Corregir registro/login/reset y almacenamiento de credential envelope conforme DEC-108/ARCH-018; migrar credenciales legacy con CAS y PREPARE-SQL-ACK; invalidar sesiones/grants/epoch/revisión; preservar flujo normal de MOD-001.

## Fuera de alcance
No reemplaza EL-TK-018/019 DONE; no crea política de recovery ni sistema paralelo de auth.

## Criterios de aceptación
### Escenario 1
Dado un organizador nuevo, cuando registra contraseña, entonces almacena envelope Argon2id con perfil aprobado y salt independiente.

### Escenario 2
Dado un digest legacy, cuando se migra o actualiza, entonces nunca queda un legacy utilizable después del cutover; los fallos/ACK ambiguos cierran acceso.

### Escenario 3
Dado una rotación o migración, cuando una sesión o grant usa revisión anterior, entonces se deniega incluso después de PITR/replay.

## Reglas de negocio
DEC-108 exige Argon2id nativo m=19MiB,t=2,p=1,salt16,tag32, parsing/encoding controlados; ningún downgrade; compatibilidad de recuperación existente se valida.

## Validaciones y permisos
Sesión/revisión válida, límites compartidos y no enumeración; memoria/CPU bounded.

## Casos de error y estados vacíos
Digest malformado, concurrente, timeout, upgrade interrumpido, rate-limit y rollback.

## Datos / contratos afectados
MOD-001 credential verifier, session/revision/epoch, RecoveryAuthority, organizer_credential, contracts de register/login/reset.

## Dependencias técnicas y funcionales
EL-TK-013, EL-TK-018, EL-TK-019, EL-TK-046 (reutilizados; comprobar implementación antes de cambiar).

## Dependencias de tickets
- **depends_on:** EL-TK-013, EL-TK-018, EL-TK-019, EL-TK-046 (reutilizados; comprobar implementación antes de cambiar).
- **blocks:** ver [grafo EL-EP-015](../sessions/2026-10-12-el-ep-015-ticket-plan.md).

## Pruebas requeridas
Vectores Argon2id; concurrent CAS y migración real PostgreSQL16; cutover/rollback; sesiones antiguas, ACK perdido/PITR, saturación y respuesta neutra.

## Observabilidad / auditoría
Nunca registrar secretos, digest ni proof; métricas de upgrade sin identidad sensible.

## Prioridad / estimación
P0 / L

## Traceability
DEC-107/108; ARCH-017/018; AQR-001; EL-EP-001, EL-EP-015

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
