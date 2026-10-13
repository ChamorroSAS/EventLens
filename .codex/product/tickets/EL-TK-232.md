# EL-TK-232 — Construir formulario visual de zona horaria
## Parent epic
EL-EP-019
## Status
READY
## User story
Como organizador, quiero cambiar la zona horaria en una sección separada, para revisar su efecto antes de guardar fecha/hora.
## Alcance funcional
Crear TimezoneSelect IANA con búsqueda, zona confirmada, aviso SCHEDULED y guardar TZ mediante cliente tipado; mantener fecha/hora como sección distinta.
## Fuera de alcance
No combina comandos TZ/calendario ni permite ACTIVE.
## Criterios de aceptación
### Cambio permitido
**Dado** DRAFT y capacidad, **cuando** guarda TZ válida, **entonces** anuncia sólo zona horaria guardada.
### Advertencia
**Dado** SCHEDULED permitido, **cuando** prepara cambio, **entonces** muestra aviso de recálculo antes de confirmar.
### Error
**Dado** 409/422/503, **cuando** falla, **entonces** conserva entradas pertinentes y no afirma cambio.
## Reglas de negocio
Frontend no decide IANA/DST; no reintenta automáticamente.
## Validaciones y permisos
Capacidad específica, foco/label/reflow y datos actuales al cambiar ruta.
## Casos de error y estados vacíos
TZ inválida y permiso removido bloquean comando sin reutilizar cache.
## Datos / contratos afectados
Cliente PUT timezone; sección Programación.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-227, EL-TK-228, EL-TK-231. **blocks:** EL-TK-237. **can_parallelize_with:** ninguno; comparte sección Programación.
## Pruebas requeridas
Vitest estados/aviso; Playwright búsqueda, teclado, SCHEDULED/error y responsive aislado.
## Observabilidad / auditoría
Sin IANA/fecha completa en trazas no necesarias.
## Prioridad / estimación
P0 / S. Fase 4.
## Riesgos / notas
Activación bloqueada por EL-TK-222.
## Traceability
EL-EP-019; DEC-070; UI/contrato.
## Definition of Ready
- [x] Separación de grupos y estados definida
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
TZ guardada separadamente sin transacción visual ficticia.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/lifecycle/event-schedule-form.component.ts`, `apps/web/src/app/organizer/organizer.service.ts`, `apps/web/src/app/organizer/event-settings-nav.component.ts`.
- **test:** nuevo `apps/web/src/app/organizer/event-timezone-form.component.spec.ts` si se introduce componente semántico; pruebas existentes de formulario lifecycle.
