# EL-EP-017 — Aprobación expresa de contratos técnicos de integración, permisos y auditoría Beta

**Fecha de aprobación funcional:** 2026-10-12 (America/Bogota).  
**Autoridad de producto:** usuario responsable de arquitectura y producto: «aprobados» en respuesta a la presentación de los tres contratos en PR #237.  
**Clasificación:** `TECHNICAL_BASELINE_APPROVED`, `IMPLEMENTATION_NOT_VERIFIED`, `LEGAL_GATES_UNCHANGED`.

## Artefactos aprobados como línea base técnica

1. [Contrato HTTP y composición API](../../../docs/contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md): prefijo `/api/v1`, identidad admin resuelta por backend, rechazo de `x-admin-actor-id` como autoridad, DTOs/errores/correlación, flujos Beta/guest/consentimiento/intervenciones descritos como **endpoints a implementar y verificar**; versión jurídica válida seleccionada por servidor; respuesta de solicitud Beta pública neutra y sin requestId.
2. [Matriz de permisos de suspensión/revocación](../../../docs/contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md): integrar controles **ya autorizados** de evento y revocación global de sesiones con motivo, actor validado y auditoría. La aprobación **no autoriza** suspensión administrativa de cuentas ni revocación administrativa individual de sesiones, aunque existan estado de cuenta y primitiva de dominio; requieren análisis/decisión de permisos por owner.
3. [Minimización de correo Beta en auditoría](../../../docs/legal/BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md): auditoría por `requestId` sin email en target/log; corregir tests que esperan email; saneamiento histórico controlado; distinguir solicitud nunca invitada de invitaciones/cuentas; impedir extensión arbitraria de retención por solicitudes anónimas repetidas; verificar `admin_audit_event` fuera del alcance de purga actual de `audit_event`. Regla de negocio confirmada de 6 meses para solicitud Beta sin invitación; **fundamento legal, cálculo calendarizado y retención de auditoría pendientes de validación jurídica**.

Los nombres de archivo incluyen `DRAFT` como sufijo histórico de documentación. La aprobación aplica al **criterio técnico funcional** de esos archivos, no a un texto legal vigente, autorización de tratamiento o endpoint productivo. Los documentos retienen notas de implementación pendiente y dependencias.

## Alcance de implementación derivable bajo épicas propietarias

| Área | Owner técnico | Siguiente entregable esperado | Riesgo/gate |
|---|---|---|---|
| Identidad y solicitud Beta (EL-EP-001, EL-TK-008/009) | Néstor (contrato), Juan (backend/DB/tests) | Adaptador HTTP con respuesta neutra, saneamiento de escritura de auditoría y tests | Captación pública bloqueada hasta LEG-01/03/04/05/06 |
| Observabilidad (EL-EP-014, EL-TK-166/184) | Néstor + Juan | Inventariar lectores de `admin_audit_event`, contrato de retención y tratamiento histórico autorizado | No mutar silenciosamente auditoría append-only, ni inferir 365d = 12 meses sin revisión |
| Guest y aceptación (EL-EP-004, DEC-041) | Néstor API + Cristian UI | Sesión real/consentimiento con versión servidora, aceptación explícita, vínculo a texto aprobado y tests E2E | Q-029 impide publicación jurídica; no usar versión fija de front |
| Administración (EL-EP-012 + EL-EP-003/004) | Néstor | HTTP de suspensión/reactivación de **evento** y revocación **global** con permisos owner; pruebas 401/403/409, CSRF, auditoría | No ampliar a suspensión de cuenta/revocación individual sin CR/impacto y ratificación |
| Comunicación (EL-EP-013) | Néstor + Cristian | Conectar notificaciones event-scoped y UI si existe flujo confirmado | No afirmar entrega sin proveedor/worker y prueba |

La existencia de tickets marcados `DONE` en dominio no certifica integración HTTP/UI. Antes de crear tickets nuevos: buscar duplicados y usar tickets/épicas propietarias según convención `EL-TK-XXX`; no asignar nuevos números ni cerrar `EL-EP-017` a partir de esta aprobación.

## Invariantes y límites de la aprobación

- `DEC/TC/ARCH: SIN CAMBIOS`. Cualquier modificación a una decisión aceptada requiere evaluación y aprobación separada.
- `EL-EP-017: NOT_READY`; `Q-029: DEFERRED`; `DEC-031: REVIEW_REQUIRED`.
- `BETA_FORM_PUBLIC_COLLECTION: BLOCKED`; `PUBLIC_SERVICE_OPENING: BLOCKED`.
- `LEGAL_OPINION: NOT_PERFORMED`; `IMPLEMENTATION: NOT PERFORMED BY THIS APPROVAL`.
- La restricción publicitaria Beta, la protección de menores, denuncias, eliminación y derechos de terceros continúan vigentes y no se reinterpretan mediante este registro.
