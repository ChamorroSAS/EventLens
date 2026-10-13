# EL-TK-208 — Montar la solicitud pública de acceso Beta

## Parent epic
EL-EP-018

## Status
DONE

## User story
**Como** visitante, **quiero** enviar mi correo para solicitar acceso Beta, **para** dejar una solicitud sin crear una cuenta ni conocer su existencia.

## Alcance funcional
Montar controller/adapter runtime del servicio requestAccess de008, OpenAPI y cliente generado; no recrear validación/deduplicación/límites de negocio. Materializar AccessRequestForm canónico si falta código y exportar descriptor real `/solicitar-acceso` para213.008 DONE no acredita endpoint/formulario operativo. Sólo correo/envío/neutral/429/indisponible/retry/regreso a Home. Normativos public-entry-contract.md/ui-public-entry.md; pruebas reales del componente y transporte antes de activación final.

## Fuera de alcance
No emite invitaciones, activa cuentas, agrega marketing/campos personales, ni cambia la política de EL-TK-008.

## Criterios de aceptación
### Respuesta neutra
**Dado** un correo nuevo o existente, **cuando** se envía una solicitud válida, **entonces** muestra “Solicitud recibida” sin revelar cuenta, invitación o solicitud previa.

### Límite e indisponibilidad
**Dado** `429` o fallo temporal, **cuando** llega la respuesta, **entonces** conserva el correo sólo en memoria, informa retry acorde a `retryAfter` cuando exista y no crea una cuenta.

## Validaciones y permisos
Público sin sesión; validación de correo y no enumeración pertenecen al servidor. No persistir correo en storage ni analítica.

## Dependencias de tickets
- **depends_on:** EL-TK-008, EL-TK-206.
- **blocks:** EL-TK-213, EL-TK-214.
- **can_parallelize_with:** EL-TK-205, EL-TK-207, EL-TK-211, EL-TK-212 sólo después de satisfacer las predecesoras propias de cada uno y sin editar los mismos archivos.

## Pruebas requeridas
Vitest de estados/formulario y a11y; API/cliente contra respuesta neutra, inválido, `429` e indisponible; Playwright de flujo anónimo.

## Prioridad / estimación
P0 / S

## Traceability
EL-EP-018; EL-TK-008; `ui-public-entry.md`; EL-TD-004/006.

## Definition of Ready
- [x] Alcance y respuesta neutral delimitados
- [x] Criterios y errores comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: YES. IMPLEMENTED: YES.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
