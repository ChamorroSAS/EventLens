# EL-TK-229 — Construir formulario visual de creación de borrador
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero crear mi evento desde Mis eventos, para continuar directamente a su detalle.
## Alcance funcional
Implementar CreateEventForm en BottomSheet móvil/Modal tablet-desktop con nombre, helper, cancelar, busy, Idempotency-Key en memoria y navegación al ID confirmado. Reusar componentes/tokens aprobados.
## Fuera de alcance
No implementa API, portada, fecha/TZ, publicación ni reenvío automático tras refresh.
## Criterios de aceptación
### Envío
**Dado** nombre válido, **cuando** confirma, **entonces** deshabilita doble envío y abre el detalle del ID ACK.
### Cancelación
**Dado** formulario sin envío, **cuando** cancela, **entonces** no crea y devuelve foco al CTA.
### Resultado incierto
**Dado** timeout, **cuando** no hay ACK, **entonces** conserva intención/key en memoria y ofrece reconciliar sin afirmar éxito.
## Reglas de negocio
Server valida trim1..120; cerrar durante envío no afirma cancelación.
## Validaciones y permisos
Sólo capacidades/proyección owner; no secreto ni actor en almacenamiento web.
## Casos de error y estados vacíos
422 muestra error asociado; 409 distingue idempotencia/CAS; lectura posterior fallida conserva ID.
## Datos / contratos afectados
Cliente POST events, rutas organizer y handoff UI.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-224, EL-TK-228. **blocks:** EL-TK-237. **can_parallelize_with:** EL-TK-230, EL-TK-231 tras contratos disponibles y archivos disjuntos.
## Pruebas requeridas
Angular/Vitest estados y foco; Playwright aislado móvil/desktop, busy, timeout y navegación confirmada.
## Observabilidad / auditoría
Telemetría/capturas sin nombre completo, keys ni datos privados.
## Prioridad / estimación
P0 / M. Fase 3.
## Riesgos / notas
ACTIVATION BLOCKED hasta EL-TK-222.
## Traceability
EL-EP-019; `ui-event-control-panels.md`; EL-TK-224/228.
## Definition of Ready
- [x] Flujo, feedback y dependencias definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: YES.
## Definition of Done
Formulario accesible y sin doble creación, validado contra cliente generado aislado.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/organizer/organizer-dashboard.component.ts`, `apps/web/src/app/organizer/organizer.service.ts`, `apps/web/src/app/organizer/event-list.component.ts`.
- **test:** `apps/web/src/app/organizer/organizer-dashboard.component.spec.ts`, nuevo `apps/web/src/app/organizer/create-event-form.component.spec.ts` si se introduce componente semántico.
