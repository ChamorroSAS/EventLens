# EL-EP-015 — Eliminar eventos y cuentas con cancelación y purga controladas

## Status

READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-019, Q-026; DEC-043, DEC-044, DEC-045, DEC-059. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES - para el alcance propio contractual aprobado; no acredita integración ni Beta. Dictamen actualizado2026-10-12, DEC-108..110 / ARCH-018..019.
UI_REQUIRED: YES - alcance en handoff UI/UX.
READY_FOR_FRONTEND_PLANNING: YES - gate explícito ui_designer del 2026-10-12; no certifica implementación.

## Module

MOD-008

## Objective / outcome

El usuario solicita borrar sin accidente y el sistema elimina contenido dentro de las ventanas definidas.

## Problem solved

Borrado accidental o retención indefinida de recuerdos privados dañan confianza y derechos.

## Actors

Organizador; administración; sistema.

## Scope

Eliminación individual irreversible de retiro propio confirmado según DEC-097, coordinada con EL-EP-009. No se aplica la ventana manual del evento/cuenta a ese retiro.

Solicitud manual con confirmación explícita: evento PENDING_DELETION con cancelación72h y cuenta pendiente7d con reautenticación cuando corresponda; bloqueo inmediato y cancelación antes de purga. Expiración de gracia: entrada inmediata a PENDING_DELETION con purge_started_at y posibilidad de purga irreversible inmediata conforme DEC-092. Eliminación principal/backups y terminación mínima auditada; no se añade por inferencia ventana manual a fin de gracia.

## Out of scope

Retener media como auditoría; reactivar DELETED; periodos jurídicos definitivamente establecidos.

## Business rules

**CONFIRMED — [DEC-097..099](../DECISIONS.md):** principal/backups cumplen +7/+30 fechas calendario UTC conservando hora UTC. Fin de gracia fija ancla al vencer gracia; retiro propio individual al confirmar; borrado manual al vencer 72h del evento o siete días de cuenta, independiente del inicio del worker. No se desplazan deadlines por retrasos operativos ni se añade ventana al retiro irreversible.

CONFIRMED: solicitud de evento bloquea cargas/acceso público; cuenta impide crear eventos y sus eventos dejan acceso público. Ventanas manuales DEC-043/044 permanecen; [DEC-091/092](../DECISIONS.md) concretan cancelación de cuenta, fin de gracia, ancla purge_started_at y límites de purga/backups. No hay recuperación normal de contenido purgado.

Tras cancelar cuenta dentro de ventana, restaurar eventos conforme plazos actuales y cierres voluntarios, sin recuperar purgados. Si no se cancela, purgar sus eventos tras ventana de cuenta sin agregar72h por cada evento. DEC-098/099 concretan calendario y ancla; enqueue no prueba purga completada.

Investigación ordinaria no amplía máximos de DEC-092: evidencia se resuelve/reduce antes del plazo. LEGAL_OR_SECURITY_HOLD es una medida distinta autorizada y auditada; bases/datos/duración máxima PENDING jurídico. No se trata una investigación ordinaria como un hold ni se autoriza retención indefinida.

## Main scenarios

Solicitar y cancelar evento; solicitar cuenta y cancelar; finalizar ventanas/purgar; eliminación por gracia vencida; notificar conclusión.

## Edge cases

Cuenta con varios estados/eventos; cancelación durante job; eventos suspendidos/investigación; exportaciones temporales; restauración backup; contenido ya retirado por privacidad.

## Data

Solicitud/cancelación, causa de entrada a PENDING_DELETION, estado previo, fechas, purge_started_at, recursos relacionados, tombstones/información de eliminación, tareas y evidencia de purga/auditoría mínima. Metadatos de hold no implican criterios jurídicos ya aprobados.

## Permissions

Organizador propio con confirmación/reautenticación; admin cancela cuando técnicamente posible o interviene justificadamente; sistema purga; sin recuperación DELETED.

## Integrations

Eventos, media, exportaciones, sesiones, planes, notificaciones y backups.

## Dependencies

EL-EP-001, EL-EP-003, EL-EP-008, EL-EP-010, EL-EP-013, EL-EP-014 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Borrado auditable, sin media retenida para auditoría; ventanas cancelables; alertas de fallos; minimización.

## Success criteria

- +7/+30 se calculan en calendario UTC conservando hora UTC. Retraso del worker no mueve ancla manual ni deadlines; al confirmar retiro propio se registra su ancla y no existe cancelación.

Bloqueo inmediato y cancelación verificable; principal/backups cubiertos; no resurrección de contenido purgado.

- Al finalizar gracia, PENDING_DELETION inmediato registra el ancla y puede comenzar la purga irreversible, sin añadir una ventana cancelable manual no aprobada.
- Principal debe completarse dentro de purge_started_at + 7 días naturales; backups ordinarios no pueden recuperar contenido como activo después de +30 días naturales. No se cuentan plazos desde solicitud original o final del borrado principal.
- Restore antiguo reaplica información de eliminación/tombstones; contenido purgado no revive como activo.
- Investigación ordinaria no detiene máximos; un hold excepcional requiere autorización/auditoría y su política jurídica específica, no una marca genérica que elimine deadlines.
- Cancelar cuenta dentro de ventana conserva cierres voluntarios y aplica fechas actuales; terminar ventana de cuenta no agrega otras72h por evento.

## Risks

Duplicar ventanas de cuenta/evento; purge de datos retenidos legalmente; paquetes olvidados.

