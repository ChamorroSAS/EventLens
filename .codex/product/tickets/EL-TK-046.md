# EL-TK-046 — Reconciliar restricciones de MOD-001 tras recuperación

## Parent epic

EL-EP-001

## Status

DONE

## User story

**Como** sistema de recuperación, **quiero** reconciliar las restricciones y revisiones de MOD-001 con RecoveryAuthority, **para** impedir que un restore reactive invitaciones revocadas/consumidas, credenciales, sesiones o grants revocados.

## Alcance funcional

Una responsabilidad: integrar los facts y comandos de MOD-001 con el puerto compartido `RecoveryAuthority`, incluido PREPARE → transacción SQL → ACK, revisión/epoch y barrera fail-closed. Cubre los facts y revisiones de invitaciones BETA de MOD-001 pertinentes a su emisión, consumo y revocación, además de cuentas, principales, credenciales y sesiones.

## Fuera de alcance

Seleccionar proveedor/adapter, construir una segunda solución de recuperación, recuperar datos de otros módulos, cambiar reglas de producto o liberar grants de MOD-007 directamente.

## Criterios de aceptación

### Cambio sensible confirmado
**Dado** un cambio sensible de MOD-001 que emite una invitación o revoca/consume una invitación, credencial, sesión o token,
**Cuando** se confirma,
**Entonces** registra su fact/revisión en RecoveryAuthority mediante el protocolo del contrato y no confirma acceso contrario ante ambigüedad.

### Restore anterior
**Dado** un restore anterior a emisión/consumo/revocación de invitación, login administrativo u organizador, reset, consumo de token, cierre de sesión o revocación administrativa,
**Cuando** se reconcilia MOD-001,
**Entonces** invitaciones, hashes, sesiones, grants y tokens restaurados no vuelven a autorizar hasta checkpoint y facts íntegros; el scope permanece cerrado si hay gap.

## Reglas de negocio

- MOD-001 conserva facts/revisión de invitación, cuenta/principal, credential revision, consumo/revocación de invitación o token y watermark de sesiones. La política técnica de contraseñas, tokens y sesiones permanece PENDING.
- RecoveryAuthority está fuera de la línea PITR; DB restaurada no reactiva privilegios por sí sola.
- La indisponibilidad/integridad desconocida causa fail-closed para scopes sensibles; no se selecciona proveedor.

## Datos / contratos afectados

`RecoveryAuthority.prepare`, `ackCommit`, `resolveAbort`, checkpoint/facts, recovery barrier y epoch; revisiones de invitación, cuenta/principal, credencial y sesiones. No expone este puerto como API HTTP ni usa Prisma como dominio/contrato.

## Dependencias técnicas y funcionales

ARCH-010, AQR-001, operations-and-recovery y testing-strategy AQR-001. Depende del puerto compartido acordado; no reclama ownership de MOD-009 ni del reconciler de otros módulos.

## Dependencias de tickets

- **depends_on:** ninguna predecesora funcional; requiere contrato compartido acordado de RecoveryAuthority.
- **blocks:** EL-TK-006, EL-TK-011, EL-TK-013..019, EL-TK-044, EL-TK-045.
- **can_parallelize_with:** EL-TK-008; consumidores restantes pueden preparar contratos, pero su ejecución sensible respeta las predecesoras directas o transitivas de este ticket.

## Pruebas requeridas

Integración PostgreSQL real y simulación del puerto para PREPARE/SQL/ACK, abort y crash intermedio; ejercicios PITR con snapshot previo a emisión/consumo/revocación de invitación, login administrativo, reset, cierre de sesión, consumo/revocación de token y revocación admin; validar epoch/barrera y no reactivación. No sustituye los ensayos operativos de EL-EP-014.

## Observabilidad / auditoría

Registrar `operationId`, subjectRef, secuencia/checkpoint, receipt y resultado sin password, token ni secreto; alertar gap/ACK incierto según contrato de operación.

## Prioridad

P0

## Estimación

M

## Riesgos / notas

La disponibilidad de RecoveryAuthority reduce disponibilidad de scopes sensibles. Esta integración es de MOD-001; comparte puerto sin apropiarse de infraestructura ni elegir adapter.

## Traceability

GAP-EL-EP-001-05; ARCH-010; AQR-001; EL-EP-001; operations-and-recovery; testing-strategy AQR-001.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Gate vigente — 2026-10-08

**REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.** YES limitado a integración MOD-001 con el puerto RecoveryAuthority; no construye adapter ni infraestructura compartida. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.

## Resultado de implementación — 2026-10-11

**CONFIRMED:** implementación completada y validada de forma independiente contra PostgreSQL 16 real cumpliendo todos los criterios de aceptación de EL-TK-046, AQR-001 y operations-and-recovery.

- **Protocolo transaccional sensible PREPARE -> SQL -> ACK**: Implementado en `Mod001RecoveryCoordinator.executeSensitiveTransaction` con instalación previa de barrera (`prepareSensitiveOperation`), ejecución de transacción SQL con emisión de recibo durable y revisión, y confirmación final con `ackCommit`.
- **Manejo de fallos y abortos**: En caso de fallo o rollback en la transacción SQL, invoca de manera segura `resolveAbort` con el recibo preparado para limpiar la intención.
- **Fail-closed ante fallos de ACK**: Si `ackCommit` no puede confirmarse con RecoveryAuthority, falla cerrado impidiendo confirmar acceso ambiguo.
- **Barrera de recuperación fail-closed**: Comprueba `isRecoveryBarrierActive` para denegar mutaciones sensibles mientras MOD-001 esté bajo barrera de recuperación.
- **Reconciliación post-PITR (`reconcileMod001`)**:
  - Lectura consistente de checkpoint y facts ordenados mediante `readCheckpoint` y `readFacts`.
  - Detección de brechas de secuencia (gaps): falla cerrado de inmediato con `GAP_DETECTED`.
  - Reconciliación en base de datos PostgreSQL:
    - Principales con hecho `ADMIN_PRINCIPAL_REVOKED` se actualizan a `REVOKED` e incrementan `auth_revision`.
    - Credenciales con revisión anterior a hechos `CREDENTIAL_ROTATED` se marcan `REVOKED` impidiendo reautorizar hashes antiguos restaurados.
    - Sesiones con watermark desactualizado o creadas con anterioridad a `recoveryEpoch` se invalidan con `revocation_reason = 'RECOVERY_RECONCILIATION'` o `'RECOVERY_EPOCH_SUPERSEDED'`.
  - Confirmación durable de reconciliación mediante `ackReconciled`.

Paquete e interfaces: [@eventlens/identity](../../../packages/identity/README.md).
Validación ejecutada: 14/14 pruebas propias (11 unitarias + 3 de integración contra PostgreSQL 16 real); suite total del paquete: 49/49 PASS. Evidencia: [registro](../../../infra/validation/identity/evidence/result.json) y [pruebas](../../../infra/validation/identity/evidence/tests.json).

