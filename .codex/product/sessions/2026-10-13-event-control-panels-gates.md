# EL-EP-019 — planificación y gates, 2026-10-13

## Participantes y objetivo

Usuario, orquestador y revisores independientes `panels_requirements`, `panels_architecture`, `panels_ui`, `panels_security`. Completar planificación, sin código funcional, sin merge ni publicación.

## Contexto confirmado

- Snapshot `stage` y `origin/stage` sincronizados en `87d8230aee44a7f8b3cd7b2bbdfccac04b41aeb2`, verificado con fetch el 2026-10-13. Nueva rama documental `docs/event-control-panels-plan-20261013`.
- Informe previo preservado: [revisión inicial](../../../docs/reports/event-control-panels-implementation-plan-2026-10-13.md). El `NEEDS_CHANGES` original sigue siendo evidencia histórica.
- Solicitud adjunta `95749a98`: MVP organizador listado propio, creación DRAFT, nombre, fecha/hora/TZ, detalle; admin entrada segura, búsqueda y detalle. Todo lo demás diferido.
- Inventario local y árbol de `origin/stage`: serie de épicas hasta018, tickets hasta217, cambios hastaCR-006. No reutilizar IDs. La disponibilidad se vuelve a comprobar antes de escribir tickets.
- Grafo Tier2 generación2026-10-09: símbolos actuales mayormente `not_tracked`; búsquedas y coverage seguidas de fuente directa. No se usó ausencia en grafo como prueba de inexistencia.

## Gate1 — requisitos

Revisor: `panels_requirements`, revisión read-only independiente. Dictamen: **APPROVED**, `REQUIREMENTS_READY: YES` para el MVP; `UI_REQUIRED: YES`; implementación todavía depende de arquitectura/UI/Gate2. Ningún BLOCKER de producto.

Evidencia revisada: solicitud, informe, DEC-069/070/036, EL-EP-002, remediaciones aceptadas EL-TK-021/023/024, EL-TK-146/147, handoffs MVP y baseline/API.

Alcance exacto: nombre trim1..120; DRAFT restrictivo DEC-069; nombre/horario DRAFT-only; TZ DRAFT/SCHEDULED antes de ACTIVE, conserva local/recalcula UTC y advierte en SCHEDULED; DST gap rechazado/overlap exige offset. Guardado no activa ni publica. Admin read-only sin media, acciones, jobs ni pantallas adicionales. Eventos/organizadores buscables según contrato existente, solo eventos abren detalle.

Hallazgos técnicos obligatorios: comandos no reciben expectedRevision y reutilizan la clave mutable del evento. Corregir con trabajo nuevo de owner; DONE histórico no acredita CAS/recibos. Al cambiar evento limpiar capacidades y descartar respuestas tardías. Runtime propio de navegación difiere del Angular Router aceptado.

## Evidencia de ejecución

Esta sesión es de planificación y revisión estática. No se ejecutaron suites funcionales ni se consultaron/modificaron datos de desarrollo. Los PASS de tareas anteriores no son pruebas de EL-EP-019.

## Arquitectura — dictamen e incorporación

`panels_architecture`: APPROVED_FOR_PLANNING, revisión read-only/coverage21 archivos/source fallback. [Contrato incorporado](../../context/event-control-panels-contract.md): receipts durables/CAS bigint, capacidades granulares/calendario owner, endpoints v1, Angular Router único, admin Origin/CSRF/cookie HTTPS y autoridad independiente. Revisión de incorporación APPROVED con precisión aplicada: outcome original del receipt inmutable, IDEMPOTENT_REPLAY en envelope; excluir invitationCode/media/capacidades diferidas admin; key HTTP ASCII1..128 sin cambiar legacy.

READY_FOR_IMPLEMENTATION: PARTIAL, no runtime aprobado. RA operacional BLOCKED/selección-validación pendiente; ningún proveedor/stub aprobado. Correctivos identidad/autoridad condicionan nuevas mutaciones y admin final. Laboratorio/receipts/CAS/router independientes.

## Seguridad — dictamen e incorporación

