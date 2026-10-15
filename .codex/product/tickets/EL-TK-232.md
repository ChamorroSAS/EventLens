# EL-TK-232 — Construir formulario visual de zona horaria
## Parent epic
EL-EP-019
## Status
DONE
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
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
- [x] TZ guardada separadamente sin transacción visual ficticia.
- [x] Componente `EventTimezoneSectionComponent` creado e integrado en la pestaña Programación de `organizer-dashboard.component.ts`.
- [x] Buscador reactivo de zonas horarias IANA preservando la opción actualmente seleccionada.
- [x] Badge visible con la zona horaria confirmada del evento.
- [x] Advertencia explícita ante eventos en estado `SCHEDULED` antes de confirmar el cambio de zona horaria.
- [x] Bloqueo e información visible ante eventos en estado `ACTIVE`.
- [x] Manejo de error 409 con botón de reconciliación de datos y conservación de entradas.
- [x] Pruebas unitarias completas en `event-timezone-section.component.spec.ts` (6 pruebas pasando, 32 suites web en verde).
## Archivos candidatos
- **read/modify:** `apps/web/src/app/organizer/event-timezone-section.component.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.scss`.
- **test:** `apps/web/src/app/organizer/event-timezone-section.component.spec.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.spec.ts`.

