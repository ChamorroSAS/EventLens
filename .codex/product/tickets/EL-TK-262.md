# EL-TK-262 — Acreditar DR y apertura de Beta cerrada

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero abrir Beta sólo tras restauración segura y operación verificadas.

## Alcance funcional
Ensayo host loss/PITR/media/authority y apertura autorizada; no probar destrucción sobre servicio real ni reabrir grants históricos.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
RPO DB≤1h/RTO servicio≤4h medidos end-to-end. Revocación posterior a target restore sigue denegada antes/después reconciliar; purgados no reaparecen, UNKNOWN cerrado. Epoch/leases/grants viejos invalidados. Permisos/acceso cerrado/mobile/codecs/alertas/costo dentro decisión final; no inventar PASS.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-250, EL-TK-251, EL-TK-253, EL-TK-256, EL-TK-258, EL-TK-260, EL-TK-261
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
DR001/CAP001 con PG real/authority actual/media, host nuevo aislado, permisos actor ajeno, barrier release parcial y rollback app; réplica de pérdida autoridad mantiene denegación.

## Evidencias
Timeline incidente→servicio, target LSN/hash/inventario, deny matrix, actual bill forecast y firma owner/seguridad; revisión independiente requerida.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
evidencia sesión DR, runbooks y gate de apertura. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Release por ticket DONE sin evidencia o costo parcial presentado como total.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Reauditoría focal tras EL-TK-265 — 2026-10-14

- UPDATE_REQUIRED: EL-TK-265 acredita recepción privada development hasta `CONFIRMING`, no un ensayo DR ni carga Beta aceptada/publicada. Este ticket conserva DRAFT y gates de apertura pendientes.
- Aceptación adicional: el ensayo debe cargar bytes reales mediante HTTPS y el proveedor Beta, recuperar receipt/versión/hash exactos y completar aceptación, worker y publicación con autoridad vigente. No acreditar éxito por ACK de transferencia ni por un objeto presente sin registro coherente.
- Pruebas/evidencia adicional: grants/writers tardíos durante pérdida de host, confirmación incierta y reintento tras restore; PITR anterior a revocación no rehabilita credenciales ni autoridad antigua. Reconciliar recibos, objetos, tombstones y cuota antes de reabrir, denegando ante UNKNOWN.
- Dependencias: explicitar EL-TK-251/253 para el recorrido real de almacenamiento y procesamiento, además de los gates existentes de release/backup/authority. Mantener los contratos de independencia y no rollback del journal; no medir RTO sólo hasta readiness de API.
- Evidencia de cierre: timeline hasta servicio recuperado utilizable, versiones/checksums y matriz de denegación post-PITR con revisión independiente. Las pruebas locales de EL-TK-265 son antecedentes reutilizables, no sustituyen la prueba Beta completa.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

