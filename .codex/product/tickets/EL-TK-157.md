# EL-TK-157 — Encolar y procesar correos de notificación con proveedor desacoplado

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** sistema, **quiero** procesar correos desde intenciones persistidas, **para** enviar comunicaciones de forma durable sin acoplar el dominio a un proveedor.

## Alcance funcional
Publicar jobs de email, renderizar contrato de plantilla, invocar puerto EmailSender neutral, aplicar retry/DEAD según JobQueue y persistir resultado de intento.

## Fuera de alcance
Elegir proveedor definitivo, marketing, SMS/WhatsApp/push o acreditar entrega final solo por enqueue.

## Criterios de aceptación
### Escenario 1
**Dado** intención EMAIL vigente, **cuando** worker la procesa, **entonces** intenta envío mediante puerto y registra resultado.

### Escenario 2
**Dado** proveedor falla transitoriamente, **cuando** job falla, **entonces** se reintenta conforme política JobQueue hasta presupuesto.

### Escenario 3
**Dado** job fue creado pero no confirmado por proveedor, **cuando** se muestra estado, **entonces** no se afirma entrega acreditada.

## Reglas de negocio
Hasta tres intentos automáticos según JobQueue. Proveedor definitivo sigue DEFERRED.

## Validaciones y permisos
Sistema; revalidar intención/destinatario antes de envío.

## Casos de error y estados vacíos
Timeout proveedor, credencial/configuración ausente, intención obsoleta, replay y DEAD.

## Datos / contratos afectados
EmailSender port, EmailNotificationSpec, NotificationDeliveryAttempt, JobQueue.

## Dependencias técnicas y funcionales
EL-TK-156 y JobQueue durable EL-TK-055 (DEC-064).

## Dependencias de tickets
- **depends_on:** EL-TK-156, EL-TK-055; contrato JobQueue (DEC-064)
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Puerto fake/lab, retry/DEAD, obsolescencia, idempotencia y sanitización.

## Observabilidad / auditoría
No loggear cuerpo completo sensible ni credenciales; métricas de entrega intentada.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021, DEC-064; EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-021 y DEC-061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-013; sin componentes nuevos ni NotificationCenter obligatorio).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Evidencia de implementación — 2026-10-11
- **Componentes y arquitectura:**
  - Migración y tabla PostgreSQL 16 `notification_delivery_attempt` (`202610110023_notification_delivery_attempt`): persiste auditoría de cada intento (`id`, `intent_id`, `job_id`, `attempt_number`, `channel: 'EMAIL'`, `status`, `provider_message_id`, `error_code`, `error_message`, `latency_ms`, `attempted_at`).
  - Puerto desacoplado `EmailSender` (`SendEmailRequest`, `SendEmailResponse`): desacopla el dominio de cualquier proveedor externo concreto (DEC-021). Proveedor definitivo DEFERRED. Adaptador de testing `FakeEmailSender` con simulación de latencia y fallos transitorios/permanentes.
  - Renderizador accesible `EmailRenderer`: genera versiones en HTML y texto plano con escaping estricto (`escapeHtml`) para prevenir inyecciones y sanitización de credenciales.
  - Servicio worker `EmailNotificationService`:
    - Encolado transaccional en `JobQueuePostgres` (`type: 'NOTIFICATION_EMAIL'`, `queue: 'notification-email'`, `dedupKey: email-job:${dedupKey}`).
    - Procesamiento de ejecuciones con revalidación previa de la intención.
    - Obsolescencia: si la intención está en estado `SUPERSEDED` o `CANCELLED`, se omite el envío (`SKIPPED_OBSOLETE`), no se emite correo y se persiste el intento como `SUPERSEDED` completando el job.
    - Política de reintentos conforme a DEC-064 / JobQueue: reintentos con backoff exponencial para fallos transitorios (`RETRYING`) hasta agotar presupuesto (máximo 3 intentos). Al agotar presupuesto (intento 3), se marca el job como `DEAD`, se registra el intento como `DEAD` y se actualiza la intención a `FAILED`.
    - Acreditación de entrega: `isDeliveryAcredited` es estrictamente falso mientras la intención esté encolada o en reintentos; sólo se acredita entrega tras registrar un intento con estado `SENT` confirmado por el proveedor.
    - Auditoría sanitizada persistida en `notification_audit_event` sin cuerpos sensibles ni secretos.
- **Pruebas y calidad:**
  - 27/27 pruebas PASS en `@eventlens/notifications`:
    - 8 pruebas unitarias (`email-notification.unit.test.ts`): cubren Escenario 1 (envío exitoso), Escenario 2 (retry + DEAD por presupuesto), Escenario 3 (acreditación estricta y skip por obsolescencia).
    - 3 pruebas de integración con PostgreSQL 16 real y `JobQueuePostgres` (`email-notification.integration.test.ts`): cubren reserva de cola, transacciones atómicas, aislamiento, actualización de estados en DB y persistencia de intentos de entrega.
    - 16 pruebas previas de `NotificationIntentService` (unitarias e integración).
  - TypeScript typecheck (`tsc --noEmit`) y build (`tsc -p tsconfig.build.json`) completados con 0 errores.
