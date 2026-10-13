# EL-TK-210 — Montar Mis eventos en la ruta del shell organizador

## Parent epic
EL-EP-018

## Status
DONE

## User story
**Como** organizador ordinario, **quiero** abrir Mis eventos desde la navegación, **para** llegar al shell y dashboard existentes sin crear otra experiencia de gestión.

## Alcance funcional
Exportar superficie/descriptor real `/mis-eventos` con Dashboard/Shell existentes para213. Montar controllers/adapters de consultas047 en runtime, OpenAPI/cliente generado; sustituir fetch manual de OrganizerService por el cliente. Reutilizar queries/policies047, sin negocio nuevo ni asumir que sus URLs sean APIs montadas.205 y owner autorizan cada request; conservar loading/vacío/error/retry y negar restringida/guest/admin. Normativos public-entry-contract.md/ui-public-entry.md.

## Fuera de alcance
No implementa creación/configuración de eventos, filtros, nuevas proyecciones, ni muestra dashboard a sesión restringida, guest o admin por semejanza visual.

## Criterios de aceptación
### Acceso autorizado
**Dado** un organizador ordinario autorizado, **cuando** navega a `/mis-eventos`, **entonces** se monta el shell existente y sus datos se obtienen por el contrato propietario.

### Acceso restringido
**Dado** un visitante, sesión desconocida o `PENDING_DELETION`, **cuando** solicita la ruta, **entonces** no recibe datos/eventos y el servidor conserva la denegación.

## Dependencias de tickets
- **depends_on:** EL-TK-205, EL-TK-206, EL-TK-047, EL-TK-048.
- **blocks:** EL-TK-213, EL-TK-214.
- **can_parallelize_with:** EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-211, EL-TK-212 después de sus predecesoras.

## Pruebas requeridas
API de autorización/no enumeración; Vitest de montaje y estados owner; Playwright de ruta directa, refresh y denegación/restricción.

## Prioridad / estimación
P0 / M

## Traceability
EL-EP-018; MOD-002; EL-TK-047/048; `public-entry-contract.md`.

## Definition of Ready
- [x] Owner y límites definidos
- [x] Criterios y permisos comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: YES. IMPLEMENTED: YES.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
