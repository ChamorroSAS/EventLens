# EL-TK-060 — Evaluar aislamiento efectivo y quiescencia mediante spike controlado

## Type

SPIKE

## Parent epic

EL-EP-006

## Status

DONE

## User story

**Como** equipo técnico, **quiero** evaluar aislamiento y detención efectiva de writers, **para** recomendar a architect un mecanismo mínimo sustentado por evidencia.

## Objetivo y fronteras

TB-02 prueba efectividad ARCH-005/006 con entorno real mínimo059: CPU/memoria/tiempo/PIDs/threads/scratch/píxeles/streams; red/privilegios/secretos aislados; lease/heartbeat/DB/cancel/generation/epoch/fence y quiescencia de writers externos PUT/multipart/cleanup/crash. Este ticket autoriza implementar y ejecutar un helper/prototipo experimental limitado para probar esos casos. Fuera: tools/infra finales, ejecutor productivo056 o pipeline media completo.

## Casos de prueba e inyección de fallos

**Dado** REQUIRED_FOR_SPIKES disponible y límites/config registrados, **cuando** procesa fixtures adversariales y children/fork bajo presupuestos acotados, **entonces** mide límites efectivos/descendientes máximos sin pruebas host inseguras o carga no acotada; demuestra ausencia de escape de recurso/privilegio/red/secretos.

**Dado** PUT/multipart pausado/tardío o finish/ACK Unknown, **cuando** corta heartbeat/DB, revoca lease, cancela o cambia generation/epoch y mata proceso, **entonces** no promueve ejecución obsoleta y supervisor experimental detiene subprocess/descendientes/nuevo IO; inventaría writers y verifica drain/quiescencia antes de declarar complete físico. Fencing SQL no basta para parar PUT. Unknown pendiente no se convierte en Missing/éxito. Cleanup nunca borra original ni derivado activo.

### Scratch por intento y recuperación tras crash

**Dado** directorio scratch por intento, **cuando** lee/escribe o se inyecta crash, **entonces** entradas permanecen protegidas, salidas acotadas por configuración y otro intento no puede acceder a ese directorio. Recovery registra inventario y cleanup seguro de scratch/partials, preservando originales y derivados activos; no declara limpieza completa con writer/resultado físico desconocido. Evidencia incluye permisos/paths scoped, límites, crash timeline e inventario antes/después de recuperación.

## Evidencia obligatoria

Versiones/configuración/límites aplicados, proceso/descendientes, máximo de recursos, deadline de reacción registrado para configuración ensayada, timeline IO/fault/lease, refs/generation/inventory por intento, permisos scoped y confirmación de writer drain. Evidencia real PG/storage/runtime, no mocks únicos.

## PASS, FAIL y conclusión

PASS requiere límites efectivos respetados y deadline registrado cumplido, sin escape/red/secretos, sin promoción obsoleta, writer quiescence antes de completo físico, Unknown pendiente y conservación original/activo. FAIL si escape, stale promotion, falso complete físico o evidencia insuficiente/indeterminada. Entrega informe y recomendación de mecanismo/config mínimos a architect con límites/limitaciones. Ticket experimental puede concluir con FAIL evidenciado: no declara producción validada ni desbloquea061. Sólo resultado PASS explícito y verificado permite061, no mera finalización de060.

Los valores `READY_FOR_IMPLEMENTATION: NO`, `EXPERIMENT_EXECUTION: NOT_RUN` y `EXPERIMENT_RESULT: PENDING` de la definición original describían la etapa previa a disponer del laboratorio EL-TK-059; quedan como historia, no como estado actual.

**Resultado ejecutado y verificado:** `EXPERIMENT_EXECUTION: COMPLETED`; `EXPERIMENT_RESULT: PASS`; `REQUIREMENTS_READY: YES`; `READY_FOR_IMPLEMENTATION: YES` para ejecutar el experimento. El PASS no certifica un ejecutor productivo ni valida gates operacionales. Ver [informe de ejecución](../sessions/2026-10-08-el-tk-060-implementation.md) y las evidencias bajo `infra/spikes/evidence/spike060-*.json`.

## Dependencias de tickets

- **depends_on:** EL-TK-059.
- **blocks:** EL-TK-061 sólo tras PASS explícito.
- **can_parallelize_with:** preparación contractual independiente de owners existentes; ejecución de spikes respeta secuencia y resultados.

## Prioridad / estimación

P0 / M

## Traceability

Enabler compartido con EL-EP-002 por contrato, sin nueva épica. TB-02 ratificado; [Fuente del paquete](../sessions/2026-10-08-technical-blockers-approved-contracts.md); technical-baseline EL-TD-001..007; ARCH-005/006; media-and-jobs-architecture/testing-strategy/operations-and-recovery pertinentes.

## Definition of Ready

- [x] Objetivo/alcance/criterios/evidencia/salida experimentales conocidos
- [x] Permisos/dependencias/fallos y fases delimitados
- [x] Sin pregunta funcional nueva
- [x] Quality gate requirements_reviewer del paquete APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para ejecución del spike, ya completada con resultado PASS y verificación independiente. Los campos NO/NOT_RUN/PENDING del dictamen previo son históricos y fueron superados al quedar disponible EL-TK-059. EL-TK-061 puede ejecutarse conforme a su propia preparación; este registro no lo inicia. Las limitaciones experimentales y los gates pendientes constan en el informe de ejecución.


## Reevaluación vigente ARCH-015 — 2026-10-09

**CONFIRMED:** REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. DONE20/20PASS. ARCH-015 evaluó y adoptó mecanismo; adopción ya no pendiente. Evidencia original intacta; no implementa055/056 ni certifica semántica universal de storage/gates.

Fuente: [contrato ARCH-015](../../context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) y [impacto](../sessions/2026-10-09-arch-015-backlog-impact.md). TB-01/TB-02 resueltos experimentalmente; no bloqueadores activos. Cuando YES, describe construcción del alcance propio por contratos cerrados, no integración usable ni upstream implementado. Los dictámenes/scopes anteriores conservan historia donde difieren. MEDIA-001/CAP-001/DR-001/EXPORT-001 siguen VALIDATION_REQUIRED; sin proveedor adoptado.
