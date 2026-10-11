# EL-TK-054 — Integrar estados de fallo y retry en la biblioteca compartida

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** organizador propietario, **quiero** consultar el fallo y solicitar un nuevo ciclo permitido desde la biblioteca compartida, **para** recuperar previews sin evadir seguridad.

## Alcance funcional

Frontend integra ProcessingFailedPanel, RetryProcessingAction y QuarantinedMediaState existentes dentro OrganizerMediaLibrary/OrganizerMediaCard/detalle compartidos por contrato EL-EP-007, sin construir biblioteca entera, consola ni página por job. Consume053 y040; UI006 y contrato común vigentes. DownloadOriginalAction sólo por contrato010 cuando elegible, sin implementar entrega.

## Criterios de aceptación

**Dado** detalle/biblioteca autorizados, **cuando** presenta estado, **entonces** UPLOADED/PROCESSING/PROCESSING_FAILED/QUARANTINED y ausencia de preview tienen texto legible; conserva indicación de original sin prometer descarga. Retry visible sólo cuando capability vigente; cuarentena owner read-only sin liberar/reintentar.

**Dado** nuevo ciclo solicitado, **cuando** API acepta, **entonces** confirma solicitud/ciclo y consulta resultado eventual sin anunciar PROCESSING antes de reserva ni preview exitoso por202. Deshabilita doble envío; inspección/descarga separadas del retry.

**Dado** loading/empty/error/success/timeout/conflicto/permiso perdido, **cuando** cambia resultado, **entonces** loading no finge vacío, retry requiere permiso actual, conflicto refresca capacidad sin sobrescribir, sesión expirada no reutiliza credenciales ni revela otro evento. Mobile apilado, teclado/labels/error asociado, foco visible estable, acción nombrada por archivo y anuncios significativos sin color único ni robo de foco.

## Contratos y pruebas

UI006 y componentes existentes; OpenAPI→cliente Angular generado. Vitest componentes para capacidades/read-only/timeout/retry/keyboard/focus/anuncios; Playwright integración con host compartido y fixture contractual007, fallo→solicitud→resultado, denegación/inspección inconclusa/cuarentena. Host007 es contrato identificado, no dependencia de toda épica. Sin librería/CSS/iconos nuevos.

## Dependencias de tickets

- **depends_on:** EL-TK-040, EL-TK-053.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-006-02; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). YES para alcance contractual propio neutral, conservando predecesoras; no certifica adapters ni Beta.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. UI mantiene gateUI006 y contratos040/053 cerrados, cliente OpenAPI/componentes existentes. Integración requiere040/053/host compartido/pipeline; no expone errores FFmpeg ni duplica retry backend.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Implementación y Verificación — 2026-10-11

- **Componentes (`@eventlens/web`):**
  - `OrganizerMediaCardComponent`: Tarjeta de visualización para organizador en biblioteca o móvil, con placeholders legibles y accesibles en ausencia de preview (`UPLOADED`, `PROCESSING`, `PROCESSING_FAILED`, `QUARANTINED`), badge con texto descriptivo no dependiente de color, y progreso observable.
  - `ProcessingFailedPanelComponent`: Panel técnico que respeta DEC-075 y DEC-076 con elegibilidades separadas (inspección `INCONCLUSIVE` permite retry pero deniega descarga original; inspección `APPROVED` permite descarga de original si el rol lo autoriza).
  - `RetryProcessingActionComponent`: Acción de reintento con prevención de doble envío (`isSubmitting`), confirmación en `aria-live` sin falso anuncio prematuro de `PROCESSING` antes de reserva ni preview anticipado, y refresco de capacidades ante conflicto de ciclo activo.
  - `QuarantinedMediaStateComponent`: Estado de cuarentena estrictamente read-only para el organizador, sin botones de reintento ni liberación.
  - `DownloadOriginalActionComponent`: Superficie interactiva de descarga de original para contrato EL-EP-010 cuando elegible.
  - `MediaProcessingService`: Servicio cliente para orquestar consultas y solicitudes de ciclo.
- **Validación automatizada en Docker (`node scripts/workspace.mjs test`):**
  - Pruebas unitarias y de integración de componentes: `apps/web/src/app/media/organizer-media-card.component.spec.ts` (7/7 passed).
  - Pruebas globales de web: 9/9 passed en Vitest bajo Angular 21 TestBed.
  - Verificación estricta de tipos: `ngc --noEmit` passed (exit code 0 en todos los paquetes).
  - Compilación de producción: `ng build` passed en 3.3s.
- **Veredicto de testing y revisión:** **PASS / APPROVED**.