CONFIRMED — CR-002/DEC-061..064: Borrado masivo/cleanup async durable en ObjectStorage originales/derivados/exports/copias; PITR no resucita borrados. Versionado/retención proveedor deben respetar reglas. PL-013/014 respondidas en DEC-091/092, con precisiones temporales/de alcance por verificar y revisión legal pendiente; layout/herramientas no seleccionados.

## Open questions

Ningún BLOCKER de requisitos propio: PL-013/014/018..020 respondidas en DEC-091/092/097..099 y re-review aprobado en [precisiones finales](../sessions/2026-10-08-precisiones-finales-mvp.md). DEC-092 prevalece sobre cualquier lectura de DEC-078 que amplíe máximos por investigación ordinaria. Q-029 y fundamentos/datos/duración de hold siguen pendientes jurídicos; esa excepción no se habilita en eliminación ordinaria del MVP.

## UI/UX handoff

READY_FOR_TICKET_WRITING: YES - decisions verifier/intakes cerradas y dictamen APPROVED; ejecución conserva dependencias y pruebas. Ver límites por alcance abajo.

UX_SCOPE: Confirmar/cancelar borrado, causas y retención; DEC-107 cierra reautenticación de cuenta. [Handoff aprobado](../../context/ui-deletion-flow.md).

FLOWS / SCREENS / REUSED_COMPONENTS / COMPONENT_EXTENSIONS / STATES / RESPONSIVE / ACCESSIBILITY: [especificacion por epica](../../context/ui-mvp-epic-review.md#el-ep-015). NEW_COMPONENTS: ninguno.

UX_DEPENDENCIES: [Contrato MOD-001 aceptado](../../context/account-reauthentication-contract.md); lifecycle003 y retiro009 por causa. La ejecución integrada requiere las capacidades correspondientes, no su implementación completa para planificar UI.

UX_OPEN_QUESTIONS: ninguna funcional nueva; gates tecnicos aplicables en el handoff.

## Gate vigente por alcance — 2026-10-12

DEC-107 completa la reautenticación aprobada sin modificar las ventanas ni reglas previas. [Coordinación MOD-008](../../context/deletion-coordination-contract.md) reutiliza ARCH-002/005/006/010 y los propietarios existentes. Los dictámenes previos se conservan como historia.

- READY_FOR_IMPLEMENTATION: YES para contratos/consumidores de causas cerradas (manual evento/cuenta, gracia, retiro propio), proyección y UI diseñada; ejecución integrada conserva dependencias concretas.
- **HISTÓRICO del primer gate2026-10-12:** PARTIAL por verifier/migración e intakes no acreditados. **VIGENTE:** DEC-108..110 los resuelven con aprobación del usuario y revisión de seguridad; [verifier](../../context/organizer-password-verifier.md) y [causas de purga](../../context/trash-quarantine-purge-policy.md) tienen scope propio READY_FOR_IMPLEMENTATION YES. Correcciones/implementación y evidencia integrada pendientes, sin declararlas realizadas.
- Implementación no terminada no equivale a contrato pendiente. Adapters/recovery/storage y validaciones reales siguen trabajo de integración/Beta, sin seleccionar proveedores ni declarar gates PASS.
- LEGAL_OR_SECURITY_HOLD excluido; Q-029/EL-EP-017 no se cierran por este gate ordinario.

Evidencia histórica en [primer gate](../sessions/2026-10-12-el-ep-015-gates.md); cierre/impacto vigente en [decisiones y reevaluación](../sessions/2026-10-12-el-ep-015-decisions.md). EL-TK-018/019 conservan sus gates independientes de política/token: no bloquean construir verifier/consumidores, pero recuperación debe estar implementada antes de depender de resets forzados.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [x] Scope/out-of-scope clear enough
- [x] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [x] No BLOCKER questions
- [x] Main scenarios verifiable

DoR de requisitos aprobada; no generar tickets frontend antes del gate UI completo ni habilitar hold con bases/duración pendientes.

## Priority

P0 — Capacidad necesaria para el MVP/BETA operativo.

## Change history

- 2026-10-12: usuario ratifica DEC-108..110 tras auditoría real y revisión de seguridad/crítica. Architect/requirements_reviewer habilitan alcance propio; datos legacy/correctivos/recovery y pruebas siguen prerrequisitos de integración. No código ni tickets nuevos; histórico preservado.

- 2026-10-12: DEC-107 aprobada por usuario; gate UI aprobado expresamente; contratos localizados y auditoría de dependencias. Sin código/tickets nuevos ni cambios de reglas aceptadas; pendientes técnicos por alcance explícitos.

- 2026-10-08: requirements_reviewer aprueba READY de requisitos sin hallazgos; implementacion/UI conservan gates aplicables. [Dictamen](../sessions/2026-10-08-precisiones-finales-mvp.md).

- 2026-10-08: DEC-091/092 registran respuestas sobre cuenta y texto específico de purga. Precisión parcial de DEC-078, ventanas manuales preservadas y gate pendiente; sin tickets ni código.

- 2026-10-07: CR-002 resuelve TC aplicables y sustituye restricciones CR-001; estado/bloqueantes de producto conservados.

- 2026-10-07: CR-001/DEC-060 añade riesgos de purga/recuperación local; conserva NOT_READY y reglas/bloqueantes previos.

- 2026-10-07: creación por product_planner con trazabilidad Q-019, Q-026; DEC-043, DEC-044, DEC-045, DEC-059; estado inicial NOT_READY; sin tickets.

