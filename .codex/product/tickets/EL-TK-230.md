# EL-TK-230 — Construir formulario visual de nombre del evento
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero editar el nombre de un borrador, para mantener su información general confirmada.
## Alcance funcional
Crear General con sólo nombre, Guardar/Descartar, capacidad granular y ConfirmDialog al navegar con cambios; consume PATCH tipado y proyección actual.
## Fuera de alcance
No fecha/TZ/lifecycle ni mutación si no es DRAFT.
## Criterios de aceptación
### Guardar
**Dado** capacidad y revisión vigente, **cuando** guarda, **entonces** anuncia una vez nombre guardado y conserva foco.
### Descartar
**Dado** cambios locales, **cuando** descarta, **entonces** restaura dato confirmado sin mutar.
### Conflicto
**Dado** 409, **cuando** llega respuesta, **entonces** conserva entrada y solicita consultar/reaplicar conscientemente.
## Reglas de negocio
No retry automático ni overwrite; UI no infiere permiso.
## Validaciones y permisos
Labels/error asociado, guard de capacidad, sesión cambia limpia datos.
## Casos de error y estados vacíos
422, 403/401, 503 y timeout muestran estado sin éxito ficticio.
## Datos / contratos afectados
Cliente PATCH name, capacidades y rutas General.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-225, EL-TK-228. **blocks:** EL-TK-237. **can_parallelize_with:** EL-TK-229, EL-TK-231 tras dependencias y archivos disjuntos.
## Pruebas requeridas
Vitest cambios/confirmación/conflicto; Playwright teclado, foco, navegación y responsive aislado.
## Observabilidad / auditoría
Sin valores de formulario en trazas/capturas.
## Prioridad / estimación
P0 / S. Fase 4.
## Riesgos / notas
Activación bloqueada por EL-TK-222.
## Traceability
EL-EP-019; UI/contrato técnico; EL-TK-225/228.
## Definition of Ready
- [x] Estado DRAFT y UX definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: YES.
## Definition of Done
Edición accesible, protegida por capacidades y comprobada ante conflicto.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/organizer/organizer-dashboard.component.ts`, `apps/web/src/app/organizer/event-settings-nav.component.ts`, `apps/web/src/app/organizer/organizer.service.ts`.
- **test:** nuevo `apps/web/src/app/organizer/event-basic-info-form.component.spec.ts` si se introduce componente semántico.
