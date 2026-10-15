# EL-TK-255 — Producir imágenes de release reproducibles

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero desplegar el mismo artefacto validado sin compilar en EC2.

## Alcance funcional
Dockerfiles multistage API/worker/scheduler/gateway/web estática, locks/digests/SBOM y perfiles scanner; no modificar runtime contracts.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Imágenes ARM nativas con digest, user no-root y herramientas mínimas. No dev-server/tests/secrets; artefactos multimedia conservan perfil aprobado. Source SHA→digest verificable.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-246, EL-TK-251, EL-TK-252, EL-TK-253, EL-TK-254
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
Build frozen/multiarch, smoke/readiness y image scans; prueba sin toolchain runtime y sin red parser.

## Evidencias
SBOM, provenance/digests, scan disposition, build reproducible.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
infra/beta Dockerfiles y manifests release (futuros). Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Digest amd64 hardcoded, supply chain o imagen scanner sin firmas vigentes.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Reauditoría focal tras EL-TK-265 — 2026-10-14

- UPDATE_REQUIRED: EL-TK-265 añade dependencias/configuración de recepción MinIO únicamente development; sus imágenes locales no son artefactos release certificados. El ticket permanece DRAFT y no queda resuelto por aquel DONE.
- Aceptación adicional: release Beta utiliza el proveedor aprobado por EL-TK-251 y rechaza la habilitación de flags de transporte development en producción. No promover Compose development ni requerir MinIO/S3 mediante el SDK de pruebas/local.
- Pruebas/evidencia adicional: build y smoke ARM64 nativos con dependencias multimedia y gateway reales, SBOM/digests por arquitectura, configuración productiva fail-closed y ausencia de flags/secretos/defaults development. Probar límites y hardening del transporte real en el artefacto final, no sólo compilación multiarch.
- Dependencias: mantener EL-TK-251/253 como gates de proveedor y pipeline; conservar la trazabilidad de EL-TK-265 como recepción privada parcial sin certificar aceptación/publicación ni compatibilidad ARM64 de Beta.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

