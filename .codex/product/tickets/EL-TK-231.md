# EL-TK-231 — Construir formulario visual de fecha y hora
## Parent epic
EL-EP-019
## Status
READY
## User story
Como organizador, quiero guardar fecha y hora local de mi borrador, para programarlo sin activarlo.
## Alcance funcional
Crear FormSection de fecha/hora con DatePicker/TimePicker, TZ confirmada visible, RadioGroup de overlap y cliente schedule tipado.
## Fuera de alcance
No cambia TZ ni agrega borrar programación/publicación.
## Criterios de aceptación
### Guardado
**Dado** DRAFT y TZ confirmada, **cuando** guarda, **entonces** anuncia sólo fecha/hora guardadas.
### Gap
**Dado** 422 de hora inexistente, **cuando** responde owner, **entonces** muestra mensaje asociado y no simula cálculo local.
### Overlap
**Dado** offsets permitidos, **cuando** usuario elige uno, **entonces** lo envía; al cambiar datos invalida elección incompatible.
## Reglas de negocio
No usar TZ pendiente ni guardar grupos conjuntamente.
## Validaciones y permisos
Capacidad granular y revisión; teclado/labels/foco conforme handoff.
## Casos de error y estados vacíos
409/timeout mantiene entradas y exige reconciliación consciente.
## Datos / contratos afectados
Cliente PUT schedule y configuración programacion.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-226, EL-TK-228. **blocks:** EL-TK-232, EL-TK-237. **can_parallelize_with:** EL-TK-229, EL-TK-230 tras dependencias y archivos disjuntos.
## Pruebas requeridas
Vitest DST y estados; Playwright RadioGroup/teclado/reflow aislado.
## Observabilidad / auditoría
Sin fecha, offset o datos privados innecesarios en capturas.
## Prioridad / estimación
P0 / M. Fase 4.
## Riesgos / notas
Activación bloqueada por EL-TK-222.
## Traceability
EL-EP-019; DEC-070; UI/contrato.
## Definition of Ready
- [x] Campos/DST/errores definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Guardado independiente, accesible y sin cálculo DST cliente acreditado.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/lifecycle/event-schedule-form.component.ts`, `apps/web/src/app/organizer/organizer.service.ts`, `apps/web/src/app/organizer/event-settings-nav.component.ts`.
- **test:** `apps/web/src/app/lifecycle/event-lifecycle-panel.component.spec.ts`, nuevo `apps/web/src/app/organizer/event-schedule-form.component.spec.ts` si se extrae el formulario.
