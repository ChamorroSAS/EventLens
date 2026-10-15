# EL-TK-264 — Guardar permisos de subidas y galería en Invitados y Aportes

Parent epic: EL-EP-002; correctivo CR-012, colaboración EL-EP-005/EL-TK-092. Estado: DONE.
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para backend focal.
UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES; ui_designer ratifica APPROVED tras leer CR-012 y la excepción focal incorporada.

## Objetivo y alcance confirmado

Owner ordinario puede editar dos permisos independientes en DRAFT/SCHEDULED/ACTIVE usando canEditSettings existente. User confirma extensión focal desde pantalla ACTIVE; no mantener DRAFT-only de los métodos históricos para este comando nuevo. CLOSED/GRACE/SUSPENDED/terminal son read-only. No cambia estado del evento, PIN, consentimiento, QR, fechas ni propiedad de media.

## Aceptación

1. En Invitados y Aportes/Aportes y permisos aparecen Permitir subir fotos y videos y Permitir ver la galería, valores del mismo snapshot evento/revisión/capacidad, un Guardar permisos. Cuatro combinaciones independientes, sin cambios no guarda.
2. PUT /api/v1/events/{eventId}/configuration/participation recibe ambos booleanos estrictos, expectedRevision positiva e Idempotency-Key. Sesión owner ordinaria, Origin y CSRF validados bajo tx; actor ajeno neutral404, restringido/revocado/expired denegado.
3. Mutación de dominio atómica: flags, revision, receipt durable y audit. Replay exacto autorizado antes de CAS/estado, sin repetir efecto; key cambiada/conflicto de revisión diferenciados; rollback sin cambios parciales.
4. Desactivar uploads cancela AUTHORIZED/UPLOADING/CONFIRMING y libera reservas exactamente una vez por capacity-management bound al mismo tx, conserva VALIDATED/ACCEPTED/originales. Objetos provisionales/IDs quedan para cleanup real, sin afirmar purga/abort físico ni introducir stub. No IO storage dentro del tx. Carrera disable/confirm/authorize y orden de locks seguros comprobados en PG real.
5. UI busy bloquea doble envío; éxito sólo tras receipt y recarga autoritativa. CAS permite recargar revisión preservando propuesta, uncertain retry conserva payload/revisión/key; cambios de evento/permiso/sesión descartan respuestas obsoletas. No habilitar por fallback de UI.

## Handoff UI incorporado

Reusar EventGuestSettings/catálogo Switch nativo, labels/ayudas persistentes, formato TS/HTML/SCSS. Helpers: uploads requieren ACTIVE y políticas; desactivar cancela intentos sin confirmar/conserva aportes; galería sólo PUBLISHED y es independiente. DRAFT/SCHEDULED preparan permisos, no activan evento. Aviso visible: estos controles guardan permisos, transferencia real pendiente. CLOSED/GRACE/SUSPENDED/terminal valores read-only con motivo.

Error/estado/409CAS/idempotency/auth distintos, recarga conserva propuesta y muestra guardado actualmente vs propuesta; timeout no éxito, retry exacto. Mobile controles apilados, labels/ayudas vinculadas, foco y live announcements, sin nuevos tokens ni pantalla extra. No diálogo adicional para guardar reversible; no auto-save al salir.

## Plan de ejecución

1. Backend/domain servicio de participación y helper cancelación DB; adaptar orden evento→intento de métodos upload afectados. Port capacity con mismo tx. API scoped+OpenAPI aditiva, sin modificar legacy setters.
2. Generar contrato/cliente. Frontend nuevo componente event-participation-settings y montaje guest con misma configuration.snapshot; OrganizerService operación tipada.
3. Pruebas PG aisladas flags/replay/CAS/rollback/owner/restricted/CSRF/Origin/cancel/preservación/races. Tests de componente/servicio HTTP: cuatro combinaciones, uncertain/CAS/reload/cambio evento/read-only. Builds y contrato check.
4. Reviewer independiente, actualización Docker local healthy y documentación de resultados/limitación de transporte.

## Riesgos y cierre

Locks invertidos y release fuera del tx; tratar set flag como carga/purga física terminada; ampliar campos/estados no autorizados; flags de otro evento o receipts viejos. Cerrar sólo con evidencia y revisión PASS. Permiso almacenado no salta lifecycle/expiry/capacity/guestsession; no declarar HTTP galería/upload integrado ni cleanup físico demostrado.

## Evidencia de implementación — 2026-10-14

- Nuevo comando `EventParticipationService` y PUT `configuration/participation`, contrato OpenAPI y cliente generados. Setters históricos conservados. Sin migraciones ni cambios de infraestructura.
- Componente TS/HTML/SCSS con dos permisos independientes y un guardado conjunto. Consulta durante incertidumbre mantiene la propuesta bloqueada y el intento original; consultar flags iguales no acredita un receipt.
- Unitarias de dominio: 16/16 PASS. Frontend componente/cliente HTTP/dashboard: 42/42 PASS.
- PostgreSQL aislado: 7/7 casos focales PASS (flags/estados, replay/CAS/autorización, rollback, cancelación/preservación y carreras); regresión upload lifecycle/authorization: 10/10 PASS. Bases temporales verificadas mediante guard y limpiadas; no pruebas mutantes sobre datos locales.
- Builds dominio/API/web y comprobación OpenAPI/cliente PASS. Bundle inicial web 934.61 KB, supera advertencia existente de 600 KB y permanece bajo error de 1 MB.
- Revisión independiente: APPROVED, sin hallazgos accionables. Verificados permisos, CAS/replay, coordinación transaccional, preservación y estados de UI mediante fuente directa (grafo sin tracking para archivos focales).
- Runtime local actualizado: `docker compose up --build -d --wait api web` PASS; API y web Healthy, readiness y página web HTTP 200. Volúmenes conservados; servicio PostgreSQL de pruebas restaurado a stopped. Sin prueba manual en teléfonos ni afirmación de transferencia real.
