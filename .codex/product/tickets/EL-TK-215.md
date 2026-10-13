# EL-TK-215 — Aislar pruebas destructivas de PostgreSQL

## Parent epic
EL-EP-001

## Status
DONE

## Priority
P0. CR-005. UI_REQUIRED: NO.

## User story
Como desarrollador, quiero que las suites rechacen bases no pertenecientes al runner, para conservar datos de desarrollo.

## Alcance y criterios
- Denegar por defecto URL/config de pruebas sin identidad de ejecución.
- Verificar current_database, identidad de rol y marcador efectivo antes de escrituras destructivas; el nombre de base por sí solo no autoriza.
- Crear bases efímeras sin reutilizar bases existentes; limpiar exclusivamente recursos creados por esa ejecución tras verificar pertenencia.
- Cubrir harnesses independientes de identidad y consumidores centrales Prisma de pruebas.
- Integración Compose/CI y evidencia reproducible de rechazo sobre una base señuelo con datos preexistentes intactos.
- No ejecutar pruebas sobre eventlens ni modificar datos reales.

## Dependencias / pruebas / riesgos
EL-TD-003/006, @eventlens/database, scripts/workspace, harness identity. Unidades de política antes de integración real independiente. Conexiones SQL directas fuera del helper requieren guard explícito; documentar límites de cobertura. Sin cambios de dominio o migraciones históricas.

## Definition of Ready
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para corrección de seguridad autorizada por CR-005; revisión independiente y evidencia requeridas antes de DONE.

## Resultado — 2026-10-13
CONFIRMED: guardas y runner implementados; 25/25 infraestructura, 198/198 identidad, 5/5 guarda de inventario y 9/9 API ejecutadas en entornos aislados. Callback destructivo rechazado con sentinel intacto antes de suites. Revisión independiente APPROVED sin hallazgos pendientes. [Evidencia](../../../infra/validation/identity/evidence/bootstrap-isolation/result.json) y [sesión](../sessions/2026-10-13-admin-bootstrap-test-isolation.md). Sin acceso a datos de desarrollo ni certificación de Beta.
