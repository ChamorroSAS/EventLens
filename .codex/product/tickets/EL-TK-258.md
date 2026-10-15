# EL-TK-258 — Recuperar multimedia y purgar copias técnicas

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero conservar originales recuperables sin resucitar objetos eliminados.

## Alcance funcional
restic o alternativa cifrada hacia Amazon S3 aprobado para backups por usuario el 2026-10-15, inventory/checksum y reconciliación externa de tombstones; rotación por ancla/deadline. Standard recomendada; RPO media no aprobado. Trazabilidad: DEC-113 y docs/aws-beta-ticket-closure-plan.md.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Restore conserva bytes/versiones exactos y no sirve purgados ni exports invalidados; Missing explícito. Copias técnicas expiran≤30d con evidencia; horizonte y RPO media explícitamente aprobados. Backup staging/scratch no constituye original.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. S3 aprobado sólo para backups, filesystem/EBS operativo; autoridad y RPO media siguen pendientes. Sin gate de implementación ni restore acreditado.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-251, EL-TK-252, EL-TK-257
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
Restore filesystem real con DB antigua/delete posterior, corrupt/missing original, retención/forget/prune y revocación download; medir throughput.

## Evidencias
Inventario/sha, log expiry redacted y cálculo de capacidad/tiempo; sin URLs/tokens.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
backup-media y reconciliación storage/purge, runbook. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Retención infinita, backup incompleto concurrente oobject purgado.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Reauditoría focal tras EL-TK-265 — 2026-10-14

- UPDATE_REQUIRED: incluir recibos `local_upload_transfer`, versiones fuente/sellada, SHA-256 y bytes en el inventario consistente con los objetos reales. EL-TK-265 no aporta backup/restore Beta ni resuelve este ticket DRAFT.
- Aceptación adicional: restaurar y verificar identidades exactas del recibo SQL contra objetos del proveedor aprobado; identificar explícitamente missing/corrupt/orphan y transferencias pendientes. Copiar el layout interno de MinIO no demuestra un restore filesystem neutral válido.
- Reconciliación requerida: con DB anterior, aplicar autoridad vigente de revocaciones y tombstones, reconciliar reservas/cuota sin doble consumo/liberación y no volver visible un objeto purgado o pendiente. Preservar independencia del journal; snapshots de EBS no sustituyen PITR.
- Pruebas/evidencia adicional: backup concurrente con upload/confirm/crash, writers tardíos y drain, restore de receipt y versión exacta, DB antigua con revocación/borrado posterior y expiración efectiva de copias técnicas. Conservar hashes, inventario, discrepancias y resolución sanitizados; no declarar cleanup físico por cancelación lógica.
- Dependencias: EL-TK-251 debe definir el mapping de identidad/versiones y EL-TK-257 la recuperación SQL. Retención, RPO y drenaje permanecen sujetos a gates de CR-011, sin sustituirlos por el DONE de transporte local.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

