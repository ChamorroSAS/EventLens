# EL-TK-222 — Resolver y acreditar RecoveryAuthority exterior a PITR
## Parent epic
EL-EP-019
## Status
BLOCKED
## User story
Como sistema, quiero una RecoveryAuthority real y verificable fuera de PITR, para que las validaciones de sesión no dependan de estado restaurable.
## Alcance funcional
Documentar la decisión técnica pendiente, configurar y acreditar journal/checkpoint/epoch/revocation floors/barrera durables e independientes del timeline PostgreSQL/PITR, con evidencia operativa de PREPARE→SQL→ACK; integrar el adapter real sin stub y establecer cómo liberar activación.
## Fuera de alcance
No implementa `admin:recover` de EL-TK-217, no reutiliza bootstrap, no habilita login alternativo, ni define autorización, consumo o caducidad de recuperación.
## Criterios de aceptación
### Evidencia externa
**Dado** journal/checkpoint/epoch/floors/barrera configurados, **cuando** se verifica un epoch/barrera tras PITR, **entonces** la evidencia demuestra independencia del timeline restaurado.
### Indisponibilidad
**Dado** fallo o estado no reconciliado, **cuando** MOD-001 la consulta, **entonces** devuelve denegación/fallo cerrado sin emitir acceso.
### Liberación controlada
**Dado** adapter, pruebas y operación aprobados, **cuando** se solicita activación, **entonces** existe evidencia auditable, sin stub ni bypass.
## Reglas de negocio
La autoridad operacional no modifica EL-TK-217 ni introduce decisiones de autorización de recuperación.
## Validaciones y permisos
La configuración operacional debe quedar bajo decisión técnica aceptada; secretos/proofs no entran en logs/auditoría.
## Casos de error y estados vacíos
Sin decisión operacional/configuración/evidencia, mantener bloqueo y no escribir datos.
## Datos / contratos afectados
`RecoveryAuthority`, MOD-001, garantías post-PITR del contrato técnico.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218, EL-TK-221. **blocks:** EL-TK-233, EL-TK-237, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Pruebas operativas reales y laboratorio que distingue autoridad duradera de DB efímera; outage y reconciliación. No inventar PASS.
## Observabilidad / auditoría
Evidencia de salud/decisión redacted; auditoría sin secretos ni tokens.
## Prioridad / estimación
P0 / L. Fase 0/2.
## Archivos candidatos
- **read/modify:** `packages/identity/src/authentication.ts`, `packages/identity/src/contracts.ts`, `packages/observability/src/postgres-recovery-service.ts`.
- **test:** `packages/identity/test/authentication.integration.test.ts`, `packages/observability/test/postgres-recovery-service.integration.test.ts`.
## Riesgos / notas
BLOCKER: decisión operacional, configuración y evidencia durable exterior a PITR aún PENDING. Se libera sólo por decisión aceptada y prueba real, no por mock.
## Traceability
EL-EP-019; EL-TK-217; DEC-106; `event-control-panels-contract.md`.
## Definition of Ready
- [ ] Capacidad operacional/proveedor y prueba externa resueltos
- [x] Alcance de bloqueo y fallo cerrado definido
REQUIREMENTS_READY: NO para esta capacidad (BLOCKED por decisión operacional pendiente). Gate 2 del conjunto de planificación aprobado; no acredita esta capacidad. READY_FOR_IMPLEMENTATION: NO hasta resolver la decisión, configuración y validación operacional externa a PITR y sus dependencias. IMPLEMENTED: NO.
## Definition of Done
Decisión aceptada, adapter real acreditado fuera de PITR y activación revisada; hasta entonces permanece BLOCKED.
