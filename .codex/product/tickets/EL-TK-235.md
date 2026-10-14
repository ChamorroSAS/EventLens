# EL-TK-235 — Montar entrada y shell de consola administrativa
## Parent epic
EL-EP-019
## Status
IN_PROGRESS

## Evidencia de ejecución actual
Implementación inactiva autorizada: cliente generado, sesión/guard separados, limpieza privada, revalidación y logout incierto con confirmación explícita. Rutas usan un shell de sólo lectura sin UI histórica de mutaciones. Activación/cierre pendientes de EL-TK-222 y laboratorio HTTPS. Evidencia y límites en `.codex/product/sessions/2026-10-13-admin-console-inactive-delivery.md`.
## User story
Como administrador, quiero entrar y salir por una interfaz separada, para mantener aislada la sesión administrativa.
## Alcance funcional
Crear LoginForm.admin, guard/session service, shell, logout y rutas admin con cliente generado; limpiar secreto tras intento/salida, cache/datos privados en logout y retorno admin allowlisted.
## Fuera de alcance
No enlace desde Home, autoelevación, recuperación, persistencia de secreto/CSRF ni UI de acciones admin.
## Criterios de aceptación
### Entrada
**Dado** sesión ausente, **cuando** abre `/admin/ingresar`, **entonces** ve formulario admin con error neutro y transporte seguro.
### Sesión vigente
**Dado** sesión validada, **cuando** llega a login, **entonces** navega sólo a destino admin permitido sin pedir secreto.
### Salida incierta
**Dado** ACK logout incierto, **cuando** ocurre, **entonces** limpia presentación privada y no afirma revocación.
## Reglas de negocio
401 no se presenta como credencial incorrecta; 503 mantiene indisponibilidad/retry, no anónimo automático.
## Validaciones y permisos
Guard revalida, no confía en header/UI; secreto oculto y nunca URL/log/telemetría.
## Casos de error y estados vacíos
403, sesión revocada y pérdida CSRF no restauran datos desde cache.
## Datos / contratos afectados
Rutas admin, cliente auth/session/context/logout, UI handoff.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-223, EL-TK-233. **blocks:** EL-TK-236, EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Vitest guards/limpieza; Playwright aislado login, return allowlist, logout incierto, teclado/foco/responsive.
## Observabilidad / auditoría
Sin credencial, cookie o CSRF en evidencia/captura.
## Prioridad / estimación
P0 / M. Fase 5.
## Riesgos / notas
ACTIVATION BLOCKED por EL-TK-222.
## Traceability
EL-EP-019; UI/contrato admin; EL-TK-223/233.
## Definition of Ready
- [x] Flujo y límites de sesión definidos
- [x] Gate 2 de planificación aprobado
## Condiciones de ejecución pendientes
- [ ] Autoridad operacional acreditada y dependencias validadas, incluido EL-TK-222, antes de ejecutar/activar
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Entrada/salida accesibles sin mezclar sesiones ni secretos en cliente.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/admin/admin-app-shell.component.ts`, `apps/web/src/app/admin/admin-api.service.ts`, `apps/web/src/app/app.routes.ts`.
- **test:** `apps/web/src/app/admin/admin-console.component.spec.ts`, nuevo `apps/web/src/app/admin/admin-login.component.spec.ts` si se introduce componente semántico.
