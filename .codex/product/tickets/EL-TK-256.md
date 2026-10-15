# EL-TK-256 — Definir Compose Beta y HTTPS con renovación

## Parent epic
EL-EP-020. Cambio: CR-011.

## Status
DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO para este alcance; cualquier cambio visible requiere gate UI separado.

## User story / objetivo
Como operador de Phoeve, quiero servir SPA/API/guest/media bajo HTTPS conservando datos y aislamiento.

## Alcance funcional
Compose release/edge/ACME/config/migrate, healthchecks/resources/mount guards; runtime secret wiring aprobado.

## Fuera de alcance
Crear recursos/aplicar Terraform durante la planificación, comprar dominios, secretos versionados y operaciones destructivas no aprobadas. No modificar contratos históricos sin gate.

## Criterios de aceptación
Sólo80/443 publicados; guest deep-link funciona; cookies Secure/HttpOnly/SameSite, Origin/CSRF y redacción correctos. LOCAL_ADMIN dev no habilitado. Pepper/defaults rechazados en Beta. Cert persistente renueva y alerta; missing mounts/authority no inicia con data vacía.

## Reglas de negocio / datos y contratos
Preservar contratos enumerados en docs/aws-beta-audit.md y aws-beta-plan.md: independencia del journal, denegación conservadora, integridad/privacidad/purga y RPO/RTO. No S3 obligatorio. Fuente propuesta, no decisión arquitectónica adoptada.

## Validaciones y permisos / errores
Actor autorizado por gate de la capacidad; menor privilegio y redacción. Ante evidencia ausente, autoridad incierta, permisos inválidos o dependencia no READY, bloquear efecto/promoción. No fallback silencioso ni bootstrap nuevo sobre datos perdidos.

## Dependencias técnicas y funcionales
depends_on: EL-TK-249, EL-TK-250, EL-TK-255
Todos dependen de cierre de los BLOCKER de CR-011 aplicables. No empezar ejecución por estar enumerado en orden.

## Pruebas requeridas
compose config sin imprimir secrets, cert staging/renewal, browser mobile, logout/revoke/CSRF, ausencia disco/DB/authority, no public media/swagger no aprobado.

## Evidencias
Manifest redacted, cert/renewal traces sin claves, readiness y deny matrix.
Guardar comandos/versiones/ambiente/resultado y artefactos sanitizados en sesión trazable; no presumir PASS de pruebas no ejecutadas.

## Observabilidad / auditoría
Registrar intención, actor autorizado, release/plan/revisión y fallo de gate sin secrets; operacionalizar métricas que correspondan al alcance.

## Prioridad / estimación
P0 preparación Beta. Estimación PENDING del planner tras decisiones/gate.

## Archivos candidatos
infra/beta Compose/edge y API startup config. Paths futuros semánticos por responsabilidad; no directorios con ID de ticket.

## Riesgos / notas
Dev server, exposición original o headers proxy confiados al cliente.
Bloqueantes globales: región/proveedores/capacidad/costo/gates/autoridad; ver CR-011. Riesgos particulares se resuelven con las pruebas y revisión descritas.

## Reauditoría focal tras EL-TK-265 — 2026-10-14

- UPDATE_REQUIRED: el POST firmado same-origin funciona hoy mediante proxy Angular development y MinIO privado; no existe por ello un edge Beta certificado. EL-TK-265 DONE no resuelve este ticket DRAFT.
- Aceptación adicional: sustituir el proxy Angular por edge TLS productivo compatible con el contrato de transporte existente, streaming y límites de cuerpo/tiempo/concurrencia acotados. Mantener grants scoped, redacción de firmas y objetos privados; denegar GET/listado y métodos/rutas no autorizados en el endpoint de carga.
- Pruebas/evidencia adicional: carga real desde navegador móvil bajo HTTPS hasta receipt durable con hash/bytes exactos, tamaño máximo, timeout/corte/retry, Host/Origin/CSRF y ausencia de lectura/listado público. Verificar persistencia de recibos/objetos tras recrear contenedores y mounts ausentes fail-closed.
- Dependencias: proveedor y release aprobados de EL-TK-251/255; no activar el flag MinIO development en producción como atajo. El gate UI de EL-TK-265 sigue aplicando mientras no cambie la interacción visible.

## Definition of Ready
- [x] Objetivo y alcance propuestos.
- [x] Dependencias y aceptación identificadas.
- [ ] Decisiones BLOCKER aplicables cerradas.
- [ ] Baseline/requirements/architecture gate focal aprobado.
- [ ] Ticket revisado y promovido explícitamente a READY.

## Condiciones de cierre / Definition of Done
Implementación dentro de alcance aprobado; pruebas requeridas y evidencia real PASS; contratos/documentos sincronizados; reviewer independiente aprobado (gate crítico cuando corresponda); sin preguntas de seguridad/recuperación abiertas. Aprobación de apply/apertura es independiente del cierre documental. No marcar DONE por este plan.

