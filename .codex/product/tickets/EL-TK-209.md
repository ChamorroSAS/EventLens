# EL-TK-209 — Componer Mi cuenta con superficies de sus propietarios

## Parent epic
EL-EP-018

## Status
DONE

## User story
**Como** organizador, **quiero** consultar Mi cuenta desde una ruta propia, **para** ver mis datos mínimos y usar las capacidades de seguridad, sesiones y eliminación autorizadas.

## Alcance funcional
Componer/exportar superficie y descriptor real `/mi-cuenta` para213 desde205: correo/verificación/estado read-only ordinarios y eliminación/reauth201. Materializar SecurityNotice/SessionList/Item/SignOutOtherSessionsAction canónicos si falta código, sin otro perfil/negocio. Montar controllers/adapters REST/OpenAPI y cliente generado de consultas/cierres propios014/016/017, reutilizando sus servicios/policies, no asumiendo endpoints. Restringida sólo consulta/cancelación015;201 y predecesoras son proveedor real/dependencia dura, no simulación ni duplicación. Normativos public-entry-contract.md/ui-public-entry.md.

## Fuera de alcance
No crea perfil editable, avatar, teléfono, cambio de contraseña, dashboard ni una segunda variante de eliminación/reauth.

## Criterios de aceptación
### Cuenta ordinaria
**Dado** un organizador ordinario autorizado, **cuando** abre `/mi-cuenta`, **entonces** ve sólo campos mínimos read-only y las superficies propias existentes.

### Cuenta restringida
**Dado** estado `PENDING_DELETION`, **cuando** abre la ruta, **entonces** sólo puede consultar/cancelar según EL-TK-201 y no ve sesiones, seguridad ni Mis eventos ordinarios.

### Pérdida de autorización
**Dado** que cambia la autoridad durante la carga, **cuando** llega la respuesta, **entonces** se retiran datos privados y no se confirma una eliminación por inferencia.

## Validaciones y permisos
Servidor conserva autorización. No presentar campos internos, tokens, fechas técnicas ni datos de otra cuenta.

## Dependencias de tickets
- **depends_on:** EL-TK-205, EL-TK-206, EL-TK-014, EL-TK-016, EL-TK-017, EL-TK-201.
- **blocks:** EL-TK-213, EL-TK-214.
- **can_parallelize_with:** EL-TK-207, EL-TK-208, EL-TK-210, EL-TK-211, EL-TK-212 después de sus predecesoras.

## Pruebas requeridas
Vitest de composición ordinaria/restringida/loading/error; API de autorización propia/ajena; Playwright de ruta directa, sesión vencida y teclado/foco.

## Prioridad / estimación
P0 / M

## Traceability
EL-EP-018; MOD-001/MOD-008; EL-TK-186/191/192/193/201; `public-entry-contract.md`.

## Definition of Ready
- [x] Campos y composición delimitados
- [x] Restricciones y errores comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: YES. IMPLEMENTED: YES.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
