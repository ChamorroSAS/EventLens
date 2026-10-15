# EL-TK-251 — Implementar gateway privado de media en filesystem

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero usar EBS local manteniendo integridad y permisos del contrato neutral.

## Alcance funcional
Adapter filesystem/gateway para clases, streams/chunks/range, version/checksum y operationId/drain; sin S3 Beta; no adaptar UI sin gate propio.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Original exacto inmutable; permisos temporales scoped verifican revocación/epoch; no traversal/symlinks/listado público. Cuota física/confirmación/dedup/crash coherentes. UNKNOWN no equivale a borrado/IO terminado; writers drenados antes de purge.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-245
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
Contract tests con filesystem real, PUT tardío/cancel/revoke/oversize, checksum/retry/range/traversal, restore/tombstones y mobile upload.

## Evidencias
Matriz capacidades contra ObjectStorage, hashes y pruebas de IO terminal real; no fixture llamado productivo.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
packages/media-execution contratos y adapter/gateway semántico nuevo; integración API. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Tráfico de100 uploads por host, path injection o bypass por static server.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Reauditoría focal tras EL-TK-265 — 2026-10-14

- UPDATE_REQUIRED: EL-TK-265 está DONE sólo para recepción privada development con MinIO y recibo `CONFIRMING`; no resuelve este ticket Beta ni adopta un proveedor productivo. Mantener DRAFT y gates pendientes de CR-011.
- Aceptación adicional: el adapter filesystem neutral debe conservar identidad lógica de versión inmutable, bytes y SHA-256 observado de las versiones fuente/sellada del recibo; un path mutable o inode no demuestra esa identidad. Reutilizar invariantes del transporte existente sin incorporar SDK MinIO como requisito de producción.
- Compatibilidad requerida: preservar el contrato HTTP de carga POST same-origin y grants de intento/objeto/tamaño/MIME exactos. Drain, crash, retry y writers tardíos deben tener resultado reconciliable; inventariar staging, sellos y huérfanos antes de limpieza, sin confundir `CONFIRMING` con aceptación/publicación.
- Pruebas/evidencia adicional: matriz de equivalencia contra EL-TK-265 con filesystem real, cambios de versión, reintento después de crash, grant tardío y hash/bytes exactos. El layout interno de MinIO no constituye un adapter filesystem ni prueba de portabilidad.
- Dependencia: conservar el gate arquitectónico de EL-TK-245 para almacenamiento Beta. La UX de EL-TK-265 ya tiene gate; sólo reabrir UI si cambia el protocolo o comportamiento visible.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

