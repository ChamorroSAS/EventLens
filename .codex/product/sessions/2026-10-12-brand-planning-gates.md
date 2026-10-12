# Consolidación de marca y revisión de tickets — 2026-10-12

## Objetivo y aprobación

Reconciliar ambos manuales, formalizar exactamente dos tickets transversales y someterlos a gates, sin implementación visual ni atribuciones personales. Usuario aprobó las siete decisiones y precisó conservar Manrope/pesos y fallback técnico. [CR-004](../changes/CR-004.md) registra alcance e impacto.

## Confirmado

- Canónico: [manual v1.1](../../../docs/branding/MANUAL-DE-MARCA.md); [ruta de compatibilidad](../../../docs/brand/brand-manual.md). Propuesta remota PR232 abierta, head8f846873, preservada como fuente histórica; no se modificó ni fusionó.
- UI: Manrope400/500/600/700 con system-ui, sans-serif sólo fallback; paleta UI vigente y modo claro conservados.
- PDF maestro sin cambio, SHA2565CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3. Rellenos normalizados con redondeo: navy0B2F53, coralFD8350, grayA0A0A0, magentaF000E8. Comparación de fidelidad/legibilidad sigue trabajo de implementación.
- Serie local hasta202 ocupada; búsqueda dirigida local/remota sin203/204 previos ni ticketfoundation/assets duplicado encontrado. IDs se reservan al formalizar, nunca se reutilizan.
- Parent administrativo EL-EP-002; DONE original preservado, extensión independiente. Sin nueva épica ni módulo. HEAD de trabajo observado f1e7bf4a, distinto del snapshot2219dcc de la auditoría histórica; no se actualizan sus conclusiones retroactivamente.

## Gate 1 — requisitos del cambio

Agente `requirements_reviewer` / `brand_gate1`, read-only.

```yaml
status: approved
artifact_type: CHANGE_REQUEST
REQUIREMENTS_READY: YES
READY_FOR_PLANNING: YES
READY_FOR_IMPLEMENTATION: NO
summary: "Requisitos suficientes para arquitectura/UI; sin BLOCKER/MAJOR/MINOR accionables."
evidence:
  - "CR004, manuales canónico/compatibilidad y ui-design-system."
  - "Baseline, EP002, exclusiones TK048/TK044."
decisions:
  - "203 publicación de arte/fav;204 foundation+piloto OrganizerAppShell aislado."
  - "No duplicar navegación/auth ni modificar permisos."
validation:
  - "Lectura documental, consistencia, responsabilidades y exclusiones."
risks:
  - "Licencia/procedencia fuente, legibilidad assets y cascada/contraste por comprobar."
open_questions: []
```

No certifica readiness frontend, fidelidad assets, implementación o pruebas de dispositivos. Sin correcciones obligatorias para avanzar.

## Gate técnico — arquitectura

Agente `architect` / `brand_architecture_gate`, read-only: **APPROVED**, baseline suficiente, sin nueva arquitectura ni cambios EL-TD-001..008. Readiness en el dictamen PARTIAL únicamente por UI/incorporación/revisión tickets restantes. Contrato recomendado por el agente e incorporado por el orquestador en [brand-integration-contract.md](../../context/brand-integration-contract.md).

Publicación estática acotada, Manrope autoalojada con licencia/hashes, custom properties globales inertes, consumo encapsulado sólo nodos propios de shell, sin cascada a proyección. Harness test-only del componente Angular real; no modificación root/auth/routing/adapters ni pruebas de maqueta sustitutiva. Estrategia general CSS/UI/iconos sigue DEFERRED. Sin blocker arquitectónico ni motivo para critical_review.

## Gate UI

Agente `ui_designer` / `brand_ui_gate`, read-only: **APPROVED**, **READY_FOR_FRONTEND_PLANNING YES** para203/204, sin preguntas bloqueantes/pantallas/componentes nuevos. Medidas recomendadas del handoff adoptadas por el orquestador en [ui-brand-foundation.md](../../context/ui-brand-foundation.md). Reutilización del shell y roles existentes, responsive/nombres largos, logo/fuente fallidos, foco/contrast, piloto160CSSpx no mínimo oficial. Restricción adicional: conservar también fondo compartido detrás de proyección; sólo hojas propias se migran. Dictamen no certifica mediciones/implementación/dispositivos.

## Ticketización

Agente `ticket_writer` / `brand_ticket_writer`: exactamente [EL-TK-203](../tickets/EL-TK-203.md) y [EL-TK-204](../tickets/EL-TK-204.md) creados DRAFT, sin edición de otros archivos. El orquestador añadió secciones explícitas de permisos/errores, SVG autocontenido y prueba de base `/` y `/eventlens/`; este delta fue revisado antes del dictamen final.

## Gate 2 — requisitos de los tickets

Agente `requirements_reviewer` / `brand_gate1`, read-only, **APPROVED** para ambos. BLOCKER/MAJOR/MINOR accionables: ninguno. Requisitos inequívocos, criterios comprobables, responsabilidades no duplicadas, dependencias acíclicas, contratos UI/técnicos incorporados. Excepción de .gitignore comprobada: este registro transportable; otra sesión sigue ignorada.

| Ticket | Requisitos | Implementable por contrato | Baseline / UI | Inicio de implementación |
|---|---|---|---|---|
| EL-TK-203 | YES | YES | YES / YES | READY_FOR_IMPLEMENTATION YES; sin predecesora funcional nueva |
| EL-TK-204 | YES | YES | YES / YES | READY_FOR_IMPLEMENTATION NO sólo hasta ejecutar/validar203 |

NO de204 no es pregunta de producto ni gate rechazado. Tras203 validado puede comenzar sin nuevo gate de producto, salvo cambios materiales de alcance. Estado canónico de ambos: READY de requisitos, no DONE. IMPLEMENTED NO; EXECUTION_READY YES en203, NO en204 por dependencia.

## Ratificación técnica final

Agente `architect` / `brand_architecture_gate`, read-only: **TECHNICAL_GATE APPROVED** por ticket y ratificado tras delta. Sin hallazgos ni correcciones requeridas. Orden203 validado antes204; CSS global inerte, consumo aislado, Manrope autoalojada con licencia, harness fuera de producción. No nueva arquitectura ni modificación de baseline. Critical_review no requerido por falta de riesgo excepcional de seguridad/integridad/migración.

## Validación de esta ejecución y límites

Revisión de referencias/IDs, ausencia de atribuciones personales, redondeo sRGB, hash del PDF sin cambio y diff documental. No se implementaron assets/styles/fonts ni se corrieron build, tests de componente/E2E o dispositivos reales. Los contratos aprobados exigen esas pruebas al ejecutar tickets; no equivalen a evidencias PASS.

Resultado documental: referencias locales verificadas,204 IDs canónicos únicos, PDF con hash original y git diff --check sin errores de whitespace. Las advertencias de normalización LF/CRLF no son fallos de contenido. Sólo documentación y excepción acotada de gitignore cambiadas; runtime/arte binario intactos.

Cambios: manual canónico y referencia de compatibilidad; CR004, contratos/handoff y referencias de catálogo; dos tickets y sus índices/dependencias; extensión localizada de EP002 con historia intacta. .gitignore sólo exceptúa este registro, preservando el resto de sesiones ignoradas. Sin nuevas épicas, paquetes, librerías, permisos, contratos HTTP o modificaciones remotas del PR.

## Próximo paso

Software delivery de EL-TK-203; conservar EL-TK-204 pendiente de sus salidas validadas. No reaprobación de Manrope ni de las siete decisiones y no ejecución visual durante esta planificación.
