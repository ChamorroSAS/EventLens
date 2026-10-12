# EL-EP-015 — dictámenes formales y promoción individual — 2026-10-12

**VIGENCIA:** Este dictamen conserva el alcance188..202 y la exclusión histórica de185..187. Una [revisión posterior específica](2026-10-12-el-tk-185-187-readiness.md) aprueba esos tres prerrequisitos READY; las menciones DRAFT siguientes describen su estado durante esta revisión anterior, no el vigente.

## Objetivo y participantes
Usuario solicita evaluar los tickets DRAFT de EL-EP-015, obtener los dictámenes formales de architect, requirements_reviewer y ui_designer y promover individualmente sólo los aprobados.

Agentes independientes, read-only:
- architect: `/root/ep015_ticket_architect`.
- requirements_reviewer: `/root/ep015_ticket_requirements`.
- ui_designer: `/root/ep015_ticket_ui`.
- Coordinador incorpora únicamente correcciones documentales y sincroniza estados.

Se aplicaron las skills locales de arquitectura/revisión, planificación de producto y registro de sesión. No implementación, nuevos tickets, cambios de IDs, DEC/ARCH o tecnologías diferidas.

## Fuentes y alcance
- [Épica015](../epics/EL-EP-015.md), [propuesta original](2026-10-12-el-ep-015-ticket-plan.md), tickets reales188..202 y prerrequisitos185..187.
- [Convenciones](../CONVENTIONS.md), [dependencias](../DEPENDENCIES.md), [decisiones DEC-107..110](../DECISIONS.md), [ARCH-017..019](../../context/architecture-decisions.md) y [baseline](../../context/technical-baseline.md).
- [Reautenticación](../../context/account-reauthentication-contract.md), [verifier](../../context/organizer-password-verifier.md), [coordinación de eliminación](../../context/deletion-coordination-contract.md), [política papelera/cuarentena](../../context/trash-quarantine-purge-policy.md).
- [Handoff UI](../../context/ui-deletion-flow.md), [catálogo](../../context/ui-components.md), [dirección visual](../../context/ui-design-system.md).
- Contratos propietarios relevantes067/108/109/114/119/128/137/151/159/172/174, AQR-001, ObjectStorage y JobQueue.

Sólo188..202 pertenecen a EL-EP-015 y reciben promoción.185..187 conservan DRAFT y sus épicas propietarias;186/187 reciben precisiones referenciales necesarias para evitar contradicción/ciclo, sin ampliar su implementación ni acreditar revisión de su épica completa.

## Matriz individual vigente
UI YES significa gate explícito READY_FOR_FRONTEND_PLANNING YES. NOT_REQUIRED significa ausencia de diseño UI nuevo, no revisión omitida: ui_designer verificó el alcance. READY_FOR_IMPLEMENTATION YES es por alcance propio y no ejecución inmediata sin upstreams.

| Ticket | architect | requirements_reviewer | ui_designer / gate frontend | REQUIREMENTS_READY | READY_FOR_IMPLEMENTATION | Estado |
|---|---|---|---|---|---|---|
| [EL-TK-188](../tickets/EL-TK-188.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-189](../tickets/EL-TK-189.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-190](../tickets/EL-TK-190.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-191](../tickets/EL-TK-191.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-192](../tickets/EL-TK-192.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-193](../tickets/EL-TK-193.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-194](../tickets/EL-TK-194.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-195](../tickets/EL-TK-195.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-196](../tickets/EL-TK-196.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-197](../tickets/EL-TK-197.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-198](../tickets/EL-TK-198.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-199](../tickets/EL-TK-199.md) | APPROVED | APPROVED | NOT_REQUIRED | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-200](../tickets/EL-TK-200.md) | APPROVED | APPROVED | APPROVED / YES | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-201](../tickets/EL-TK-201.md) | APPROVED | APPROVED | APPROVED / YES | YES | YES, alcance propio | DRAFT → READY |
| [EL-TK-202](../tickets/EL-TK-202.md) | APPROVED | APPROVED | NOT_REQUIRED (pruebas UX aprobadas) | YES | YES, alcance propio | DRAFT → READY |

## Dictamen architect — DECIDED / APPROVED
Revisó íntegramente188..202, prerrequisitos y contratos canónicos. No hay elecciones fundamentales pendientes para construir estos alcances: baseline ACCEPTED, proveedores ADAPTER_NEUTRAL/DEFERRED conservados.

Confirmó los límites MOD-001 identidad/evidencia/sesión; propietarios de lifecycle/media/export/ledger; MOD-008 coordinación por puertos y UnitOfWork, sin persistencia ajena.193 deniega capacidades;195 acredita inventario/drain;196 produce prueba física;198 finaliza/contabiliza;199 comprueba residual. PREPARE→SQL→ACK, CAS, generation/fence/epoch y tombstones se reutilizan.

Tras releer las correcciones191/194 y después190/192, emite APPROVED individual a los15 tickets, REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES por alcance propio. No blocker arquitectónico documental. No nuevo ADR, excepción, arquitectura permanente ni gate Beta aprobado.

## Dictamen requirements_reviewer — APPROVED
Revisó claridad, AC/permisos/errores, dependencias, trazabilidad, duplicados y distinción requisitos/implementación. Inicialmente identificó replay incompatible con canon y dependencias incompletas; después detectó que la cancelación administrativa aprobada no aparecía en190/192. Todos se corrigieron y se releían antes del dictamen final.

Dictamen final:15 APPROVED individuales; REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES por alcance propio; TICKET_SET_READY_FOR_IMPLEMENTATION YES, secuencia condicionada. Sin BLOCKER/MAJOR/MINOR accionables restantes de requisitos. No nueva pregunta de producto ni habilitación de LEGAL_OR_SECURITY_HOLD.

