# EL-TK-113 — Registrar una denuncia sobre contenido visible

## Parent epic
EL-EP-009

## Status
DONE

## User story
**Como** invitado o reportante, **quiero** reportar una media visible con un motivo, **para** informar un posible problema sin crear una cuenta.

## Alcance funcional
Crear un reporte idempotente desde contenido visible con el catálogo de motivos vigente, referencia de evento/media y datos mínimos autorizados.

## Fuera de alcance
Ocultar automáticamente, decidir severidad final, eliminar contenido o resolver el caso.

## Criterios de aceptación
### Escenario 1
**Dado** una media visible y un motivo válido, **cuando** el reportante envía, **entonces** se registra el caso y se confirma recepción sin afirmar resolución.

### Escenario 2
**Dado** se reintenta la misma solicitud por timeout, **cuando** se procesa, **entonces** no se crean duplicados incompatibles.

### Escenario 3
**Dado** la referencia no debe revelar existencia privada, **cuando** se envía una solicitud inválida, **entonces** la respuesta pública permanece neutral.

## Reglas de negocio
Recibir una denuncia no oculta automáticamente. Minimización de datos y no exposición de media privada.

## Validaciones y permisos
No requiere cuenta; rate limiting/antiabuso conforme infraestructura vigente.

## Casos de error y estados vacíos
Motivo inválido, rate limit, timeout, referencia inválida/no revelable y error temporal.

## Datos / contratos afectados
ReportCase intake, reportReason, public reference, idempotency key, receivedAt.

## Dependencias técnicas y funcionales
Galería EL-EP-007 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** contrato de media visible de EL-EP-007; contrato EL-EP-014
- **blocks:** EL-TK-116, EL-TK-120, EL-TK-121, EL-TK-123

## Pruebas requeridas
Recepción, neutralidad, idempotencia, rate limit y media retirada durante envío.

## Observabilidad / auditoría
Auditar recepción mínima sin copiar contenido reportado.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013; DEC-016, DEC-088; EL-EP-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).

## Cierre de implementación — 2026-10-12

- **Resultado:** APROBADO.
- **Implementación:**
  - Implementado servicio `MediaReportService` y repositorio `PostgresMediaReportRepository` en `@eventlens/media-inspection/src/media-report-and-removal.ts`.
  - Creada tabla canónica y modelo `media_report_case` (migración `202610120050_media_reports_and_removal`) con índice único en `dedup_key`.
  - Catálogo formal de motivos: `INAPPROPRIATE_CONTENT`, `PRIVACY_VIOLATION`, `INTIMACY_VIOLATION`, `COPYRIGHT_INFRINGEMENT`, `OTHER`.
- **Criterios de aceptación verificados:**
  - Escenario 1: Medios visibles (`PUBLISHED`) con motivo válido se registran en `media_report_case` con status `PENDING_REVIEW` y severidad `UNCLASSIFIED`, confirmando recepción sin afirmar resolución ni auto-ocultar (DEC-088).
  - Escenario 2: Reintentos o timeouts con la misma clave de idempotencia devuelven el caso existente sin duplicar registros.
  - Escenario 3: Neutralidad pública estricta: ante medios inexistentes o no visibles, la respuesta pública es idéntica y neutral ("Reporte recibido para revisión") sin filtrar la existencia de contenido privado.
- **Pruebas:** 4 pruebas unitarias en `media-report-and-removal.unit.test.ts` y 3 pruebas de integración en `media-report-and-removal.integration.test.ts` contra PostgreSQL 16. Build limpio.

