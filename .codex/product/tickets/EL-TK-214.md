# EL-TK-214 — Validar la entrada pública integrada

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** equipo de producto, **quiero** verificar la entrada pública integrada contra sus contratos, **para** detectar rutas, permisos, sesiones y serving que no funcionan en conjunto.

## Alcance funcional
Ejecutar y documentar validación integrada de los montajes de EL-EP-018: OpenAPI/cliente, API con PostgreSQL real cuando aplique, build/serving y Playwright. Corregir únicamente fallos dentro de los tickets predecesores mediante sus responsables; no añade capacidad funcional nueva.

public-entry-contract.md/ui-public-entry.md normativos: probar transporte real/DB/serving, no mocks como única evidencia. Los harness parciales206..211 no certifican root final:213 ensamblado y212serving son predecesoras. Fallos regresan al ticket propietario; no rediseño/autoridad nueva.

## Fuera de alcance
No certifica publicación pública, revisión legal, indexación comercial ni sustituye pruebas específicas de dominio ya asignadas.

## Criterios de aceptación
### Recorridos críticos
**Dado** el runtime integrado, **cuando** se ejecutan los recorridos de Home, login/retorno, Beta, Mi cuenta ordinaria/restringida, Mis eventos, logout y guest directo, **entonces** cumplen sus contratos sin una autoridad concedida por cliente.

### Límites de transporte
**Dado** refresh, URL maliciosa, back/forward y rutas API/media, **cuando** se prueban en serving real, **entonces** no hay open redirect, absorción SPA indebida ni exposición de lookupKey en logs verificables.

### Accesibilidad
**Dado** teclado, foco, reflow/zoom y estados de error/carga, **cuando** se prueba la interfaz integrada, **entonces** se conservan los requisitos del handoff; la revisión manual de lector queda registrada separada de automatización.

## Dependencias de tickets
- **depends_on:** EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210, EL-TK-211, EL-TK-212, EL-TK-213.
- **blocks:** ninguno.
- **can_parallelize_with:** ninguno.

## Pruebas requeridas
Vitest/cliente, API y PostgreSQL real para permisos/CSRF/no enumeración, build/serving y Playwright de flujos definidos. Adjuntar resultados reales; no declarar PASS no ejecutado.

## Prioridad / estimación
P0 / M

## Riesgos / notas
Un fallo de integración vuelve al ticket propietario; no convierte el ticket en un contenedor de rediseño.

## Traceability
EL-EP-018; `public-entry-contract.md`; `ui-public-entry.md`; EL-TD-004/006; EL-EP-017/Q-029.

## Definition of Ready
- [x] Alcance de validación y recorridos definidos
- [x] Criterios observables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: NO. READY_FOR_FRONTEND_PLANNING: NOT_APPLICABLE. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
