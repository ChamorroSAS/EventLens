# EL-EP-015 — Handoff UI de eliminación sensible

Status: APPROVED_UI_HANDOFF — 2026-10-12, dictamen explícito ui_designer. No certifica implementación.

Fuentes: [catálogo](ui-components.md), [dirección visual](ui-design-system.md), [épica](../product/epics/EL-EP-015.md), [contrato de reautenticación aprobado](account-reauthentication-contract.md), [coordinación de eliminación](deletion-coordination-contract.md). Estos contratos poseen reglas y fechas; el handoff describe interacción y no duplica políticas.

## Flujos y componentes

| Actor / flujo | Entrada, interacción y salida | Reuso / clasificación |
|---|---|---|
| Owner: solicitar evento | Detalle existente → EventDeleteRequestDialog: recurso/consecuencias/bloqueo/72h, confirmar o salir → solicitud registrada, no purga completada | Diálogo PRODUCT_COMPONENT; EventLifecyclePanel/StatusBadge CROSS_CUTTING_PRODUCT_COMPONENT |
| Owner: cancelar evento | Detalle pendiente: fecha exacta y EventDeletionCountdown si cancelable → confirmación contextual → estado servidor vigente; no ACTIVE por suposición | Countdown PRODUCT_COMPONENT; ConfirmDialog GENERIC_UI |
| Owner: solicitar cuenta | Sección sensible existente → ConfirmDialog: todos los eventos/bloqueo inmediato/7d → LoginForm variante REAUTH_ACCOUNT sin email/nueva identidad → verificar credencial → enviar intención confirmada con evidencia | ConfirmDialog GENERIC_UI; LoginForm y SecurityNotice PRODUCT_COMPONENT de identidad, reutilizados |
| Owner: cancelar cuenta | Gestión de eliminación autenticada y restringida durante ventana → resumen request/revisión → misma variante REAUTH_ACCOUNT para CANCEL_ACCOUNT_DELETION → resultado confirmado por servidor | Mismos componentes; sin AccountDeletionDialog ni segundo login MOD-008 |
| Owner/admin: seguimiento | Detalle/aviso contextual muestra causa, cancelabilidad, ancla/plazos, principal vs residual y estado verificado; admin conserva sus permisos/motivo/audit | LifecyclePanel, RetentionNotice/RemovalPolicyNotice y motivo/auditoría existentes |

Gracia vencida y retiro propio confirmado son irreversibles: no contador cancelable ni nueva acción de cancelación. Retiro/UI guest pertenece009. Sin páginas por job, componentes duplicados o controles LEGAL_OR_SECURITY_HOLD.

## Variante REAUTH_ACCOUNT y estados

Label «Contraseña actual», explicación de propósito, CTA «Solicitar eliminación de cuenta» / «Cancelar eliminación de cuenta», salida visible. Confirmación no equivale a nuevo consentimiento jurídico. Challenge antes de verificar; prueba sólo al comando confirmado. Se limpia credential al cerrar/completar y no se persiste; no reenvío silencioso de secreto/acción tras expirar. Fallo conserva intención no sensible; cambio de recurso/revisión requiere resumen y reconfirmación.

Estados: sin solicitud; preparando challenge; verificando; enviando comando (evitar doble submit); reauth requerida/vencida; credencial no verificada; permiso/sesión perdida; rate limited; conflicto; dependencia indisponible; resultado desconocido/ACK pendiente; manual pendiente cancelable; ventana vencida; irreversible; purga parcial/fallo; principal verificado y residual pendiente/verificado según hechos.

- Credencial incorrecta: error asociado al campo y mensaje neutro.
- Prueba expirada/consumida incompatible: descartar prueba, challenge nuevo; no asumir que un comando desconocido fracasó.
- 429: espera textual/retryAfter servidor; sin contador que anuncie cada segundo.
- 409/ventana vencida: consultar revisión/estado y mostrar acciones vigentes; no éxito optimista de cancelación.
- 503/timeout/ACK desconocido: «Verificando resultado», consultar/reconciliar misma operación antes de repetir; nunca «cancelado/restaurado» por una respuesta incierta.
- Logout/revocación: descartar evidencia; acceso limitado no habilita capacidades normales.

Countdown sólo mide tiempo para cancelar y siempre acompaña fecha/hora exactas. Se omite si no cancelable. Principal/residual se muestran en LifecyclePanel/RetentionNotice; no porcentajes inventados, «backup eliminado» sin evidencia ni promesa de recuperar purgados. Los timestamps se presentan con zona explícita del evento cuando corresponde.

## Responsive y accesibilidad

Mobile-first: BottomSheet existente; tablet conserva jerarquía; desktop Modal existente. Consecuencias antes de CTA, controles legibles, salida/cancelación visible. WCAG 2.2 AA: foco contenido/título → controles, trap/retorno al origen, teclado, labels/errores asociados, estado textual sin depender de color, touch targets conforme al sistema, anuncios sólo de cambios significativos, fechas accesibles, contraste/reduced motion. No ticks de countdown ni expiry en live region.

## Madurez y handoff

Extensiones a EventDeleteRequestDialog, Countdown (fecha/expiry), LifecyclePanel (causas/principal/residual), RetentionNotice/RemovalPolicyNotice y LoginForm.REAUTH_ACCOUNT: READY_FOR_IMPLEMENTATION en diseño tras dictamen explícito ui_designer; no acredita código ni integración. ConfirmDialog conserva GENERIC_UI; no cambia el catálogo ni la responsabilidad del contador. NEW_COMPONENTS: ninguno. Valores cosméticos pueden seguir PROPOSED; no biblioteca UI/iconos/styling elegidos.

Validación futura: componentes y Playwright para request/cancel/caducidad/conflicto/doble envío/ACK incierto/sesión limitada, teclado/foco/lector y mobile/tablet/desktop. No afirma ejecución física, integración ni certificación accesible por esta especificación.

READY_FOR_FRONTEND_PLANNING: YES — ui_designer revisó la incorporación y aprobó expresamente el gate el 2026-10-12. DEC-108..110 cierra las decisiones técnicas de verifier/intakes; correctivos y evidencia integrada siguen pendientes sin invalidar el diseño aprobado.
