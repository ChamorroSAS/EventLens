# EL-TK-228 — Proyectar lista, detalle y capacidades del organizador
## Parent epic
EL-EP-019
## Status
READY
## User story
Como organizador, quiero consultar mis eventos y sus capacidades por URL, para editar sólo lo que el servidor permite.
## Alcance funcional
Consumir/montar consultas owner autorizadas para lista/detalle/configuración; añadir capacidades granulares `canEditName`, `canSetLocalSchedule`, `canChangeTimezone`, preservando campos existentes. Limpiar datos/capacidades A antes de leer B y descartar respuestas tardías.
## Fuera de alcance
No crea mutaciones/formularios ni reinterpreta flags amplios como permisos específicos.
## Criterios de aceptación
### Lista propia
**Dado** sesión ordinaria, **cuando** abre `/mis-eventos`, **entonces** recibe sólo lista propia con carga/vacío/error distinguibles.
### Detalle seguro
**Dado** URL de evento ajeno o ausente, **cuando** consulta, **entonces** recibe resultado neutro sin datos ni capacidades.
### Carrera A→B
**Dado** navegación A→B y respuesta A tardía, **cuando** llega A, **entonces** no se monta bajo B.
## Reglas de negocio
Capacidades vienen de owner y estado actual; receipt no reemplaza proyección actual.
## Validaciones y permisos
Revalidar sesión/revocación/authority; privado no-store y sin ORM crudo.
## Casos de error y estados vacíos
401/403 limpia presentación privada; 503 ofrece retry explícito sin conceder permiso.
## Datos / contratos afectados
GET `/events`, configuration y OpenAPI/cliente; MOD-002/MOD-001.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-223, EL-TK-220, EL-TK-221. **blocks:** EL-TK-229, EL-TK-230, EL-TK-231, EL-TK-232, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
API/cliente y Angular aislados para ownership, capacidades, cache/no-store, A→B tardío y revocación.
## Observabilidad / auditoría
Logs de ruta/correlationId redacted; sin nombres/cookies/tokens.
## Prioridad / estimación
P0 / M. Fase 3.
## Riesgos / notas
No activar lectura privada hasta garantías EL-TK-221/222 aplicables.
## Traceability
EL-EP-019; EL-TK-047/048/210; contrato técnico/UI.
## Definition of Ready
- [x] Proyecciones, permisos y carreras definidos
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: NO actual (PENDING_DEPENDENCIES); IMPLEMENTABLE_AFTER_DEPENDENCIES: YES. Validar depends_on antes de ejecutar; no repetir Gate2 salvo cambio material. Activación nuevas mutaciones/admin BLOCKED por EL-TK-221/222 y evidencias finales. IMPLEMENTED: NO.
## Definition of Done
Consultas reales autorizadas y limpieza de carreras verificadas en laboratorio.
## Archivos candidatos
- **read/modify:** `apps/api/src/events/organizer-events.controller.ts`, `apps/web/src/app/organizer/organizer.service.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.ts`, `packages/event-management/src/event-draft.ts`.
- **test:** `apps/api/test/integration/organizer-account-and-events.test.ts`, `apps/web/src/app/organizer/organizer-dashboard.component.spec.ts`, `packages/event-management/test/event-organizer-query.integration.test.ts`.
