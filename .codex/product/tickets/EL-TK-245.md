# EL-TK-245 — Resolver contratos y decisiones de operación Beta

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status

Actualización 2026-10-15: aprobación parcial expresa registrada en DEC-113: filesystem/EBS operativo y S3 para backups. Autoridad y RPO media NO aprobados. ADR PARTIALLY_APPROVED; Standard RECOMMENDED. Se han cerrado esas preguntas de producto, no el ticket. Mantener los gates abajo; plan de cierre y revisión: `docs/aws-beta-ticket-closure-plan.md`.
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero formalizar la excepción Beta de media local y los gates de autoridad/backup/costo sin alterar historia.

## Alcance funcional
ADR focal y actualización autorizada de DEC-063/061/EL-TD-008; reconciliar DEC-112 vs EL-TK-222 y documentar destino externo/antirollback; no implementar infraestructura.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Decisiones distinguen CONFIRMED/RECOMMENDED/PENDING; preservan ObjectStorage, purga, RPO/RTO y deny post-restore. Regiones/destinos/owners/budget y control DNS definidos. Ninguna propuesta se marca ACCEPTED sin decisión explícita.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: CR-011; EL-TK-218/221/222 como antecedentes, sin asumir acreditación productiva.
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
Revisión de requisitos/arquitectura focal y matriz de contratos, incluyendo falta de journal y prefix rollback.

## Evidencias
ADR aprobado, change log trazable y handoffs requirements/architecture; registro de aprobación.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
.codex/context y .codex/product/changes/CR-011.md. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Reducir garantías por presupuesto o llamar DONE a evidencia simulada.
Bloqueantes vigentes: autoridad/ancla/reconstrucción, RPO media, retención de copias, capacidad/costo, gates y control DNS; ver CR-011. Región, simultaneidad, filesystem operativo y destino S3 backup confirmados. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Definition of Ready

### Evaluación técnica posterior — 2026-10-14

CONFIRMED por usuario: us-east-1; dos eventos simultáneos de prueba; media operativa filesystem/EBS sin gateway S3. Se solicita evaluar S3 para backups y RecoveryAuthority frente a DynamoDB; no se adopta proveedor por esta solicitud. Región y simultaneidad dejan de ser preguntas abiertas; volumen, rotación mensual, retención y capacidad siguen PENDING.

Informe: `docs/aws-beta-technical-evaluation.md`. ADR: `docs/adr/beta-backups-and-recovery-authority.proposed.md`, PROPOSED / NOT_ACCEPTED. Evidencia pública de precios y calculador offline disponibles; no son benchmark ARM64 ni prueba PITR. Recomendación para revisión: backups S3 Standard y autoridad DynamoDB on-demand, sujetos a ancla de actualidad/reconstrucción, IAM, purga y protocolo probado. RPO media ≤1h propuesto, no aprobado.

Esta actualización prevalece sobre las preguntas históricas de región/cohorte y el precio EC2 sin SKU. No altera DRAFT/REQUIREMENTS_READY: NO/READY_FOR_IMPLEMENTATION: NO, ni decisiones aceptadas. No hubo delegación, asignación de responsabilidades ni recursos AWS. Bloqueantes y ensayos pendientes: secciones 8–9 del informe.

- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

