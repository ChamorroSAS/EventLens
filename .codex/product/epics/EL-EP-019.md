# EL-EP-019 — Paneles de control y gestión visual de eventos

## Status

READY de requisitos y planificación del MVP. REQUIREMENTS_READY: YES. ARCHITECTURE_REVIEW: APPROVED_FOR_PLANNING. SECURITY_REVIEW: APPROVED_FOR_PLANNING. UI_REQUIRED: YES: pantallas, formularios, navegación, feedback y responsive. READY_FOR_FRONTEND_PLANNING: YES para organizador y admin read-only. READY_FOR_TICKET_WRITING: YES. GATE2: APPROVED para20 tickets de requisitos,222 BLOCKED operacional. READY_FOR_IMPLEMENTATION: PARTIAL:218 habilitado, resto espera predecesoras; ACTIVATION BLOCKED nuevas mutaciones/admin hasta autoridad real y correctivos/pruebas. No aprobación de ejecución de toda la épica. IMPLEMENTED: NO.

ID verificado disponible en archivos/producto y origin/stage antes de registro, serie hasta018; CR-007. [Dictámenes](../sessions/2026-10-13-event-control-panels-gates.md), [contrato técnico](../../context/event-control-panels-contract.md), [handoff UI](../../context/ui-event-control-panels.md), [plan inicial histórico](../../../docs/reports/event-control-panels-implementation-plan-2026-10-13.md).

## Module

Transversal web/API: MOD-001 identidad, MOD-002 eventos y MOD-007 administración; soporte MOD-009 autoridad/auditoría. Owners adicionales mantienen sus capacidades diferidas. No módulo nuevo.

## Objective / outcome

Organizador autenticado crea y configura un evento real propio desde /mis-eventos y abre su detalle. Admin autorizado entra de forma segura a la consola existente para búsqueda y detalle de lectura. Primera entrega completa requiere ambos recorridos y sus garantías; hitos intermedios no se presentan como la épica terminada.

## Problem solved

CTA crear llama método vacío; GET reales no exponen comandos; detalle mayormente informativo. Consola existente no está montada por router/API efectivos. Código incumple garantías aceptadas de idempotencia/revisión/autoridad; registrar correctivos nuevos, sin reabrir DONE.

## Actors

Organizador owner con sesión ordinaria vigente; administrador con principal/credencial/sesión efectivos. Cuenta restringida por eliminación no tiene gestión ordinaria. Invitado conserva acceso privado existente, fuera de paneles; no rol derivado del frontend.

## Scope — MVP obligatorio

1. /mis-eventos: lista propia real, carga/vacío/error/reintento; CTA crear/primer evento.
2. Crear DRAFT solo con nombre trim1..120, defaults DEC-069; owner servidor, receipt durable, idempotencia aun tras configuración/retry concurrente/timeout.
3. Detalle persistente por URL, ownership revalidado, estado y datos reales.
4. General: nombre solo DRAFT. Programación progresiva: fecha/hora DRAFT; TZ DRAFT/SCHEDULED antes ACTIVE, conforme DEC-070. Dos guardados independientes, DST gap/overlap/offset, revisión esperada y calendario propietario. Guardar no activa/programa lifecycle ni abre invitados.
5. Entrada/login/contexto/logout admin conforme MOD-001; sesión distinta; HTTPS, Origin/CSRF/CORS, revisiones y autoridad externa real. No login alternativo ni recuperación web.
6. Búsqueda paginada eventos/organizadores según contrato existente; solo eventos abren detalle read-only con datos mínimos y disponibilidad parcial; auditoría obligatoria, sin media/invitationCode/acciones diferidas.
7. Angular Router único, compatibilidad público/guest/base href/refresh/back, permisos server-side, descarte de respuestas tardías y capacidades granulares.
8. Laboratorio aislado antes de pruebas mutantes; evidencias funcionales/security/a11y integradas y revisión independiente.

## Out of scope / entregas posteriores

Portada/presentación/bienvenida/descripcion nueva; PIN/acceso/QR/compartir; participación; lifecycle editable; biblioteca/moderación/export; capacidad/ampliaciones; intervenciones/grants/media admin; jobs/auditoría como pantallas; métricas/dashboard agregado. No tickets de implementación de estas extensiones hasta requisitos/contratos/gates propios. Handoffs originales no se revocan por diferir su montaje aquí. Home/rebranding, roles/MFA/pagos/BI/infraestructura nueva también excluidos.

## Business rules / permissions

DEC-069/070 y owners conservados. Actor validado en servidor; recursos ajenos/ausentes no revelan existencia. Restricciones, estado, credencial ACTIVE, revisiones/epoch/barreras efectivos revalidados antes de efecto; autoridad desconocida deniega. No x-admin-actor-id como prueba. Recibos/CAS/auditoría atómicos MOD-002; lifecycle/calendario no se reimplementa en UI. ACK incierto no es éxito. Privados no-store, logs/evidencias sin secretos.

