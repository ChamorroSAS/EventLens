# EL-TK-159 — Generar avisos de lifecycle, gracia y eliminación próxima

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** sistema, **quiero** programar avisos temporales del evento, **para** advertir al organizador antes de hitos de vigencia y eliminación cuando sea posible.

## Alcance funcional
Consumir timeline canónico para aviso próximo ~24h, vencimiento 7/3/1 días cuando aplica, entrada en gracia, próxima eliminación y eliminación completa, deduplicando cambios/extensiones.

## Fuera de alcance
Calcular lifecycle en EL-EP-013, alterar fechas, decidir purga o prometer avisos imposibles en vigencias cortas.

## Criterios de aceptación
### Escenario 1
**Dado** un hito futuro entra en ventana notificable, **cuando** scheduler evalúa, **entonces** crea intención una vez.

### Escenario 2
**Dado** la vigencia se extiende, **cuando** scheduler reevaluá, **entonces** avisos antiguos quedan obsoletos y usa fechas actuales.

### Escenario 3
**Dado** evento corto no permite todas las ventanas, **cuando** evalúa, **entonces** solo genera avisos posibles sin duplicar.

## Reglas de negocio
Las fechas proceden de EL-EP-003/015; timezone solo para presentación, timestamps canónicos vigentes.

## Validaciones y permisos
Sistema; destinatario owner vigente.

## Casos de error y estados vacíos
Timeline incompleto, evento eliminado, extensión concurrente y job repetido.

## Datos / contratos afectados
LifecycleNotificationFact/Intent, schedule checkpoint/dedup.

## Dependencias técnicas y funcionales
EL-EP-003 timeline y EL-EP-015 eliminación.

## Dependencias de tickets
- **depends_on:** EL-TK-156; contratos EL-EP-003 y EL-EP-015
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
24h/7/3/1, vigencia corta, extensión, grace/deletion y dedupe.

## Observabilidad / auditoría
Métricas de scheduled/suppressed sin datos sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-077, DEC-078, DEC-082, DEC-092; EL-EP-013.

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

## Cierre de implementación — 2026-10-13

**CONFIRMED — EL-TK-159 DONE:** Implementación de `LifecycleNoticeService` completada en `@eventlens/notifications` (`packages/notifications/src/lifecycle-notice-service.ts`).

1. **Programación de Hitos de Lifecycle (Escenario 1):**
   - Consume el timeline canónico (`scheduledAt`, `expiresAt`, `graceEndsAt`, `timezone`) procedente de EL-EP-003/015 sin recalcular ni alterar fechas.
   - Genera intenciones idempotentes (`NotificationIntent`) para los 7 hitos: `LIFECYCLE_EVENT_UPCOMING_24H`, `LIFECYCLE_EXPIRY_WARNING_7D`, `LIFECYCLE_EXPIRY_WARNING_3D`, `LIFECYCLE_EXPIRY_WARNING_1D`, `LIFECYCLE_GRACE_ENTERED`, `LIFECYCLE_DELETION_UPCOMING` y `LIFECYCLE_DELETED`.
   - Deduplicación estricta por `windowKey:milestone`: reevaluaciones de jobs repetidos o concurrentes retornan `IDEMPOTENT_REPLAY` sin duplicar intenciones.
2. **Reevaluación tras Extensión de Vigencia (Escenario 2):**
   - `rescheduleAfterExtension` / `scheduleLifecycleNotices(..., priorWindowKeys)` marca atómicamente como `SUPERSEDED` las intenciones de ventanas de vigencia anteriores cuando `expiresAt` / `graceEndsAt` se extienden, programando las nuevas intenciones con las fechas canónicas vigentes.
3. **Eventos de Vigencia Corta (Escenario 3):**
   - Hitos cuya ventana ya venció (`now >= applicableBefore` o `effectiveAt >= applicableBefore`) se omiten limpiamente con `SKIPPED_WINDOW_TOO_SHORT`, generando únicamente los avisos física y temporalmente posibles sin duplicar ni fallar.
4. **Observabilidad y Quality Gates:**
   - Registro de auditoría sanitizado `LIFECYCLE_NOTICES_SCHEDULED` con conteos `scheduledCount`, `skippedCount` y `supersededCount`.
   - Pruebas unitarias: 19/19 PASS (`test/lifecycle-notice.unit.test.ts`).
   - Pruebas de integración contra PostgreSQL 16 real: 5/5 PASS (`test/lifecycle-notice.integration.test.ts`).
   - Suite completa `@eventlens/notifications`: 93/93 PASS (14 archivos de prueba); `typecheck` y `build` con 0 errores.

