# EL-TK-207 — Integrar ingreso y cierre de sesión del organizador

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** organizador, **quiero** ingresar y cerrar mi propia sesión desde la navegación, **para** acceder a mis superficies sin afectar sesiones guest o administrativas.

## Alcance funcional
Materializar LoginForm canónico si falta código; exportar componente/descriptor real `/ingresar` para montaje final213. Montar controllers/adapters de login013 y logout015 en runtime, OpenAPI/cliente generado, cookie segura/expiración, Origin/CSRF y límites/verifier propietarios. No asumir API o formulario operativo por catálogo/DONE. Consumir205 para autoridad/retorno; busy/error neutrales. Logout propio limpia contexto/caches y termina en `/` anunciando sólo éxito confirmado o sesión ya expirada/revocada. Normativos public-entry-contract.md/ui-public-entry.md; harness real antes de activación final, sin nueva autenticación.

## Fuera de alcance
No crea autenticación, recuperación, MFA ni logout global; no modifica guest/admin ni restaura autoridad por apariencia tras un ACK incierto.

## Criterios de aceptación
### Ingreso y retorno
**Dado** un retorno interno válido y una sesión ordinaria autorizada, **cuando** el login concluye, **entonces** navega a ese destino; con retorno inválido o no autorizado termina en `/`.

### Cierre incierto
**Dado** que la confirmación de logout falla temporalmente, **cuando** la persona lo solicita, **entonces** se retira la presentación privada, se informa resultado indeterminado con reintento y no se anuncia revocación.

### Aislamiento
**Dado** una sesión guest o administrativa concurrente, **cuando** se cierra la de organizador, **entonces** esas sesiones no se eliminan ni se usan como autoridad organizador.

## Validaciones y permisos
Rate limit, errores neutrales y CSRF se conservan del owner. Login y logout nunca registran credenciales, token ni returnUrl no saneada.

## Dependencias de tickets
- **depends_on:** EL-TK-205, EL-TK-206, EL-TK-013, EL-TK-015, EL-TK-185.
- **blocks:** EL-TK-213, EL-TK-214.
- **can_parallelize_with:** EL-TK-208, EL-TK-211, EL-TK-212 sólo después de satisfacer las predecesoras propias de cada uno y sin editar los mismos archivos.

## Pruebas requeridas
API de permisos/CSRF y no enumeración; Vitest de estados; Playwright login/retorno permitido y malicioso, logout, retry y back/forward.

## Prioridad / estimación
P0 / M

## Traceability
EL-EP-018; MOD-001; `public-entry-contract.md`; `ui-public-entry.md`; EL-TK-013/185.

## Definition of Ready
- [x] Flujos, errores y aislamiento definidos
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
