# EL-TK-034 — Aislar un original sospechoso en cuarentena

## Parent epic

EL-EP-006

## Status

READY

**CONFIRMED:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** aislar un original con resultado de seguridad sospechoso, **para** impedir su publicación, transformación y acceso normal.

## Criterios de aceptación

**Dado** un resultado de inspección que exige aislamiento, **cuando** se aplica, **entonces** la media pasa a `QUARANTINED`, conserva el original y no produce ni promueve derivados. **Dado** un organizador, **cuando** intenta reintentar, liberar o descargar esa media, **entonces** se deniega. **Dado** un resultado tardío, **cuando** la media ya está restringida, **entonces** no restaura visibilidad ni acceso.

## Validaciones y permisos

La detección automática puede aislar. El organizador no puede liberar cuarentena.

## Dependencias de tickets

- **depends_on:** EL-TK-033.
- **blocks:** EL-TK-041, EL-TK-042.
- **can_parallelize_with:** EL-TK-035, EL-TK-036, EL-TK-038.

## Pruebas requeridas

Aislamiento, preservación del original, denegación de lectura/reintento del organizador y protección frente a resultado tardío.

## Observabilidad / auditoría

Auditar causa sanitizada, actor/sistema, generación y transición.

## Prioridad / estimación

P0 / S

## Traceability

Q-023, Q-040, Q-041; DEC-037, DEC-038, DEC-075, DEC-076; EL-EP-006.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Policy de cuarentena implementable contra contrato de inspección; integración requiere033. No cambia permisos ni disposición del original.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
