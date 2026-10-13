# EL-EP-018 — Revisiones y preparación de tickets

Fecha: 2026-10-12. Solicitud: revisar la épica con architect, ui_designer y requirements_reviewer para después crear tickets, sin implementación ni atribuciones personales. Snapshot inicial: stage `ed748d5` (merge PR235). [Épica](../epics/EL-EP-018.md) / [dirección editorial y reglas A/B/C](2026-10-12-el-ep-018-editorial-and-routes.md).

## Confirmado y límites

Doce elecciones editoriales y A/B/C confirmadas: Home público con/sin sesión sin redirect; Beta por invitación; /ingresar y /mi-cuenta como destinos funcionales; guest directo sin Home/login organizador. Copy literal y fotos no eran assets/textos aprobados por la sesión editorial. No inventar perfil editable ni asumir exposición HTTP/rutas por DONE del dominio.

Serie revisada:203/204 ya existentes; no reservar ni crear siguientes IDs hasta gates de la épica. No se reabre ningún DONE ni se crean componentes duplicados. Marca/Manrope/roles vigentes conservados.

## Gate 1 — requirements_reviewer

Agente `ep018_requirements`, read-only, **APPROVED** para avanzar arquitectura/UI:

```yaml
status: approved
artifact_type: EPIC
REQUIREMENTS_READY: YES
READY_FOR_TICKET_WRITING: NO
READY_FOR_FRONTEND_PLANNING: NO
READY_FOR_IMPLEMENTATION: NO
open_questions: []
```

Sin nuevo BLOCKER de producto; tres MAJOR documentales para cierre técnico/UX: matriz destino/owner/contrato/montaje; datos y composición Mi cuenta sin inventar edición; destino/feedback/error de logout y preservación guest. Son precisiones resolubles en los roles solicitados, no motivo para reaprobar A/B/C.

Minor: reemplazar textos de producto pendiente por gates técnicos/UX pendientes; peso de assets medible en ticket; copy/fotos/indexación según gate. Q029/EP017 bloquea publicación pública, no planificación.185/186/204 tienen cierres documentales recientes que prevalecen sobre NO/PENDING históricos, sin certificar montaje HTTP o SPA.

Evidencia: lectura completa épica/sesión editorial; owners001/002/004/015/017, tickets008/013/016/185/186/201/204, reauth de cuenta y baseline. No fuente ni tests verificados por este reviewer inicial.

## Architect — contrato de planificación

`ep018_architect`, read-only: TECHNICAL_GATE APPROVED, READY_FOR_TICKET_WRITING YES_FROM_ARCHITECTURE, READY_FOR_IMPLEMENTATION PARTIAL por integraciones/predecesoras. Sin elección fundacional bloqueante, cambios de baseline o nuevo módulo. Contrato incorporado en [public-entry-contract.md](../../context/public-entry-contract.md).

Fuentes directas acreditan QR `/g/:lookupKey`, runtime/schema sólo health y falta Router; fuente de login admite PENDING_DELETION pero proyecta ACTIVE. Esa desviación requiere correctivo owner de proyección y pruebas al integrar; no invalidar185/186 ni asumir seguridad por UI. Mi cuenta sólo correo/verificación/estado; paths Beta/eventos concretados. Logout sólo sesión organizador, destinoHome y ACK incierto no éxito. Guest/admin independientes; configuración baseQR confiable y fallback no absorbe API/media/assets.

## UI — primera revisión

`ep018_ui`, read-only: diseño completo, **READY_FOR_FRONTEND_PLANNING PARTIAL** exclusivamente por contrato técnico aún no incorporado en ese corte. Ninguna pregunta UX de producto; fotos no bloqueantes. Una pieza nueva PublicHomePage, extensiones AppHeader.public/LegalFooter minimal, no nuevo auth/dashboard/catálogo. Copy de diseño admisible con privacidad precisada y cierre revive en vez de conserva; no aprobación jurídica. Reevaluación solicitada tras incorporación del contrato técnico. No frontend tickets mientras PARTIAL.

## Ratificación UI y revalidación requisitos

UI read-only: APPROVED, READY_FOR_FRONTEND_PLANNING YES, sin preguntas pendientes, después de [ui-public-entry.md](../../context/ui-public-entry.md) y contrato técnico incorporados. Única responsabilidad visual nueva PublicHomePage; reutilización y restricciones completas, fotos no bloqueantes, copy UX no jurídico.

Requirements read-only: APPROVED, READY YES, REQUIREMENTS_READY YES, READY_FOR_TICKET_WRITING YES_FROM_REQUIREMENTS. Los tres MAJOR cerrados por matriz/fieldsreadonly/logout; sin BLOCKER/MAJOR abierto. Minor de sincronización de épica corregido por orquestador: rutas/QR/logout/checks ya no figuran como decisiones pendientes. Implementación PARTIAL por montajes/correctivo/pred201 y pruebas, no por decisiones de producto.

