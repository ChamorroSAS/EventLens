# EL-TK-058 — Validar procesamiento mediante corpus móvil y métricas integradas

## Parent epic

EL-EP-006

## Status

READY

## User story

**Como** equipo técnico, **quiero** validar el pipeline con corpus móvil reproducible y métricas reales, **para** demostrar integridad, seguridad y objetivos de procesamiento antes de Beta.

## Alcance funcional

Validación integrada específica de procesamiento con corpus móvil reproducible y adapters reales, no benchmark global100 sesiones/Beta016 ni selección herramienta/proveedor. Instrumenta desde upload completo aceptado hasta preview utilizable, incluyendo espera de cola e inspección/transformación; no sólo duración interna del codec.

## Criterios de aceptación

**Dado** corpus permitido versionado de JPEG/PNG/WebP/HEIC/HEIF y MP4/MOV/WebM de teléfonos reales, **cuando** ejecuta pipeline/adapters, **entonces** registra muestras/fixtures, dispositivo/formato/tamaño/resultado y configuración runtime reproducibles; compara checksum/bytes originales antes/después, orientación/preview reproducible/playable, audio/rotación donde aplica y metadata derivada mínima. Casos maliciosos/tipo falso/truncados/bombas quedan aislados y sin promoción/lectura normal.

**Dado** muestra explícita reproducible de fotos/videos válidos en condiciones registradas, **cuando** calcula métricas desde aceptación completa, **entonces** reporta tamaño de muestra/denominador/éxitos/fallos, mediana/p95 con cola incluida y verifica foto mediana≤15s/p95≤60s/éxito≥98%; video mediana≤2min/p95≤5min/éxito≥95%. Muestra/observación insuficiente se informa sin afirmar cumplimiento; no inventa número de casos ni resultados ejecutados.

**Dado** fallos de lease/DB/crash/ACK/cleanup/restore, **cuando** los inyecta, **entonces** evidencia workers obsoletos sin promoción, originales/derivados activos conservados y outputs obsoletos limpios tras quiescencia, usando PG/adapters reales y no mocks como única evidencia. Incluye034 cuarentena y039 terminal sin cambiar esos tickets.

## Contratos y pruebas

Pipeline033..039, lease055/executor056/cleanup057 transitivos; Vitest/domain/components donde aplica, integración PostgreSQL real/API y Playwright preview móvil según MEDIACAP/testing-strategy. Browser/device/corpus/config/fecha/métricas/evidencia redactada reproducibles; sin medios privados/secretos en repo. Gate técnico localizado: disponibilidad de adapters/herramientas/rendiciones y entorno móvil reales para ejecutar; criterio de aceptación cerrado no certifica evidencia antes de ejecución.

## Dependencias de tickets

- **depends_on:** EL-TK-038, EL-TK-057.
- **blocks:** ninguno.
- **can_parallelize_with:** contratos/capacidades independientes; ejecución respeta predecesoras.

## Observabilidad / auditoría

operationId/media/resource/generation/epoch/resultado pertinentes; sin bytes, claves, firmas, secretos ni errores sensibles.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-006-09/08; EL-EP-006; media-and-jobs-architecture; operations-and-recovery; testing-strategy; ui-mvp-epic-review#el-ep-006 donde aplica; technical-baseline EL-TD-001..007. OpenAPI/REST/JSON, cliente Angular generado; Prisma sólo infraestructura, no dominio/DTO HTTP.

## Definition of Ready

- [x] Requisitos y criterios observables según alcance aprobado
- [x] Permisos/errores/contratos/dependencias identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

**HISTÓRICO — dictamen anterior al paquete TB:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). Adapters/rendiciones y entorno reales requeridos pendientes; no es bloqueo por pruebas aún no ejecutadas en sí mismas.

## Integración ratificada TB-01..05 — 2026-10-08 (HISTÓRICO; reevaluación vigente al final)

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- manifest/fixtures/harness
- instrumentación/métricas y pruebas contractuales

BLOCKED_SCOPE:
- evidencia integrada real upload→preview con pipeline productivo
- validación estadística MEDIA/restore donde aplica

BLOCKED_BY:
- 060/061 PASS y adapters/rendiciones productivos implementados
- pipeline033..039/056/057 real
- entorno REQUIRED_FOR_INTEGRATION vigente, no por falta de ejecutar pruebas en sí

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Manifest/harness/métricas preparables; evidencia integrada requiere pipeline/adapters reales, resultados/adopción de spikes y fase integración disponible.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. NO para ejecución completa: API/worker/pipeline/adapters productivos y fase REQUIRED_FOR_INTEGRATION todavía no disponibles;059 sólo acredita REQUIRED_FOR_SPIKES,038/057 y pipeline transitivo no implementados. No bloquea por gates sin PASS: producir evidencia es responsabilidad del ticket. Manifest/harness/métricas/fixtures/tests contractuales preparables sin regenerar corpus ni asumir porcentajes Beta.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