`panels_security`: CHANGES_REQUIRED inicial, luego **APPROVED_FOR_PLANNING** tras incorporar credencialACTIVE/binding de emisión/revisiones/epoch/floors para ambos actores, null no autorizado, autoridad exterior PITR y revalidación revoke; auditoría search/detail obligatoria/sin errores tragados; API E2E NODE_ENV=test/policy anteslisten. Sin BLOCKER/MAJOR de diseño. MINOR no-store todos privados admin y no cache fallback503 incorporados. Ejecución security/concurrencia/recovery/isolation NOT_VERIFIABLE_FROM_REVIEW.

Critical_review futuro obligatorio MOD-001/RA por riesgo de sesiones revocadas resucitadas/autoridad post-PITR; no revisión crítica de código inexistente ni PASS de ejecución por planning.

## UI — handoff y reevaluación

`panels_ui`: DESIGNED/PARTIAL inicial por contrato pendiente; [handoff incorporado](../../context/ui-event-control-panels.md), reevaluación **APPROVED / READY_FOR_FRONTEND_PLANNING YES organizador MVP y admin read-only MVP**. Sin blockers producto/UX, componentes/tokens nuevos ninguno. Extensiones READY_FOR_IMPLEMENTATION en diseño, no IMPLEMENTED/VALIDATED.503/contextoCSRF/timeoutoverlay/guardado por sección/viewports incorporados. Admin activación sigue BLOCKED.

## Ticketización / Gate2

Serie nueva EL-TK-218..238; disponible antes generación. Primer Gate2 `panels_requirements`: NEEDS_CHANGES (ninguna nueva pregunta producto): sentinel solo harness/laboratorio,220 capacidades/calendario exactos,221 carrera por linearización,222 no mezclar proof de recuperación217, dependencias de comandos comunes en vez de cadena artificial,227 permitir calendario atómico/no comando UI conjunto, archivos objetivo delegables y tres inversas blocks incorrectas. Se corrigen antes de pedir reevaluación, no aprobación implícita.

Fase0 tiene evidencia documental, no ticket funcional ficticio DONE; Fase6 métricas DEFERRED sin tickets.

## Gate2 final y readiness vigente

`panels_requirements`: **APPROVED**,20 tickets requisitos completos (218..221 y223..238) y222 BLOCKED operacional. Reevaluación confirma cero MAJOR/MINOR accionables. Correcciones verificadas: sentinel propio, capacidades/calendario exactos, carrera por linearización, scope222 separado217, predecesoras comunes comandos, warning allowlisted, targets/generated-only y E2E raíz existente. ARCHIVED es legado inválido, no estado canónico nuevo.

Metadata actualizada tras dictamen:20 Status READY/REQUIREMENTS_READY YES;218 READY_FOR_IMPLEMENTATION YES solo laboratorio con predecesor215 y Gate2 registrados. Resto NO actual/PENDING_DEPENDENCIES, IMPLEMENTABLE_AFTER_DEPENDENCIES YES; no repetir gate sin cambio material.222 REQUIREMENTS_READY/READY_FOR_IMPLEMENTATION NO y Status BLOCKED. Activación nuevas mutaciones/admin sigue BLOCKED221/222+evidencia. Primer ticket recomendado218; no ejecución funcional en esta sesión.

Revisor comprobó21 nodos, cero ciclos e inconsistencias depends_on/blocks. Verificación final del orquestador:21 tickets (20READY/1BLOCKED), paralelismo recíproco y61 links locales en28 documentos nuevos/de alcance; cero referencias ausentes y whitespace limpio, resultado PASS documental. Validación estática, no PASS de seguridad runtime/recuperación/aislamiento ejecutado. Sin cambios a código, datosdev, assets, DEC/TC/ARCH ni tickets históricos.

## Siguiente paso

Actualización del2026-10-13 por instrucción del usuario: retiradas las asignaciones personales del plan, los21 tickets y los registros de esta planificación. Se conservan ownership de módulos, dependencias, requisitos y gates de revisión, sin asignarlos a personas.

Implementación posterior de218, luego unidades independientes siguiendo grafo y ownership.222 necesita decisión/configuración/acreditación operacional independiente PITR; no proveedor/stub aprobado, no bootstrap/recovery alternativo. Revisión crítica futura221/222 y pruebas antes activación. Plan de ejecución y propuesta de PR en [plan](../../../docs/reports/event-control-panels-backlog-2026-10-13.md). Sin commit, push ni merge en esta sesión.
