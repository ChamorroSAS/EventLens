# EL-EP-017 — Matriz de permisos: suspensión y revocación

**Estado: REVIEW_PROPOSAL / NO NEW AUTHORITY.** Evidencia de código en `stage`, 2026-10-12; no pruebas de runtime. El objetivo es implementar únicamente facultades aceptadas, sin ampliar DEC/TC/ARCH.

## Matriz revisada

| Actor / acción | Facultad actualmente respaldada por fuente | Restricción | Resultado |
|---|---|---|---|
| Admin autenticado → suspender evento | `EventLifecycleService.suspendEvent` y `AdminInterventionOrchestrator` con `SUSPEND_EVENT` | `AdminActorContext ADMIN_HUMAN` obtenido por sesión servidor, motivo obligatorio, evento elegible, auditoría; no suspensión automática por mera denuncia | **IN_SCOPE_EXISTING_DOMAIN**; falta HTTP/E2E |
| Admin autenticado → reactivar evento | `REACTIVATE_EVENT`, `EventLifecycleService` y DEC-078/081 | Recalcular lifecycle, preservar cierres voluntarios, gracia y DEAD/DELETED; no restauración ciega | **IN_SCOPE_EXISTING_DOMAIN**; falta HTTP/E2E |
| Admin autenticado → revocar acceso guest del evento | `AdminInterventionOrchestrator REVOKE_GUEST_ACCESS` llama `revokeAllGuestSessions(eventId)` | Alcance **GLOBAL del evento**; exige razón, capacidad, auditoría, confirmación UI proporcional, no tratarlo como sanción individual | **IN_SCOPE_GLOBAL_ONLY** |
| Admin → revocar solo una sesión invitada | `GuestSessionService.revokeGuestSession(sessionId)` escribe `revoked_at`; no valida actor, pertenencia a evento, reason ni audit en esa primitiva | No exponer directamente por HTTP, ni usar servicio de dominio como fuente de autorización; require `eventId` scoped, admin+motivo+case/ref, auditoría, idempotencia y pruebas de no afectar otras sesiones | **GAP / CHANGE_ASSESSMENT_REQUIRED** |
| Admin → suspender cuenta organizadora | `OrganizerAccountRecord.status` admite `SUSPENDED`; `OrganizerAuthenticationService.validateSession` invalida acceso ordinario al no ser ACTIVE/PENDING_DELETION | No se acreditó comando administrativo integral ni revisión/levantamiento. NO editar `status` por SQL directo, ni crear endpoint/permiso por inferencia | **GAP / CHANGE_ASSESSMENT_REQUIRED** |
| Organizador → suspender/reactivar evento administrativamente | EL-EP-003/012 reservan suspensión para admin | Cuenta organizadora no equivale a rol admin | **DENIED** |
| Invitado/anónimo → revocar sesiones de otros | Token guest es event-scoped, no prueba identidad del titular | Mantener Mis aportes/retiro propio con sesión y retiro sin sesión de EL-EP-009 | **DENIED** |
| Denunciante → suspensión automática | DEC-088/089: denuncia sola no oculta contenido | Administración decide según riesgo; alta severidad genera alerta, no sanción automática | **DENIED** |

## Invariantes de permisos y riesgos

1. **Autenticación no delegable al frontend:** ignorar `x-admin-actor-id` como prueba de identidad; sesión `__Host-el_admin_session` validada en backend, Origin/CSRF en mutaciones y fresh authentication para operaciones sensibles cuando contrato lo exija. Autorizar `action, actor, event, scope` con grants del owner; motivo no sustituye capability.
2. **Revalidación en transacción:** comprobar el estado actual y el recurso; usar idempotencia y rechazo de replay incompatible. Registro de actor, acción, motivo sanitizado, alcance, resultado y timestamp; sin IP, media ni identidad del reportante innecesarios. No filtrar información de casos protegidos al organizador.
3. **Suspensión de evento:** mantener plazos DEC-078/081/092; no alterar `purge_started_at` ni introducir legal hold mediante acción de soporte. Notificar según EL-EP-013 salvo excepción justificada de seguridad/legal.
4. **Revocación de invitado:** `revokeGuestSession(sessionId)` no invalida mágicamente URLs temporales ya expedidas (DEC-083); revisar usos de token en carga y galería en cada acceso. Verificar que revocación no bloquee la vía legítima de denuncia o retiro sin sesión. Respetar cargas en curso según contratos propios.
5. **Cuenta vs evento:** suspensión de cuenta no equivale a eliminación; EL-EP-015 gestiona confirmación y purga, sin castigo automático. Reanudación de cuenta necesitará autoridad y recuperación seguras; no se declara implementada.

## Secuencia de decisión recomendada

- **Mantener para integración inmediata:** suspensión/reactivación **del evento** y revocación **global** solo en las condiciones y guardas ya aprobadas.
- **Dejar fuera de la API Beta hasta revisión:** suspensión de cuenta y revocación individual de sesión, aunque las decisiones funcionales permitan evaluarlas; levantar propuesta de cambio/impacto y aprobación previa si requieren nueva autoridad o permiso.
- **No implementar:** identificación permanente del invitado, listas de exclusión por IP/device fingerprint, sanciones automáticas, supresión automática de media por denuncia.
- **Pruebas:** 401/403 por actor/rol, resource spoofing, stale state, carrera e idempotencia, revocación selectiva no impacta sesiones ajenas (solo tras aprobación), bloqueo de nuevas autorizaciones, no reactivación DELETED, auditoría sanitizada.

**Referencia:** DEC-017/019/041/078/081/083/084/088/089/092/097, EL-EP-003/004/009/012/013/015; PR #237. **Estados inalterados:** `EL-EP-017 NOT_READY`, `Q-029 DEFERRED`, `PUBLIC_SERVICE_OPENING BLOCKED`.
