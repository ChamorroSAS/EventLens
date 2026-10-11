# EL-TK-158 — Proyectar avisos contextuales vigentes para el panel del organizador

## Parent epic
EL-EP-013

## Status
DONE

## User story
**Como** organizador, **quiero** consultar avisos vigentes relacionados con mi contexto, **para** ver hitos y riesgos sin una bandeja de notificaciones adicional.

## Alcance funcional
Exponer proyección de InAppNotice desde intenciones vigentes, con título/hecho/fecha/consecuencia/acción/destino y eliminación de avisos obsoletos/duplicados.

## Fuera de alcance
Leído/no leído, dismiss permanente, preferencias o NotificationCenter.

## Criterios de aceptación
### Escenario 1
**Dado** existen avisos vigentes, **cuando** owner abre panel/contexto, **entonces** recibe solo avisos autorizados y no duplicados.

### Escenario 2
**Dado** no existen avisos, **cuando** consulta, **entonces** no se muestra un EmptyState grande obligatorio.

### Escenario 3
**Dado** aviso quedó obsoleto, **cuando** refresca, **entonces** deja de presentarse como riesgo vigente.

## Reglas de negocio
Enlaces/destinos se reautorizan al navegar; aviso no concede permiso.

## Validaciones y permisos
Owner del recurso; aislamiento por cuenta/evento.

## Casos de error y estados vacíos
Carga parcial, error recuperable, aviso expirado y permiso revocado.

## Datos / contratos afectados
InAppNoticeProjection, action destination, validUntil, priority semantics.

## Dependencias técnicas y funcionales
EL-TK-156 y destinos propietarios.

## Dependencias de tickets
- **depends_on:** EL-TK-156
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Vigente/obsoleto, dedupe, aislamiento, partial/error y destino autorizado.

## Observabilidad / auditoría
Consulta sin PII adicional.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021; EL-EP-013; ui-mvp-epic-review.md#el-ep-013.

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
  - Contratos de proyección `InAppNotice`, `InAppNoticeAction`, `InAppNoticeSeverity` e `InAppNoticeProjection` en `packages/notifications/src/contracts.ts`.
  - Servicio `NoticeProjectionService` en `packages/notifications/src/notice-projection-service.ts`:
    - `projectNoticesForOrganizer({ recipientRef, resourceRef, asOf })`:
      - Filtrado en PostgreSQL de intenciones no vigentes: excluye atómicamente `SUPERSEDED`, `CANCELLED`, avisos expirados (`expires_at <= asOf`) y hechos futuros no vigentes (`effective_at > asOf`).
      - Aislamiento estricto por cuenta/destinatario (`recipient_ref`) y filtrado opcional por evento/recurso (`resource_ref`).
      - Deduplicación determinista: ante eventos recurrentes bajo la misma clave semántica (`notificationType:resourceRef`), preserva únicamente la notificación más reciente y vigente.
      - Estado vacío limpio: ante ausencia de avisos vigentes, proyecta `{ recipientRef, notices: [], totalCount: 0, hasActiveNotices: false }`, permitiendo a la UI del organizador omitir cualquier EmptyState invasivo o banner obligatorio.
      - Enlaces y destinos propietarios: cada aviso incluye `action.destination` hacia el dominio propietario (`/events/:id/capacity`, `/events/:id/exports`, etc.); las rutas se reautorizan al navegar sin que el aviso conceda permisos de acceso adicionales.
    - `mapIntentToNotice(intent)`: proyecta los hechos de dominio a avisos enriquecidos con `title`, `fact`, `consequence`, `action` y `severity` (`CRITICAL` para suspensión y 100% capacidad, `WARNING` para 80% capacidad, periodo de gracia, seguridad y exportación caducada, e `INFO` para reactivación, descarga disponible, evento próximo e invitaciones).
- **Pruebas y calidad:**
  - 42/42 pruebas PASS en `@eventlens/notifications`:
    - 12 pruebas unitarias (`notice-projection.unit.test.ts`): cubren proyección de campos semánticos, aislamiento, filtrado por `resourceRef`, deduplicación del más reciente, estado vacío sin banners obligatorios, exclusión de obsoletos/expirados/futuros, validación de `recipientRef`, y reglas de severidad.
    - 3 pruebas de integración con PostgreSQL 16 real (`notice-projection.integration.test.ts`): persistencia real de hechos vía `NotificationIntentService`, aislamiento entre cuentas distintas, consulta limpia en estado vacío y exclusión verificada en base de datos de hechos superseded/expirados.
    - 27 pruebas previas de `NotificationIntentService` y `EmailNotificationService`.
  - TypeScript typecheck (`tsc --noEmit`) y build (`tsc -p tsconfig.build.json`) completados con 0 errores.