Los tickets L conservan una responsabilidad principal y sus escenarios de integridad; no se crean splits ni se regeneran en esta promoción. El análisis/planning de implementación continúa siendo el siguiente gate de delivery, no sustituido por este documento.

## Dictamen ui_designer — APPROVED
200/201: READY_FOR_FRONTEND_PLANNING YES explícito, tras lectura del handoff y del diff final. Flujos owner de solicitud/cancelación evento/cuenta, REAUTH_ACCOUNT, contexto restringido, resultado UNKNOWN, fechas/contador, principal/residual, permisos/errores, mobile/tablet/desktop y WCAG2.2AA suficientemente definidos.

Reutiliza componentes del catálogo: EventDeleteRequestDialog/EventDeletionCountdown, EventLifecyclePanel/StatusBadge, avisos de retención, ConfirmDialog/Modal/BottomSheet, LoginForm.REAUTH_ACCOUNT y SecurityNotice. Extensiones READY_FOR_IMPLEMENTATION en diseño; sin componentes, pantallas, tokens o decisiones cosméticas nuevos.

188..199: UI_REQUIRED NO, incluido199 tras excluir dashboard nuevo.202: UI_REQUIRED NO, validación del UX aprobado; no nueva superficie. Tras revisar190/192 confirmó que el camino admin reutiliza la interacción/motivo de151 y el seguimiento del handoff;200/201 owner no cambian. No decisiones UX pendientes.

## Correcciones incorporadas
-191 y referencia186: replay exacto autenticado/ownership actual consulta receipt antes de exigir proof nueva; no repite efectos ni consumo. Evidencia expirada/consumida no autoriza operación nueva/incompatible; UNKNOWN se reconcilia.
-191/192: sesión restringida y emisión/validación de sesiones pertenecen a MOD-001; no segunda identidad MOD-008.
-190/192: cancelación ADMIN_HUMAN ya aprobada requiere identidad vigente ARCH-013, grant MOD-007 exacto, motivo y freshness/revisión/revocación/epoch; mismas ventanas estrictas, claim, CAS y ACK. Sin proof del owner para admin, nueva solicitud administrativa ni bypass.151 sólo delega.
-187:194 es consumidor downstream, nunca predecesora;041/042/046 son dependencias. Su DRAFT permanece.
-194:067 explícito como productor;119 antes de integrar disposición de casos. Correctivo108 obligatorio para acreditar restore-vs-expiry, con hora servidor serializada y now < restoreDeadline; DONE histórico no prueba corrección posterior.
-199: reportes/métricas/alertas operativos existentes, sin dashboard/pantalla nueva.
-200/201/202: handoff normativo, mobile/tablet/desktop y pruebas manuales con lector separadas de automatización.186 no implementa otra variante UI.
- Índices y épica sincronizados; propuesta original preservada como histórica.

## Readiness y ejecución
READY no significa DONE ni integración completa. Cada ejecución debe verificar upstreams, código real, pruebas y correctivos posteriores, especialmente185→186→191/192/201;187 y productores067/109/114/119→194; correctivo108 para papelera; export128; ledger137; avisos159; RecoveryAuthority/PITR172/174.

189/191 pueden construir sus comandos conforme a puertos aceptados, pero no exponerlos con barreras parciales. Las referencias de integración193 desde solicitud/cancelación no crean una arista inversa al consumidor193. No convertir un contrato de épica citado por un productor en dependencia de implementación de toda015.

199 conserva evidencia real de retención/restauración pendiente y proveedor definitivo no elegido; el laboratorio puede acreditar su alcance, sin certificar un proveedor futuro.202 puede preparar la suite, pero debe disponer de las integraciones/entorno para ejecutarla. MEDIA-001, CAP-001, DR-001 y EXPORT-001 no reciben PASS por esta revisión.

## Validación documental
-15 tickets188..202 READY y requisitos/gates propios aprobados;185..187 DRAFT.
- Grafo local del paquete185..202:18 nodos, cero ciclos de construcción; todos los destinos de dependencias duras explícitas existen. Referencias de integración evaluadas separadamente; no es una auditoría nueva de todo el backlog.
- Estado/ticket/índices concordantes15/15;456 enlaces locales comprobados, sin enlaces nuevos rotos. Se detecta una referencia histórica preexistente en DEPENDENCIES a sessions/2026-10-11-el-ep-004-guest-access-delivery.md cuyo archivo no está disponible; también existe en HEAD y no pertenece al alcance015, por lo que se reporta sin inventar evidencia ni modificar ese cierre. git diff --check sin errores.
- Cambios exclusivamente Markdown de producto. No tests/builds de producto ejecutados porque no hay código cambiado; los dictámenes no acreditan pruebas runtime.

## Resultado y siguiente paso
MVP ticket review scope: EL-EP-015,15 tickets.
TICKETS_APPROVED: EL-TK-188..202.
TICKETS_PROMOTED_READY: EL-TK-188..202.
TICKETS_REMAINING_DRAFT_IN_EPIC: NONE.
RELATED_PREREQUISITES_UNCHANGED_STATUS: EL-TK-185..187.
REQUIREMENTS_REVIEW: APPROVED.
ARCHITECT_REVIEW: APPROVED.
UI_REVIEW: APPROVED;200/201 frontend YES.
IMPLEMENTATION_EXECUTED: NO.

El siguiente trabajo es delivery de un ticket cuya secuencia esté satisfecha; no se inicia automáticamente por esta solicitud.
