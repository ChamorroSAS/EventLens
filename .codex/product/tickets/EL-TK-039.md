# EL-TK-039 — Cerrar un fallo técnico terminal de procesamiento

## Parent epic

EL-EP-006

## Status

DONE

**CONFIRMED:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** cerrar un fallo técnico terminal de procesamiento, **para** informar el fallo sin perder el original ni su historial.

## Criterios de aceptación

**Dado** un trabajo cuyo presupuesto automático se agotó o que falla como técnico terminal no reintentable y una media todavía vigente, **cuando** se aplica su resultado terminal, **entonces** queda `PROCESSING_FAILED`, conserva su original y registra historial/error sanitizado. **Dado** un hecho de inspección de seguridad aprobada, **cuando** se determina la elegibilidad, **entonces** expone que el original puede ser autorizado para descarga por EL-EP-010; pendiente, inconclusa o cuarentena no son elegibles. **Dado** una barrera o estado restrictivo posterior, **cuando** llega el cierre, **entonces** no lo sobrescribe.

## Fuera de alcance

Emitir o entregar un enlace de descarga; eso pertenece a EL-EP-010.

## Dependencias de tickets

- **depends_on:** EL-TK-033, EL-TK-038.
- **blocks:** EL-TK-040; hecho de elegibilidad consumido por EL-EP-010.
- **can_parallelize_with:** EL-TK-041, EL-TK-042.

## Pruebas requeridas

Agotamiento, conservación de original/historial, elegibilidad aprobada, denegación pendiente/inconclusa/cuarentena y resultado tardío restrictivo.

## Observabilidad / auditoría

Registrar causa sanitizada, estado de elegibilidad y correlación de ejecución.

## Prioridad / estimación

P0 / S

## Traceability

Q-014, Q-023, Q-040; DEC-014, DEC-037, DEC-064, DEC-075; EL-EP-006, EL-EP-010.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Cierre terminal/elegibilidad implementables por contratos033/038; integración requiere esas capacidades. PROCESSING_FAILED técnico no declara contenido inválido ni habilita descarga inconclusa.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
 
## Cierre de implementación — 2026-10-10

**CONFIRMED — DONE:** el reviewer y tester independiente aprobaron la implementación del cierre de fallo técnico terminal y determinación de elegibilidad de descarga.
- **Suite enfocada (EL-TK-039):** PASS 18/18 (14 pruebas de integración con PostgreSQL 16 real y 4 pruebas unitarias).
- **Regresión combinada (media-inspection):** PASS 300/300 en 14 archivos de test (inspection, quarantine, photo-derivatives, video-derivatives, successful-processing, transient-retry y terminal-failure).
- **Regresión de runtime (EL-TK-056):** PASS 21/21 en `media-execution` en contenedor Docker.
- **Typecheck, build y migraciones repetidas:** PASS.

Aspectos técnicos verificados:
1. **Transición terminal segura:** cuando un trabajo agota su presupuesto automático (`BUDGET_EXHAUSTED`, intento 3) o experimenta un fallo técnico no reintentable (`TERMINAL_TECHNICAL_ERROR`), `media_catalog` transiciona atómicamente a `PROCESSING_FAILED` con incremento de `revision`, preservando el `original` intacto y marcando el trabajo como `DEAD` en la cola.
2. **Elegibilidad de descarga según DEC-075:** la elegibilidad para descarga de original por EL-EP-010 se determina evaluando el hecho de seguridad (`SafetyFact`): es `true` si y solo si la seguridad fue aprobada explícitamente (`APPROVED`). Medios con seguridad pendiente (`PENDING`), inconclusa (`INCONCLUSIVE`) o en cuarentena/denegada (`DENIED`) son estrictamente no elegibles (`downloadEligible: false`). No se emiten enlaces de descarga (fuera de alcance, reservado a EL-EP-010).
3. **Protección contra sobrescritura restrictiva:** CAS en SQL corto condicionado a `status IN ('UPLOADED', 'PROCESSING')`. Nunca se sobrescriben estados terminales o restrictivos posteriores (`QUARANTINED`, `PUBLISHED`, `PENDING_REVIEW`, `HIDDEN`, `TRASHED`, `DELETED`, `REJECTED`).
4. **Idempotencia y auditoría:** replay compatible devuelve `ALREADY_COMMITTED` con su recibo inmutable (`media_terminal_failure_receipt`); replays en conflicto arrojan `IDEMPOTENCY_CONFLICT`. La auditoría (`media_terminal_failure_audit`) registra la causa clasificada, error sanitizado sin secretos ni paths del filesystem, y el estado de elegibilidad. Si la persistencia falla, se ejecuta rollback total.

Evidencia: [corrida enfocada](../../../infra/validation/media-inspection/evidence/terminal-failure-focused-final/), [regresión combinada](../../../infra/validation/media-inspection/evidence/terminal-failure-combined-regression/), [regresión runtime EL-TK-056](../../../infra/validation/media-execution/evidence/terminal-failure-independent-regression/) y [documentación](../../../infra/validation/media-inspection/README.md#el-tk-039-terminal-failure-and-download-eligibility-final-validation).

MEDIA-001, CAP-001, DR-001 y EXPORT-001 permanecen `NOT_EVALUATED`; storage definitivo continúa `DEFERRED`. Se desbloquea downstream EL-TK-040 y el hecho de elegibilidad para EL-EP-010.

