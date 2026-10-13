# EL-TK-221 — Corregir binding de sesión, revocación y epoch en MOD-001
## Parent epic
EL-EP-019
## Status
READY
## User story
Como sistema, quiero validar sesiones de ambos actores contra credenciales, revisiones, epoch y autoridad, para denegar accesos revocados o restaurados de forma insegura.
## Alcance funcional
Persistir y comprobar auth/credential revision, epoch y watermark de emisión para organizador y admin; credencial ACTIVE obligatoria. Revalidar frente a revoke dentro de la transacción propietaria antes de nuevas escrituras; sesiones legacy sin binding verificable se invalidan conservadoramente. Preservar PREPARE→SQL→ACK para efectos sensibles.
## Fuera de alcance
No activa recuperación, no hace 2PC, no inventa epoch=1 ni usa floors restaurables como sustituto.
## Criterios de aceptación
### Revocación concurrente
**Dado** una sesión activa y una revocación concurrente, **cuando** compiten linealizadamente, **entonces** el efecto que ganó antes de la revocación sigue siendo válido; si revoke, binding o barrera gana antes del guard propietario, la mutación se deniega.
### Credencial y epoch
**Dado** credencial ausente/null/no ACTIVE o epoch incompatible, **cuando** se valida contexto, **entonces** no emite capacidad ni cookie nueva.
### Legado y autoridad desconocida
**Dado** sesión legacy sin binding verificable o RecoveryAuthority desconocida, **cuando** valida/emite/muta/logout, **entonces** invalida conservadoramente o falla cerrada sin efecto.
### Autoridad fallida
**Dado** autoridad nula, desconocida, no reconciliada o caída, **cuando** se autentica o muta, **entonces** falla cerrada con 503, sin fallback.
## Reglas de negocio
Admin credentialRevision no deriva de principal.auth_revision; ACK incierto no anuncia acceso.
## Validaciones y permisos
MOD-001 es única fuente de actor; no headers de elevación. Logout también revalida.
## Casos de error y estados vacíos
Legacy no verificable, PITR gap o error externo invalidan/deniegan de forma neutra; locks y revalidación definen el orden ganador antes de efecto.
## Datos / contratos afectados
MOD-001; `RecoveryAuthority`; contrato de seguridad de paneles.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218. **blocks:** EL-TK-222, EL-TK-224, EL-TK-225, EL-TK-226, EL-TK-227, EL-TK-228, EL-TK-233, EL-TK-237, EL-TK-238. **can_parallelize_with:** EL-TK-219, sólo en ramas/archivos disjuntos.
## Pruebas requeridas
Laboratorio aislado: revocación/carrera en ambos órdenes para ambos actores, credencial ACTIVE ausente/null, epoch/barrera, RecoveryAuthority desconocida/outage/PITR, legacy invalidation, revalidación commit y ACK incierto. Critical_review obligatorio antes de integración final.
## Observabilidad / auditoría
Auditar decisión/correlationId sin sesión, credencial, cookie, CSRF ni secreto.
## Prioridad / estimación
P0 / L. Fase 2.
## Riesgos / notas
ACTIVATION BLOCKED hasta EL-TK-222; este ticket no lo levanta por sí mismo.
## Traceability
EL-EP-019; MOD-001; DEC-077/082/106/111; EL-TK-217.
## Definition of Ready
- [x] Contrato de fail-closed y pruebas críticas definido
- [x] Dependencia de laboratorio identificada
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Binding efectivo y revisión crítica independiente aprobada; sin activación hasta evidencia EL-TK-222.
## Archivos candidatos
- **read/modify:** `packages/identity/src/authentication.ts`, `packages/identity/src/organizer-auth.ts`, `packages/identity/src/contracts.ts`.
- **test:** `packages/identity/test/authentication.integration.test.ts`, `packages/identity/test/organizer-auth.integration.test.ts`, `packages/identity/test/recovery.integration.test.ts`.
