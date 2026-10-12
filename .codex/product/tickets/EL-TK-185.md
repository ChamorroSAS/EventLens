# EL-TK-185 — Corregir el verifier humano y migrar credenciales de organizador

## Parent epic
EL-EP-001

## Status
DONE

## User story
**Como** sistema de identidad, **quiero** verificar contraseñas con perfil Argon2id y migración segura, **para** habilitar reautenticación sin digests rápidos ni sesiones antiguas autorizadas.

## Alcance funcional
Corregir registro/login/reset y almacenamiento de credential envelope conforme DEC-108/ARCH-018; migrar credenciales legacy con CAS y PREPARE-SQL-ACK; incrementar credentialRevision y watermark, invalidar sesiones/grants/challenges/evidencias anteriores y verificar el recovery epoch vigente, sin rotar el epoch global por cada upgrade; preservar flujo normal de MOD-001. El [contrato aprobado del verifier](../../context/organizer-password-verifier.md) es normativo para codec, autoridad, migración, admission/cancelación y cutover.

## Fuera de alcance
No reemplaza EL-TK-018/019 DONE; no crea política de recovery ni sistema paralelo de auth.

## Criterios de aceptación
### Escenario 1
Dado un organizador nuevo, cuando registra contraseña, entonces almacena envelope Argon2id con perfil aprobado y salt independiente.

### Escenario 2
Dado un digest legacy con procedencia y autoridad vigentes, cuando la contraseña se verifica en el login de transición, entonces se deriva Argon2id de esa contraseña, fuera de SQL y sin envolver el SHA; CAS y PREPARE-SQL-ACK avanzan la revisión y sólo emiten sesión nueva tras ACK confirmado. El contexto pending-deletion permitido conserva su restricción. No queda legacy utilizable después del cutover; los fallos/ACK ambiguos cierran acceso.

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
EL-TK-013, EL-TK-018, EL-TK-019, EL-TK-046 (reutilizados; comprobar implementación antes de cambiar). Su DONE documental no acredita las correcciones posteriores a DEC-108. Se puede preparar el verifier y sus invariantes sin imponer resets; la integración completa de replacement/reset exige los flujos018/019 comprobados y nunca usa recuperación forzada como sustituto de una capacidad aún no verificada.

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

## Gate de implementación aprobado — 2026-10-12
REQUIREMENTS_READY: YES — architect y requirements_reviewer APPROVED individualmente.
READY_FOR_IMPLEMENTATION: YES para alcance propio; la ejecución depende de los tickets anteriores y verificación de código existente.
UI_REQUIRED: NO — correctivo backend; ui_designer confirma delimitación sin nueva UI.
READY_FOR_FRONTEND_PLANNING: NOT_REQUIRED.
REVIEW_STATUS: APPROVED — [dictámenes formales185..187](../sessions/2026-10-12-el-tk-185-187-readiness.md).

Histórico: DRAFT en la propuesta original y fuera de la revisión188..202; READY tras revisión individual del 2026-10-12. No acredita implementación, pruebas, migración/cutover ni validation gates PASS.

## Cierre de implementación — 2026-10-12
- Implementado `PasswordVerifier` con perfil canónico Argon2id (`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<tag>`) y formato PHC estricto sin padding (DEC-108 / ARCH-018).
- Registro (EL-TK-010) y reseteo de contraseña (EL-TK-019) actualizados para emitir exclusivamente envelopes Argon2id con salt criptográfico de 16 bytes y tag de 32 bytes.
- Login de organizador (EL-TK-013) actualizado para verificar Argon2id, detectar digests legacy SHA-256 y ejecutar migración inline transicional mediante CAS y protocolo PREPARE-SQL-ACK con `RecoveryAuthorityPort`.
- Revocación atómica de sesiones anteriores al rotar/migrar credenciales (`revoked_at = now, revocation_reason = 'CREDENTIAL_ROTATED'`).
- Validación de sesiones en `validateSession` deniega sesiones cuyo `session_watermark` sea menor a la revisión de credencial activa (`SESSION_REVOKED`).
- `Mod001RecoveryCoordinator` actualizado para exigir `ackCommit` obligatorio (fail-closed) y tipar `subjectKind === 'ORGANIZER'` y `ADMIN`.
- Pruebas unitarias de vectores Argon2id, PHC codec, degradación fail-closed, dummy constant-time verification, control de admisión saturada, migración transicional y reversión/fallo de ACK ejecutadas exitosamente (10 test suites, 122 tests pasados).