## Main scenarios / success criteria

| CA | Dado / Cuando / Entonces |
|---|---|
| 01 | Dado owner vigente, cuando entra /mis-eventos, entonces ve solo eventos propios; vacío verdadero ofrece primer evento y error ofrece retry |
| 02 | Dado nombre permitido, cuando confirma, entonces un único DRAFT restrictivo se crea y abre detalle del ID confirmado; replay posterior a edición no crea otro |
| 03 | Dado error/timeout/conflicto, cuando no hay ACK inequívoco, entonces conserva entrada/intención y no anuncia éxito ni cambia key silenciosamente |
| 04 | Dado DRAFT propio y revisión vigente, cuando guarda nombre u horario, entonces owner confirma esa sección; rollback no conserva cambio/receipt/audit parcial |
| 05 | Dado estado permitido, cuando cambia TZ, entonces conserva local/recalcula UTC; gap rechaza, overlap exige offset, SCHEDULED advierte, DRAFT sin inicio no inventa vencimiento |
| 06 | Dado dos editores con misma revisión, cuando guardan, entonces solo una intención nueva aplica; la otra obtiene conflicto sin lost update |
| 07 | Dado recurso ajeno/sesión restringida o revocada/authority desconocida, cuando intenta leer/crear/configurar, entonces no recibe datos ni capacidad indebida |
| 08 | Dado navegación A→B y respuesta A tardía, cuando llega, entonces no monta datos/capacidades A bajo B |
| 09 | Dado admin real vigente, cuando entra/busca/abre evento, entonces obtiene datos mínimos de lectura auditados; parcial no se muestra cero |
| 10 | Dado anónimo/organizador/header falso/revisión-epoch incompatibles, cuando llama admin, entonces se deniega; falla auditoría/authority sin éxito ni fallback |
| 11 | Dado refresh/back/URL directa/base prefijada, cuando navega, entonces mantiene ruta y autorización; guest/public/API/assets no son absorbidos |
| 12 | Dado teclado/móvil/lector, cuando completa flujos, entonces controles/labels/foco/feedback permiten operación y reflow conforme handoff |

## Edge cases / data / integrations

Creación confirmada con GET posterior fallido conserva ID; idempotencia conflicto distinta de revisión; permiso cambia durante edición; DST repetido y gap; fallo DB/authority/audit; epoch post-PITR; logout incierto; tab pierde CSRF; búsqueda tardía. Datos: proyecciones mínimas/receipts/revisión/evento y binding sesiones; migraciones aditivas, no manipular datos reales durante implementación. API REST/OpenAPI y cliente generado, sin schema manual.

## Dependencies

Contratos de EL-EP-001/002/003/012/014/015/018; originales DONE como fuente histórica, no evidencia de montaje. Nuevos correctivos MOD-001/002, router y auditoría. RecoveryAuthority real localizada bloquea activación; EL-TK-217 continúa BLOCKED para recuperación excepcional distinta.

## Relevant non-functional requirements / tests

Monolito y baseline aceptado, consultas paginadas owner sin N+1, sin recuperación de objetos para indicadores, sin polling gratuito. WCAG2.2AA objetivo; UI define viewports/foco/lectura manual. Vitest/PostgreSQL real/Playwright aislados. Guard-proof antes HTTP listen y callback, rol/DB/marker efectivos, APIdev no reutilizada, cleanup propio. Revisión independiente security/critical identity/recovery antes integración final.

## Risks / open questions

Ningún BLOCKER de producto para MVP. BLOCKER operacional localizado: seleccionar/configurar/acreditar autoridad durable externa a PITR con garantías aceptadas; no proveedor ni fallback aprobados aquí. Security efectiva/recuperación/concurrencia siguen NOT_VERIFIABLE_FROM_REVIEW hasta ejecución. Todo trabajo nuevo tiene dependencias y gate de activación.

## Definition of Ready / Done

DoR de requisitos: objetivo/actores/scope/reglas/permisos/dependencias/escenarios conocidos; contratos y UI revisados. DoD de implementación: ambos recorridos funcionales contra datos autorizados en laboratorio; cliente/OpenAPI sin drift; receipts/CAS/revocación/epoch/auditoría/isolation probados; responsive/a11y manual+automatizada; revisión independiente sin blockers; documentación alineada. No DONE por existencia de código o pruebas anteriores.

## Priority / change history

P0 MVP. 2026-10-13: acotado por solicitud explícita, Gate1 approved, arquitectura/security planning approved, UI YES por reevaluación; registro nuevo sin modificar decisiones ni históricos. Ticketización y Gate2 referidos desde sesión/índice.
