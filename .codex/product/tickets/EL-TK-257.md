# EL-TK-257 — Acreditar PITR exterior de PostgreSQL

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero recuperar DB a un instante sin depender del host aplicación.

## Alcance funcional
pgBackRest o alternativa aprobada: full diario/WAL continuo, destino exterior Amazon S3 aprobado por usuario el 2026-10-15, cifrado/retención y alertas; no dumps locales como equivalente. Standard recomendada, herramienta/IAM/retención y pruebas aún pendientes. Trazabilidad: DEC-113 y docs/aws-beta-ticket-closure-plan.md.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Cadena válida≥7d, full diario, RPO≤1h; archive éxito sólo después de persistencia exterior. Roles runtime no borran repo; secrets recuperables autorizados. Spool/outage no agota DB sin alerta. Snapshot complementa, no reemplaza PITR.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. S3 aprobado para backups exteriores; no autoriza media operativa S3 ni autoridad S3. Diseño/implementación sujetos a gates pendientes.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-245, EL-TK-249
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
PG16 real restore targets, WAL gaps/outage/credential rotation, retention boundary, claves y checksums; sin tocar dev DB.

## Evidencias
Manifest base/WAL, LSN/timestamps, restore target y medición pérdida; logs redacted.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
imagen/config PG y backup runbooks/repo aprobado. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
WAL perdido, repo en mismo host o retention que rompe cadena.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

