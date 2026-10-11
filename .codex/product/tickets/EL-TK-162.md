# EL-TK-162 — Generar avisos de cuenta, seguridad y cambios del evento

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** sistema, **quiero** informar hitos de cuenta y cambios operativos relevantes, **para** mantener al organizador informado sin exponer detalles sensibles.

## Alcance funcional
Crear avisos para recuperación/seguridad de cuenta, evento próximo, cambios autorizados, suspensión/reactivación y eventos de acceso pertinentes.

## Fuera de alcance
Implementar auth, lifecycle o revelar razones internas de seguridad/investigación.

## Criterios de aceptación
### Escenario 1
**Dado** ocurre un hecho de seguridad notificable, **cuando** se procesa, **entonces** comunica al owner con copy sanitizado.

### Escenario 2
**Dado** evento se suspende/reactiva, **cuando** se confirma dominio, **entonces** se genera aviso sin revelar motivo restringido.

### Escenario 3
**Dado** hecho se revierte/queda obsoleto, **cuando** se presenta, **entonces** solo queda vigente la comunicación aplicable.

## Reglas de negocio
Avisar intervención salvo razón legal/seguridad; el motivo sensible puede suprimirse.

## Validaciones y permisos
Destinatario autorizado; hechos provenientes de dominios dueños.

## Casos de error y estados vacíos
Destinatario no vigente, supresión requerida, replay y fallo delivery.

## Datos / contratos afectados
Account/EventNotificationFacts, suppression reason/ref.

## Dependencias técnicas y funcionales
Hechos de cuenta/seguridad de EL-EP-001 y lifecycle/suspensión de EL-EP-003.

## Dependencias de tickets
- **depends_on:** EL-TK-156; hechos de dominio EL-EP-001 y EL-EP-003
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Seguridad, suspensión/reactivación, supresión, dedupe y privacidad.

## Observabilidad / auditoría
No almacenar motivos sensibles en copy/logs cuando estén suprimidos.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-081; EL-EP-013.

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
  - Contratos tipados en `packages/notifications/src/contracts.ts`: `AccountSecurityFact`, `EventSuspensionFact`, `EventReactivationFact`, `EventUpcomingFact`, `EventConfigurationChangedFact`, `GenerateNoticeResult`, `SecurityNoticeEventType`, `NoticeGenerationOutcome`.
  - Servicio `AccountEventNoticeService` en `packages/notifications/src/account-event-notice-service.ts`:
    - `generateAccountSecurityNotice`: procesa hechos de cuenta y seguridad de EL-EP-001 (`NEW_LOGIN`, `PASSWORD_CHANGED`, `SESSION_REVOKED`, `RECOVERY_REQUESTED`, `CREDENTIAL_UPDATED`). Sanitiza metadatos (IP limpia, User-Agent acotado), garantiza ausencia total de tokens, contraseñas o secretos en el payload, y emite intenciones idempotentes en PostgreSQL con deduplicación por día (`sec:${accountRef}:${eventType}:${date}`).
    - `generateEventSuspensionNotice`: procesa suspensiones de EL-EP-003. Si se activa `suppressNotice` por requerimiento legal o de seguridad, suprime la creación del aviso visible y registra la decisión en la auditoría sin exponer razones en logs públicos. Si `isRestrictedReason` es verdadero, oculta cualquier detalle de investigación confidencial y almacena un motivo administrativo seguro y neutral.
    - `generateEventReactivationNotice`: procesa reactivaciones de EL-EP-003, generando la intención `EVENT_REACTIVATED` y aplicando supersession atómica en PostgreSQL sobre el aviso previo de suspensión (`supersedesDedupKeys: ['lifecycle:${eventRef}:suspended']`), garantizando que sólo la comunicación vigente quede activa en el panel.
    - `generateEventUpcomingNotice`: programa el aviso de evento próximo con ventana temporal exacta (efectivo 24 horas antes de `startsAt`, expira en `startsAt`).
    - `generateEventConfigurationChangedNotice`: procesa cambios autorizados en el evento (políticas de acceso, fechas, visibilidad de galería) con destino propietario `/events/:id/settings`.
- **Pruebas y calidad:**
  - 54/54 pruebas PASS en `@eventlens/notifications`:
    - 9 pruebas unitarias (`account-event-notice.unit.test.ts`): cubren sanitización de copy de seguridad, deduplicación e idempotencia, no revelación de motivos restringidos, supresión legal/seguridad, supersession atómica ante reactivación, ventana de evento próximo, cambios de configuración y validaciones de argumentos.
    - 3 pruebas de integración con PostgreSQL 16 real (`account-event-notice.integration.test.ts`): persistencia de hechos de seguridad con metadatos limpios, no fuga de motivos confidenciales en base de datos, y supersession en base de datos verificando con `NoticeProjectionService` que sólo la reactivación se proyecta al organizador.
    - 42 pruebas previas (`notification-intent`, `email-notification`, `notice-projection`).
  - TypeScript typecheck (`tsc --noEmit`) y build (`tsc -p tsconfig.build.json`) completados con 0 errores.
