# EL-TK-035 — Generar derivados web de una fotografía aprobada

## Parent epic

EL-EP-006

## Status

DONE

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresaba preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** generar miniatura y versión web de una fotografía aprobada, **para** que pueda verse en navegadores sin reemplazar su original.

## Criterios de aceptación

**Dado** una fotografía cuya inspección permite procesarla, **cuando** el worker transforma una generación vigente, **entonces** guarda derivados separados y utilizables, respeta orientación, no copia EXIF/localización innecesaria y conserva el original exacto. **Dado** HEIC/HEIF aprobado, **cuando** el navegador no puede visualizar el original, **entonces** se genera un preview web reproducible. **Dado** que la ejecución pierde autorización o generación, **cuando** termina, **entonces** no promueve sus salidas parciales.

## Fuera de alcance

Seleccionar biblioteca o formato de implementación; publicar el resultado.

## Dependencias de tickets

- **depends_on:** EL-TK-033.
- **blocks:** EL-TK-037.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

JPEG/PNG/WebP/HEIC aprobados, orientación, original byte-identical, derivado aislado y salida inválida/parcial no promovida.

## Observabilidad / auditoría

Medir duración y resultado por tipo sin registrar bytes ni metadata privada innecesaria.

## Prioridad / estimación

P0 / M

## Traceability

Q-008, Q-014; DEC-009, DEC-014, DEC-063; EL-EP-006.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final2026-10-08:** remediación APPROVED; aprobación de2026-10-07 histórica. Referencias vigentes: technical-baseline EL-TD-001..007, api-conventions, media-and-jobs-architecture, operations-and-recovery y testing-strategy; no elección DEFERRED. REST/JSON/OpenAPI y cliente Angular generado, sin DTO internos Nest ni entidades Prisma como dominio/HTTP.

### Consistencia y recuperación observable
**Dado** ejecución/comando autorizado con revisión/generation/epoch vigentes, **cuando** confirma su efecto, **entonces** cambio media/job y audit/recibo/intención pertinente se registran atómicamente en SQL corto; rollback no conserva transición ni trabajo/intención parcial. Replay compatible devuelve recibo/efecto previo; payload distinto/revisión vieja da conflicto sin sobrescribir. Original y derivados activos no se sustituyen por efectos parciales o tardíos.

**Dado** carrera de claim/ciclo o pérdida lease/DB/permiso, **cuando** llega un resultado antiguo, **entonces** CAS/fence/epoch y policy vigentes impiden promoverlo o reactivar recurso restringido. Lease en DB no detiene PUT físico: ejecutor056 cancela IO/subproceso y cleanup057 exige drain/quiescencia antes de borrar. Reconciliación utiliza facts/revisión/barrier RecoveryAuthority del owner MOD-003 por puerto compartido; scopes sin checkpoint íntegro permanecen cerrados después PITR. No ampliar046 (MOD-001) ni construir segunda authority/adapter.

### Pruebas requeridas por riesgo
Vitest de policy/invariantes; PostgreSQL real para atomicidad, rollback, replay y carreras de claim/generación/ciclo. API verifica permiso/errores/esquema pertinente. Inyectar crash/ACK perdido/pérdida lease/DB y restore anterior al cambio: worker previo no promueve; snapshot sin reconciliar no autoriza. Las pruebas de consumidores cubren034 cuarentena y039 cierre terminal sin modificar sus artefactos VALID KEEP. Corpus/métricas integrados en058; no resultados ejecutados en fase documental.

### Gate técnico localizado (HISTÓRICO; cerrado por ARCH-015)
Inspector/transformer consume ejecución056 (transitiva por033 para035/036). Herramientas/codecs/targets de rendición y configuración efectiva de límites se concretan mediante architect/planner antes de ejecución real; este ticket no elige herramienta/proveedor ni inventa límites. Dominio/puertos neutrales pueden prepararse; full procesamiento real no se declara implementable hasta ese gate.

**HISTÓRICO — dictamen anterior al paquete TB:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). Gate localizado de herramientas, targets de rendición y ejecutor real pendiente.

Trazabilidad de remediación: GAP-EL-EP-006-04/08/10.

## Integración ratificada TB-01..05 — 2026-10-08 (HISTÓRICO; reevaluación vigente al final)

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- contratos orientación/original/generation
- tests de fixtures y pérdida de permiso

BLOCKED_SCOPE:
- decodificación/rendición reales según061
- ejecutor056 integrado

BLOCKED_BY:
- 061 PASS y adopción técnica pertinente
- 033/056 integrados
- entorno integración real

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Preparación lista; full requiere rendiciones aprobadas tras061,033/056 integrados y entorno real.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Implementar transformer según rendiciones oficiales ARCH-015, orientación/proporciones/no upscale/original exacto y metadata sensible omitida. Integración requiere033/056, no certifica todo HEIF.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Cierre de implementación — 2026-10-10

**CONFIRMED:** `GeneratePhotoDerivatives` consume el hecho de inspección vigente y la referencia inmutable exacta del original mediante el ejecutor supervisado. Genera dos candidatos JPEG privados conforme a ARCH-015: thumbnail de hasta 320 px de ancho y preview de hasta 960 px, con orientación y proporciones preservadas, sin ampliación y sin EXIF/localización. Decodifica y valida ambos resultados, calcula sus hashes desde los bytes escritos y verifica mediante lectura posterior la versión inmutable almacenada. El original se conserva sin cambios.

El par de candidatos, su auditoría y receipt compatible se registran atómicamente para la generación y token de ejecución. El replay idéntico devuelve el resultado persistido; un retry con nuevo token conserva el historial previo. Revisión/generación/autoridad obsoletas, salida parcial o inválida, fallo de verificación y drain `UNKNOWN` no registran candidatos. Los fallos y métricas exponen sólo resultados sanitizados. La operación no publica candidatos, no completa el job y no limpia objetos de intentos; esas responsabilidades corresponden a EL-TK-037 y EL-TK-057.

La composición del worker de producción, los adapters durables de `RecoveryAuthority` y object storage, y el wiring de observabilidad permanecen para integración posterior. La evidencia usa adapters de laboratorio y no elige proveedor de storage. El manifiesto de 14 archivos y la imagen de validación con 12 archivos embebidos coinciden con el resultado verificado.

**Validación:** corrida enfocada del implementer PASS 60/60; tester independiente: regresión combinada de inspección/cuarentena/fotos PASS 139/139 y regresión EL-TK-056 PASS 21/21. Typecheck, build, ensamblado y aplicación repetida de migraciones, tester y reviewer/critical_review: PASS, sin hallazgos. Evidencia, comando reproducible y límites en el [harness](../../../infra/validation/media-inspection/README.md#el-tk-035-photo-derivatives-final-validation).

EL-TK-035 queda DONE y satisface su arista hacia EL-TK-037; la dependencia restante de 037 con EL-TK-036 no cambia. MEDIA-001, CAP-001, DR-001 y EXPORT-001 continúan `NOT_EVALUATED`; no se certifica Beta ni se selecciona proveedor de storage.
