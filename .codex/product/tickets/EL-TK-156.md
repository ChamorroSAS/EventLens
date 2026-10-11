# EL-TK-156 — Registrar intenciones de notificación idempotentes desde hechos de dominio

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** sistema, **quiero** convertir hechos confirmados en intenciones de comunicación, **para** deduplicar avisos y separar dominio de canales concretos.

## Alcance funcional
Persistir NotificationIntent a partir de hechos propietarios con destinatario, tipo, recurso, ventana/fecha, dedup key y estado; no enviar correo ni renderizar UI.

## Fuera de alcance
Seleccionar proveedor de email, determinar severidad/lifecycle o crear NotificationCenter.

## Criterios de aceptación
### Escenario 1
**Dado** llega un hecho notificable nuevo, **cuando** se procesa, **entonces** se crea una intención única.

### Escenario 2
**Dado** el mismo hecho se reprocesa, **cuando** se procesa, **entonces** no duplica la intención.

### Escenario 3
**Dado** el hecho quedó obsoleto antes de entrega, **cuando** se revalida, **entonces** la intención puede quedar superseded/cancelled sin enviarse como riesgo vigente.

## Reglas de negocio
Solo hechos confirmados de dominios propietarios generan intentos; deduplicación por semántica del evento/recurso.

## Validaciones y permisos
Sistema; destinatario debe pertenecer al contexto autorizado.

## Casos de error y estados vacíos
Hecho inválido, destinatario ausente, replay, conflicto y rollback.

## Datos / contratos afectados
NotificationIntent, dedupKey, recipientRef, notificationType, status, effectiveAt/expiresAt.

## Dependencias técnicas y funcionales
Señales de EL-EP-001/003/009/010/011/015 y JobQueue.

## Dependencias de tickets
- **depends_on:** contratos de hechos propietarios
- **blocks:** EL-TK-157, EL-TK-158, EL-TK-159, EL-TK-160, EL-TK-161, EL-TK-162, EL-TK-163, EL-TK-164, EL-TK-165

## Pruebas requeridas
Idempotencia, obsolescencia, destinatario, rollback y aislamiento.

## Observabilidad / auditoría
Auditar intención/resultado sin contenido sensible.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-064; EL-EP-013.

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

## Cierre de implementación — 2026-10-11

**CONFIRMED — EL-TK-156 DONE:** Implementación del servicio de intenciones de notificación completada en `@eventlens/notifications` (`NotificationIntentService`) con migración `202610110022_notification_intent`.

1. **Persistencia de NotificationIntent (Escenario 1):**
   - Convierte hechos confirmados de dominios propietarios en intenciones durables en PostgreSQL (`notification_intent`) con `id`, `dedup_key`, `recipient_ref`, `notification_type`, `resource_ref`, `status: 'PENDING'`, `payload` JSONB sanitizado y ventanas temporales (`effective_at`, `expires_at`).
2. **Deduplicación e Idempotencia (Escenario 2):**
   - Clave única `dedup_key` previene duplicados. Llamadas repetidas con idénticos parámetros responden con `IDEMPOTENT_REPLAY` y devuelven el registro existente. Llamadas conflictivas bajo la misma clave disparan `IDEMPOTENCY_CONFLICT`.
3. **Obsolescencia y Superseded (Escenario 3):**
   - Hechos que invalidan condiciones previas (e.g. reactivación tras suspensión) marcan atómicamente intenciones anteriores como `SUPERSEDED` mediante `supersedesDedupKeys` o `supersedeIntent`/`revalidateIntent`, evitando que riesgos caducados se presenten al organizador o se envíen por canales externos.
4. **Aislamiento, Rollback y Auditoría:**
   - Soporte para ejecución en transacciones atómicas PostgreSQL (`SqlTransaction`), garantizando rollback limpio sin registros parciales ante fallos.
   - Auditoría sanitizada en `notification_audit_event` registrando acciones, destinatarios y resultados sin exponer credenciales ni secretos.
5. **Quality Gates:**
   - Pruebas unitarias: 11/11 PASS (`test/notification-intent.unit.test.ts`).
   - Pruebas de integración: 5/5 PASS (`test/notification-intent.integration.test.ts`) contra PostgreSQL 16 real.
   - Total suite: 16/16 PASS; typecheck y build limpios con 0 errores.

