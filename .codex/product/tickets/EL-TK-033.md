# EL-TK-033 — Inspeccionar un original antes de transformarlo

## Parent epic

EL-EP-006

## Status

DONE

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer aprobó este conjunto sin hallazgos pendientes. Véase [dictamen](../sessions/2026-10-07-el-ep-006-ticket-review.md). READY expresa preparación de requisitos; se conservan las dependencias de ejecución.

## User story

**Como** sistema, **quiero** inspeccionar la integridad y seguridad real de un original, **para** decidir si puede transformarse o debe quedar aislado.

## Criterios de aceptación

**Dado** un trabajo reservado sobre un original, **cuando** la inspección valida bytes, contenedor y límites reales, **entonces** persiste metadata técnica mínima y un resultado de seguridad trazable para la generación inspeccionada. **Dado** que la inspección detecta una amenaza o inconsistencia de seguridad, **cuando** termina, **entonces** no habilita transformación ni acceso normal. **Dado** una inspección pendiente o inconclusa, **cuando** se consulta la elegibilidad del original para descarga, **entonces** el resultado es denegado.

## Fuera de alcance

Elegir codec, herramienta o proveedor; crear derivados; entregar una descarga.

## Datos / contratos afectados

`MediaInspector`, `MalwareInspection`, metadata técnica y hecho de seguridad consumible por `MediaSafetyPolicy` y EL-EP-010.

## Dependencias de tickets

- **depends_on:** EL-TK-032, EL-TK-056.
- **blocks:** EL-TK-034, EL-TK-035, EL-TK-036, EL-TK-039, EL-TK-040.
- **can_parallelize_with:** contratos independientes ya definidos; ejecución respeta predecesoras y conflictos serializados.

## Pruebas requeridas

Tipo declarado distinto al real, límite real inválido, inspección aprobada, amenaza, resultado inconcluso y no exposición de detalles sensibles.

## Observabilidad / auditoría

Errores sanitizados, resultado de inspección y generación; no registrar contenido ni secretos.

## Prioridad / estimación

P0 / M

## Traceability

Q-008, Q-014, Q-023, Q-040; DEC-014, DEC-037, DEC-075; EL-EP-006.

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

**HISTÓRICO — dictamen anterior al paquete TB:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-el-ep-006-ticket-remediation-review.md). Gate localizado de herramientas de inspección y ejecutor real pendiente.

Trazabilidad de remediación: GAP-EL-EP-006-04/08/10.

## Integración ratificada TB-01..05 — 2026-10-08 (HISTÓRICO; reevaluación vigente al final)

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- contratos metadata/safety
- invariantes/fixtures y tests de policy

BLOCKED_SCOPE:
- inspección real con tools aprobados/evidencia061
- ejecución aislada productiva056

BLOCKED_BY:
- 061 PASS/recomendación evaluada
- 056 integrado
- Capacidad REQUIRED_FOR_INTEGRATION de TB-04 compuesta con owners existentes;059 sólo entrega REQUIRED_FOR_SPIKES aguas arriba de060/061

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). Preparación contractual lista; full requiere061 PASS/adopción evaluada,056 integrado y capacidad de fase integración real compuesta con owners existentes.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. Tooling/inspector adoptados. Implementar metadata/límites/errores por ejecutor056 contratado; integración real requiere032/056. No certifica ausencia universal de malware.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.

## Gate de ejecución localizado — 2026-10-09 (HISTÓRICO; decisión cerrada por ARCH-016)

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO para el alcance completo. EL-TK-032 y EL-TK-056 están DONE; sus dependencias están satisfechas. El análisis y architect identificaron una decisión independiente todavía pendiente: el mecanismo real de `MalwareInspection`. ARCH-015 adopta herramientas de inspección de formato, pero conserva explícitamente la responsabilidad antimalware; una decodificación correcta no autoriza un resultado de seguridad aprobado.

PREPARATORY_SCOPE_READY: contratos, invariantes, fixtures y validación de formato con herramientas adoptadas. BLOCKED_SCOPE: inspección antimalware real y aprobación persistente del resultado de seguridad. BLOCKED_BY: decisión focal del mecanismo antimalware y evidencia de su configuración; no TB-01/TB-02 ni gates Beta futuros.

Propuesta RECOMMENDED/PENDING de architect: ClamAV local por intento aislado, firmas actualizadas fuera del parser y resultados incompletos fallando cerrado. No se adoptó motor, versión ni imagen y no se implementó código. El gate anterior YES conserva su alcance contractual histórico; este gate precisa el bloqueo del alcance completo. [Handoff y propuesta](../sessions/2026-10-09-el-tk-033-security-gate.md).

## Gate ARCH-016 antes de implementación — HISTÓRICO

**CONFIRMED:** el usuario aprobó ClamAV; ARCH-016 cierra el mecanismo antimalware. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para construir y validar el alcance propio. Dependencias032/056 DONE. Los resultados reales aprobados necesitan evidencia focal de motor/imagen, firmas, perfil, límites y aislamiento; no se presume PASS ni ticket completado. [Contrato y handoff](../sessions/2026-10-09-el-tk-033-clamav-contract.md).

## Cierre de implementación — 2026-10-09 (hora local)

**CONFIRMED — DONE:** la implementación y sus revisiones normal y crítica fueron aprobadas. El tester independiente obtuvo **46/46 PASS** (32 pruebas de integración con PostgreSQL real y 14 unitarias), `runId: media_inspection_e0b210a74a464bc88c99bd12a050661d`. Evidencia: [resultado](../../../infra/validation/media-inspection/evidence/tester-final/result.json), [pruebas](../../../infra/validation/media-inspection/evidence/tester-final/tests.json) y [manifest de hashes de fuente](../../../infra/validation/media-inspection/evidence/tester-final/implementation-source-hashes.json). El manifest de 29 archivos coincidió con el código revisado; las regresiones de EL-TK-055 (25/25) y EL-TK-056 (21/21) también pasaron. La imagen ejecutada fue ClamAV 1.4.6 con digest fijado y snapshot oficial de firmas verificado.

El alcance implementa inspección real de formato y decodificación acotada, escaneo ClamAV por intento con snapshot oficial inmutable, resultados de seguridad tipados y checkpoint/auditoría PostgreSQL bajo la autorización vigente del job. El checkpoint no finaliza el job del pipeline. Los resultados inconclusos o no aprobados no habilitan el original.

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES (satisfecho; ticket DONE). EL-TK-032 y EL-TK-056 estaban DONE antes de iniciar. Se preservan las dependencias y los bloqueos downstream registrados arriba; su satisfacción no cambia automáticamente el readiness de EL-TK-034/035/036/039/040. MEDIA-001, CAP-001, DR-001 y EXPORT-001 permanecen NOT_EVALUATED. No se certifica disponibilidad Beta ni ausencia universal de malware.
