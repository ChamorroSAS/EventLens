# EL-TK-222 — Resolver y acreditar RecoveryAuthority exterior a PITR
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como sistema, quiero una RecoveryAuthority real y verificable fuera de PITR, para que las validaciones de sesión no dependan de estado restaurable.
## Alcance funcional
Documentar la decisión técnica pendiente, configurar y acreditar journal/checkpoint/epoch/revocation floors/barrera durables e independientes del timeline PostgreSQL/PITR, con evidencia operativa de PREPARE→SQL→ACK; integrar el adapter real sin stub y establecer cómo liberar activación.
## Fuera de alcance
No implementa `admin:recover` de EL-TK-217, no reutiliza bootstrap, no habilita login alternativo, ni define autorización, consumo o caducidad de recuperación.
## Criterios de aceptación
### Evidencia externa
**Dado** journal/checkpoint/epoch/floors/barrera configurados, **cuando** se verifica un epoch/barrera tras PITR, **entonces** la evidencia demuestra independencia del timeline restaurado.
- *Verificado:* Escenario A demostró que tras restaurar un snapshot anterior de PostgreSQL (T0), la credencial revocada en T1 permanece rechazada en tiempo real por el watermark exterior durable (`SESSION_REVOKED`), y la posterior reconciliación aplica las restricciones a la base restaurada sin resucitar accesos.
### Indisponibilidad
**Dado** fallo o estado no reconciliado, **cuando** MOD-001 la consulta, **entonces** devuelve denegación/fallo cerrado sin emitir acceso.
- *Verificado:* Escenario F y pruebas de laboratorio comprobaron el comportamiento estricto fail-closed ante indisponibilidad de almacenamiento o fallos de E/S (`AUTHORITY_UNAVAILABLE`).
### Liberación controlada
**Dado** adapter, pruebas y operación aprobados, **cuando** se solicita activación, **entonces** existe evidencia auditable, sin stub ni bypass.
- *Verificado:* `DurableRecoveryAuthorityAdapter` integrado y probado con fsync sincrónico y hash chaining criptográfico SHA-256; runbook operacional publicado en `docs/recovery-authority-runbook.md`.
## Reglas de negocio
La autoridad operacional no modifica EL-TK-217 ni introduce decisiones de autorización de recuperación.
## Validaciones y permisos
La configuración operacional queda bajo la decisión técnica DEC-112; secretos/proofs no entran en logs/auditoría. Permisos de directorio `0700` y archivos `0600`.
## Casos de error y estados vacíos
Sin decisión operacional/configuración/evidencia, mantener bloqueo y no escribir datos. Ante corrupción o gaps, fail-closed inmediato (`CORRUPTED_ARTIFACT` / `GAP_DETECTED`).
## Datos / contratos afectados
`RecoveryAuthorityPort`, MOD-001, garantías post-PITR del contrato técnico (`contracts.ts`, `authentication.ts`, `recovery.ts`).
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218, EL-TK-221. **blocks:** EL-TK-233, EL-TK-237, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Pruebas operativas reales y laboratorio que distingue autoridad duradera de DB efímera; outage y reconciliación. No inventar PASS.
- `packages/identity/test/recovery-authority-adapter.unit.test.ts` (7 pruebas: durabilidad, checkpoints atómicos, detección de gaps, resistencia a tampering, idempotencia, barreras, fail-closed).
- `packages/identity/test/recovery-scenarios.unit.test.ts` (Escenarios obligatorios A a G: A: restauración anterior PITR, B: crash PREPARE-SQL, C: crash SQL-ACK, D: ACK ambiguo y retry idempotente, E: integridad y detección de alteración, F: fail-closed ante persistencia no disponible, G: concurrencia y monotonicidad).
## Observabilidad / auditoría
Evidencia de salud/decisión redacted; auditoría sin secretos ni tokens.
## Prioridad / estimación
P0 / L. Fase 0/2.
## Archivos candidatos
- **read/modify:** `packages/identity/src/authentication.ts`, `packages/identity/src/contracts.ts`, `packages/identity/src/recovery-authority-adapter.ts`, `packages/identity/src/index.ts`.
- **test:** `packages/identity/test/recovery-authority-adapter.unit.test.ts`, `packages/identity/test/recovery-scenarios.unit.test.ts`.
## Riesgos / notas
Riesgo resuelto mediante arquitectura DEC-112: persistencia append-only en volumen independiente con hash chaining SHA-256, checkpoints atómicos con `fsync` y protocolo transaccional `PREPARE → SQL → ACK`.
## Traceability
EL-EP-019; EL-TK-217; DEC-106; DEC-112; `event-control-panels-contract.md`; `docs/recovery-authority-runbook.md`.
## Definition of Ready
- [x] Capacidad operacional/proveedor y prueba externa resueltos (DEC-112 y laboratorio aislado)
- [x] Alcance de bloqueo y fallo cerrado definido
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (Gates A y B verificados con evidencia empírica).
## Definition of Done
- [x] Decisión técnica aprobada y documentada (DEC-112 en `.codex/context/dec-112-recovery-authority-persistence.md`).
- [x] Adaptador durable implementado (`DurableRecoveryAuthorityAdapter` en `packages/identity/src/recovery-authority-adapter.ts`).
- [x] Laboratorio aislado y pruebas reproducibles ejecutadas (14 pruebas automatizadas pasando al 100%).
- [x] Escenarios obligatorios de recuperación A..G verificados sin mocks que sustituyan la durabilidad real.
- [x] Runbook operacional completo en `docs/recovery-authority-runbook.md`.
- [x] Status: DONE.
