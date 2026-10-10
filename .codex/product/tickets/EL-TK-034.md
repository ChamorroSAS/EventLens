# EL-TK-034 — Aislar un original sospechoso en cuarentena

## Parent epic

EL-EP-006

## Status

DONE

**HISTÓRICO:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes antes de implementación. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). La readiness original se conserva en ese contexto.

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

## Cierre de implementación — 2026-10-10

**CONFIRMED:** la cuarentena se aplica únicamente a un hecho persistido de inspección con `THREAT_DETECTED`, `DECLARED_FORMAT_MISMATCH` o `CONTAINER_MISMATCH`. La barrera de `RecoveryAuthority` y el checkpoint PostgreSQL validan autoridad y revisión actuales; media, auditoría sanitizada y receipt se confirman atómicamente, y el ACK ocurre fuera de la transacción. El replay compatible recupera un ACK perdido sin lease vigente sólo tras validar la misma secuencia de autoridad y la restricción actual. Los resultados tardíos o hechos distintos quedan en conflicto y no reabren acceso.

El guard de acceso deniega operaciones normales sobre estado `QUARANTINED` y difiere la autorización de otros estados a su policy propietaria. Esta implementación no completa el job, drena físicamente writers, purga ni reemplaza el original, ni implementa rutas HTTP de descarga/liberación o liberación administrativa. El adapter durable de producción de `RecoveryAuthority` sigue pendiente; sin la capacidad requerida, el flujo falla cerrado. Sin proveedor de object storage seleccionado.

**Validación independiente:** 79/79 pruebas en la suite combinada de inspección/cuarentena (32 integración de inspección, 14 unitarias de inspección, 19 integración de cuarentena y 14 unitarias de cuarentena); la ejecución específica de cuarentena pasó 33/33 y la regresión de job queue pasó 25/25. Typecheck, build, PostgreSQL 16 real y MinIO de laboratorio: PASS. Tester, reviewer y critical_review: APPROVED/PASS sin hallazgos. Evidencia, comandos y límites en el [harness](../../../infra/validation/media-inspection/README.md#el-tk-034-cuarentena-evidencia-final).

MEDIA-001, CAP-001, DR-001 y EXPORT-001 siguen `NOT_EVALUATED`. Completar EL-TK-034 satisface únicamente esa predecesora; no cambia readiness de EL-TK-041 ni EL-TK-042 ni sus otras dependencias.
