# EL-TK-263 — Corregir entrada y primera participación guest sin resultados ficticios

Parent epics: EL-EP-004/005. Correctivo prospectivo, no reapertura de entregas históricas.
Estado: DONE para el alcance acotado de esta primera entrega. Autorización: usuario «comencemos a cerrar gaps», 2026-10-14.
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para este correctivo focal.
READY_FOR_FRONTEND_PLANNING: YES: handoff UI aprobado e incorporado abajo.
UI_REQUIRED: YES: menú, datos, onboarding y estados/error visibles del invitado.

## Alcance y criterios

1. Proyectar fecha programada y mensaje de bienvenida existentes sólo cuando landing permitida. UI usa fecha y TZ reales, nombre neutro sin fallback de evento ajeno y ninguna ciudad ficticia. No nuevo campo ubicación ni URL de portada sin contrato seguro.
2. Menú/CTA muestran Subir y explicación si canUpload false; ACTIVE con uploads deshabilitados conserva landing ALLOWED pero informa motivo. Galería y aportes conservan permisos separados.
3. Primera participación valida sesión/capacidad, consentimiento y apodo; nombre editable desde sesión sin crear cuenta, correo opcional no persistido retirado. Consentimiento sin checks preseleccionados.
4. Selección inicia vacía y contiene sólo File elegidos. Eliminar mock files, timers de progreso/éxito y conteos mínimos. Transferencia todavía no integrada: aviso claro, selección preservada y ningún estado confirmado inventado.
5. Errores/401/cancel y Subir más guardan paso válido; no continuar sin capacidad/sesión. Object URLs liberadas y menú accesible con Escape/aria-expanded/foco.

## Exclusiones y dependencias

No habilitar cargas/eventos por UI, no nueva cuenta guest, no tokens JS, no storage/worker/gallery/upload endpoint nuevo en esta entrega. La integración real depende del gateway y contratos de autorización/drenaje del informe, con local-media CR-011 sin adopción implícita. Versiones legales autoritativas/portada segura/retirada/galería son seguimientos abiertos.

## Plan de ejecución focal

1. Gate UI read-only con flujo/estados/permisos; incorporar handoff antes de implementar frontend.
2. Backend: contracts/event-public-access y controller guest: scheduledAt ISO nullable, welcomeMessage nullable, motivo de bloqueo para ACTIVE. Regenerar OpenAPI/cliente. Sin migración: campos existentes.
3. Frontend: tipos/service mapping y componentes guest para metadata/menu/onboarding/selección/error/cleanup. Preservar lectura HttpOnly y capacidades server.
4. Pruebas: domain resolución ACTIVE enabled/disabled/SCHEDULED/UNAVAILABLE; DTO/client build/check; Angular menú, no mocks/éxito, formulario y selección, sesiones/guard/errores.
5. Reviewer independiente, rebuild local API/web autorizado, readiness y documentación de gaps cerrados/parciales.

## Riesgos / cierre

No exponer metadata cuando landing denegada; no confundir UI sin simulación con transferencia ya operativa. Gaps 05/06/07 separados: simulación retirada no cierra backend real. Revisión/tests reales y handoff UI necesarios para cierre. Ningún PASS pendiente se declara logrado.

## Resultado de implementación y validación — 2026-10-14

Implementación aprobada por reviewer y validación runtime local completada. DONE aplica sólo al alcance acotado descrito aquí; los pendientes enumerados continúan abiertos.

- Resolver proyecta `scheduledAtISO` y `welcomeMessage` sólo con `canViewLanding`; ambos pueden ser `null` si no están disponibles. En ACTIVE con cargas deshabilitadas conserva el acceso permitido y devuelve el motivo. La UI muestra ese motivo.
- El menú muestra «Subir fotos y videos» según permisos. Nombre/apodo se puede completar o editar desde la sesión propia sin depender de carga; no solicita correo. Consentimientos aparecen sin selección previa.
- La selección de archivos inicia vacía. Se retiraron archivos ficticios, conteos mínimos forzados, temporizadores y pantallas de progreso/éxito simuladas. Antes del onboarding se informa que la transferencia no está disponible y «Cargar» queda deshabilitado.
- Se mantienen la sesión basada en cookie HTTP y las protecciones contra respuestas asíncronas obsoletas; se añadieron limpieza de object URLs y manejo accesible de Escape/foco del menú.

Validación informada: pruebas web guest/gallery 42/42; dominio 12/12, incluido el fixture de suspensión que oculta metadata no nula; prueba guest-public-entry con PostgreSQL aislado 1/1; builds API/domain/client/web, OpenAPI y `client --check` aprobados; `git diff --check` aprobado. Reviewer re-revisó y aprobó tras resolver el hallazgo de carrera. El build web reportó advertencia previa de presupuesto (600 KB frente a 923.25 KB), bajo el límite de error de 1 MB. `docker compose up --build -d --wait api web` terminó con exit code 0; servicios API/web Healthy; `http://localhost:3000/api/v1/health/ready` y `http://localhost:4200/` respondieron 200. Sin migraciones; volúmenes preservados. PostgreSQL aislado se detuvo y se restauró al estado previo.

### Cierre por gap

G-02, G-05 y G-13 cerrados para este alcance. G-01 parcial: fecha programada y bienvenida proceden de la respuesta autorizada, pero ubicación y portada configurada siguen fuera de alcance. G-03 parcial: se explica la restricción y la indisponibilidad de transferencia; el transporte real sigue pendiente. G-04 parcial: onboarding y edición de apodo se habilitaron, sin completar un flujo de aporte real. G-06 sólo cierra la simulación engañosa; no implementa transferencia. G-12 sólo deja los checks sin preselección; la versión legal autoritativa sigue pendiente. G-14/G-16: guardas asíncronas y limpieza cubiertas por las pruebas indicadas. G-17 parcial: menú accesible implementado, sin QA móvil integral de sheets/modal.

Siguen fuera de cierre: transferencia real/gateway, integración de galería, retiro por aporte y política legal vigente. La validación runtime cubre los servicios API/web locales y no equivale a prueba móvil ni a transferencia real.

## Handoff UI focal incorporado — 2026-10-14

Gate ui_designer APPROVED, sin preguntas UX bloqueantes para este alcance. Landing informa «La subida de archivos aún no está disponible» antes de pedir consentimiento/apodo; selector local preserva selección sin afirmar que sobrevive al cierre/recarga. Acción de transferencia deshabilitada con aviso «Los archivos seleccionados todavía no se han enviado».

Nombre/apodo editable desde menú/resumen de sesión propia; guardar/cancelar vuelve al origen, mientras primera carga continúa a selección. Un solo campo1–60, sin correo/cuenta. Consentimiento antes de primera carga, no al visitar landing; reentrada omite sólo pasos satisfechos, checks unchecked, fallos sin avance.

Nombre/fecha TZ/bienvenida reales; portada neutra decorativa, ninguna ciudad inventada. Motivo de restricción del evento separado de indisponibilidad operativa. Subir visible/disabled cuando prohibido; galería/Mis aportes conservan capacidades. Menú aria-expanded/controls, Escape/foco devuelto, pasos con foco título, errores anunciados y target44px. Guard de pasos/401 y cleanup de previews por cambio/destrucción. Sin nuevos componentes/tokens. Transporte, versiones jurídicas autoritativas, galería/retirada y portada real segura quedan abiertos.