## Ticketización y primera revisión Gate2

`ticket_writer` creó sólo205..214 DRAFT. Serie local hasta204 y búsquedas remotas exactas205..214 sin coincidencias previas; IDs nuevos no reutilizados. Primer Gate2 requirements y técnico needs_changes:206 requería componentes futuros,207..211 suponían transporte/código propietario y211 omitía083/callbacks simulados; UI214 debía NO. No hubo BLOCKER nuevo de producto.

Orquestador corrigió mismos10 tickets sin nuevosIDs:206 infraestructura/retorno puro/404 con harness Angular real sin activarroot;207..211 entregan componentes/descriptores y controllers/adapters/OpenAPI/cliente;211 conecta075real y callbacks076/077/078083 sin autoridad local, no uploads/galería;213 depende211 y activa bootstrap/root final;205 estados consumidor/CSRF precisados;209deps014016017201;207dep015; bloques/paralelos normalizados.211 estimación S→L orientativa por transporte ampliado, minor no bloqueante.

## Dictámenes finales por ticket

Requirements: APPROVED, REQUIREMENTS_READY YES e IMPLEMENTABLE YES205..214; tres MAJOR cerrados, sin BLOCKER o MAJOR pendiente. Minor estimación211 corregido. READY no acredita predecesoras, API/código montado o PASS.

Architect: TECHNICAL_GATE APPROVED individual205..214; verificación automática del grafo interno sin ciclos ni referencias inexistentes. No cambio baseline/módulos/tablas/transacciones.206 no importa futuros;213 ensambla después de superficies. Revisión focalizada de permisos/cookies/adapters en software delivery, sin Astra/critical_review excepcional en planificación.

UI: APPROVED. UI_REQUIRED YES y FRONTEND_PLANNING YES206/207/208/209/210/211/213; UI_REQUIRED NO y NOT_APPLICABLE205/212/214. Estado de diseño suficiente, sin nuevas preguntas/pantallas duplicadas/claims legales. No eleva001/015 ni certifica código.

| Ticket | Responsabilidad | Dependencias principales | Gate técnico / requisitos / UI |
|---|---|---|---|
|205|Proyección real de sesión/correctivo ACTIVE, exposición owner|013,185|APPROVED / YES / NO_REQUIRED|
|206|Infraestructura Router, retorno puro y404; sin root productivo|204|APPROVED / YES / YES|
|207|Login/logout owner: transporte/componentes/descriptores|205,206,013,015,185|APPROVED / YES / YES|
|208|Beta008: controller/cliente/formulario neutral|008,206|APPROVED / YES / YES|
|209|Mi cuenta/read-only/sesiones/consumir201|205,206,014,016,017,201|APPROVED / YES / YES|
|210|Consultas047 y montaje Dashboard048 mediante cliente|205,206,047,048|APPROVED / YES / YES|
|211|Guest /g/key real/cookie/callbacks083|206,074..078,082..084|APPROVED / YES / YES|
|212|Serving/base públicaQR confiable/logs sin credencial|206,211|APPROVED / YES / NO_REQUIRED|
|213|Home/header/foot y activación final Router/root|204,205,206,207..211|APPROVED / YES / YES|
|214|Validación runtime real integrada, no UI nueva|207..213|APPROVED / YES / NO_REQUIRED|

Estado final205..214: READY de requisitos/contrato, IMPLEMENTED NO.205/206 pueden preparar ejecución verificando sus predecesoras documentadasDONE; los demás conservan dependencia de los nuevos tickets y209 de201 aúnREADY, sin duplicarlo. READY_FOR_IMPLEMENTATION YES por alcance aprobado; EXECUTION_READY condicionado explícitamente a predecesoras verificadas. Release público aún EP017/Q029, no parte de estos gates.

## Validación documental y próximo paso

Validación automática final:10 tickets READY,31 enlaces locales válidos en épica/contratos/handoff/sesión/tickets, todas las predecesoras con documento existente, grafo interno sin ciclos y sin atribuciones personales. git diff --check sin errores; ninguna modificación en apps/packages/contracts/e2e/assets. No se implementó runtime ni se ejecutaron build/API/Vitest/Playwright/dispositivos. Los checks automáticos del grafo son de planificación, no pruebas funcionales PASS. La sesión editorial original conserva su historia; esta revisión y contratos rigen planning actual. Siguiente fase: software delivery según grafo, no aprobación jurídica ni despliegue automático.
