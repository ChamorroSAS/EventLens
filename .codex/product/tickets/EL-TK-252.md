# EL-TK-252 — Conectar autoridad antirollback a runtime Beta

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero denegar credenciales revocadas incluso después de restauración histórica y pérdida del host.

## Alcance funcional
Adapter/control autorizado independiente, single-writer/CAS, anchoring y wiring production; eliminar fallbacks indebidos/no-op barriers en scopes expuestos; mantener scripts recovery bloqueados hasta implementación acreditada.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Epoch/floors/checkpoint no disminuyen ante restart/PITR/prefix antiguo. Journal perdido/desmontado no bootstrap nuevo. PREPARE→SQL→ACK idempotente y ambiguo cerrado; API/worker/scheduler comparten autoridad consistente sin writers locales conflictivos. MOD-008/barriers y MOD-002/003 tienen garantía verificable o scope bloqueado.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-245
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
PostgreSQL real + autoridad real: PITR anterior a revoke, crash PREPARE/SQL/ACK, dos procesos, outage tras initialize, truncation/prefix/empty mount, authorized reconcile y permisos negativos.

## Evidencias
A–G ampliados, timestamps/floors/digest redacted, DB/authority independientes, reviewer y critical_review con razón concreta de integridad.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
packages/identity, API provider/config, recovery/barrier adapters y runbook. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Rollback de revocaciones, límites por proceso y recuperación que confía DB antigua.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

