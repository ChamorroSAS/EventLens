# EL-TK-236 — Construir búsqueda y detalle administrativo de sólo lectura
## Parent epic
EL-EP-019
## Status
READY
## User story
Como administrador, quiero buscar y leer eventos en una interfaz responsive, para revisar información autorizada sin ejecutar acciones.
## Alcance funcional
Construir AdminEventSearch/Detail usando cliente generado, estados sin búsqueda/buscando/vacío/error/resultados, paginación, cards móvil/tabla accesible desktop, PARTIAL por sección y retorno con foco.
## Fuera de alcance
No previews/media, acciones, grants, jobs, auditoría UI o nuevos filtros/políticas.
## Criterios de aceptación
### Búsqueda
**Dado** sesión válida, **cuando** busca, **entonces** muestra resultados paginados y descarta respuesta tardía.
### Detalle
**Dado** deep-link autorizado, **cuando** abre, **entonces** muestra datos mínimos/partial y volver conserva consulta/foco.
### Indisponibilidad
**Dado** 503 o permiso perdido, **cuando** responde, **entonces** limpia privado y ofrece retry, sin cero falso.
## Reglas de negocio
Sólo eventos abren detalle; no inferir totales ni capacidades por UI.
## Validaciones y permisos
Guard/sesión cliente revalidados; links/buttons semánticos, h1/caption/headers.
## Casos de error y estados vacíos
401/403/404 neutros, búsqueda cancelada/obsoleta no monta resultados.
## Datos / contratos afectados
Cliente admin search/detail y rutas/shell.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-234, EL-TK-235. **blocks:** EL-TK-238. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Vitest estados/race; Playwright aislado deep-link, retorno foco, 320/1024, teclado/tabla/cards/PARTIAL.
## Observabilidad / auditoría
Capturas/trazas sanitizadas; no datos privados innecesarios.
## Prioridad / estimación
P0 / M. Fase 5.
## Riesgos / notas
Activación queda bloqueada por EL-TK-222.
## Traceability
EL-EP-019; UI admin; EL-TK-234/235.
## Definition of Ready
- [x] Estados UI y contrato read-only definidos
- [x] Gate 2/autoridad aprobados
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
UI read-only responsive verificada sin presentación insegura ante fallo.
## Archivos candidatos
- **read/modify:** `apps/web/src/app/admin/admin-event-search.component.ts`, `apps/web/src/app/admin/admin-event-detail.component.ts`, `apps/web/src/app/admin/admin-api.service.ts`.
- **test:** `apps/web/src/app/admin/admin-console.component.spec.ts`, nuevo `apps/web/src/app/admin/admin-event-search.component.spec.ts` si falta cobertura específica.
