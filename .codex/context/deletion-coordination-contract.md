# MOD-008 — Coordinación de eliminación ordinaria

Status: CLARIFIED_EXISTING_CONTRACTS — 2026-10-12. Fuente de reglas: [DEC-043/044/045/059/089/091/092/097/098/099](../product/DECISIONS.md), [EL-EP-015](../product/epics/EL-EP-015.md). Complementa intercambios entre propietarios; no cambia ventanas ni arquitectura.

## Reutilización y ownership

Un único DeletionCoordinator MOD-008 consume solicitudes e intents de los propietarios. MOD-001 posee identidad/sesiones; MOD-002 lifecycle; MOD-003 objetos/media/portadas; MOD-004 papelera/retiro; MOD-005 exports/grants; MOD-006 ledger; MOD-009 audit, intents, jobs y evidencia operativa. Cada propietario muta su estado mediante su API pública y la UnitOfWork compartida; el coordinador no escribe tablas ajenas ni crea otro RecoveryAuthority/ObjectStorage.

| Productor / consumidor | Contrato existente reutilizado |
|---|---|
| Lifecycle / EL-TK-067 | Fin de gracia a PENDING_DELETION, ancla fija; no purga ni ventana nueva |
| Papelera / EL-TK-109 | PurgeRequest tras ventana de papelera; no reimplementar scheduler/moderación |
| Retiro / EL-TK-114, EL-TK-119 | OwnRemoval irreversible confirmado o disposición autorizada del caso; intake sin sesión no equivale a retiro ya autorizado |
| Cuarentena / EL-TK-042 | QuarantinePurgeIntent; no duplicar autorización administrativa |
| Exports / EL-TK-128 | Invalidation por privacidad/seguridad/revocación + inventario exacto de partes; no lógica de grants en UI |
| Capacidad / EL-TK-137 | Recibo de eliminación física comprobada para liquidar consumo exactamente una vez |
| Avisos / EL-TK-159, EL-TK-156..158 | Hechos confirmados hacia NotificationIntent; fallo email no revierte solicitud/purga |
| Recovery / EL-TK-046, EL-TK-172/174 | Facts/tombstones independientes de PITR, barrera/reconciliación y evidencia; DONE vecino no prueba toda integración015 |

## Intercambio mínimo

DeletionIntent: sourceOperationId, owner/cause, scopeType/scopeRef, requestId cuando existe, generación/revisión esperadas, policyRef/version, cancelUntil cuando corresponde, purgeStartedAt autorizado y referencias verificables de recursos relacionados. Identidad/capacidad se resuelven en servidor; no instrucciones SQL/storage del cliente. Deduplicar por operación productora + scope/generación + causa; un cambio de payload/política bajo mismo identificador da conflicto.

Una causa no inventa el ancla de otra. Las anclas para evento/cuenta manual, gracia y retiro están en DEC-092/097..099. DEC-109 completa explícitamente papelera/cuarentena en [su política](trash-quarantine-purge-policy.md). La decisión ya está cerrada; cada productor debe implementar entrega/binding de la ancla/deadlines/inventario autorizados. Un mensaje sin esos hechos no autoriza purga, pero la implementación pendiente no reabre el gate documental de su contrato.

## Solicitud, cancelación y claim

Solicitud: autorización/confirmación; para cuenta, evidencia [MOD-001](account-reauthentication-contract.md). PREPARE externo → SQL corto con barrera, request/revisión, audit/receipt/job/intents → ACK. Nuevas capacidades quedan bloqueadas desde PREPARE; respuesta incierta no implica reapertura ni purga automática. Evento bloquea uploads y acceso público; cuenta bloquea creación y acceso público de hijos. Restricciones superpuestas permanecen.

Cancelación: request exacta, actor autorizado, hora servidor estrictamente anterior a cancelUntil y sin frontera irreversible. Serializar con el mismo claim/revisión y CAS; recibo causal y ACK antes de levantar exclusivamente la barrera de esa solicitud. Al cancelar cuenta, MOD-002 recalcula estados según plazos y cierres voluntarios: nunca ACTIVE ciego ni recuperación de purgados. Vencer siete días no agrega 72h por hijo. Gracia/retiro irreversible no ofrecen cancelación manual.

Claim: sólo solicitud vigente/reconciliada con ancla y autorización de purga acreditadas. No inferir éxito desde job encolado. Jobs/receipts siguen ARCH-002/005, presupuesto/retry y alertas existentes. Pérdida de lease/fence/epoch/DB, cancelación ganadora o authority desconocida impiden efectos irreversibles. El replay conserva ancla, deadlines y recibos; no genera otra eliminación ni desplaza tiempos.

## Purga y evidencia

Reutilizar [protocolo idempotente de purga](operations-and-recovery.md#protocolo-idempotente-de-purga), [ARCH-006](architecture-decisions.md#arch-006--outputs-aislados-y-borrado-efectivo) y puertos ObjectStorage de [media-and-jobs-architecture.md](media-and-jobs-architecture.md). Inventario incluye originales, derivados, EventAssets/portadas, exports/partes, outputs/partials, staging/multipart y versiones/copias pertinentes. Nunca borrar sólo por no ver una referencia en snapshot restaurado.

Cancelar nuevas escrituras/capacidades; probar quiescencia y drenaje externo antes de finalización física. Revocar la autorización API no retira universalmente una URL/transferencia ya emitida. Calls a storage fuera SQL; resultado por ref/version exacta: Present/Missing verificado/Unknown. Missing comprobado es idempotente; Unknown/fallo parcial conserva pendiente, retry/alerta y ledger sin falsa liberación. Tres intentos agotados/DEAD no significan eliminación completada.

DeletionEvidence separa: request/claim confirmado, inventario/revisión, pruebas terminales de writers, resultado por objeto/version, principal verificado/mainPurgedAt, liquidación causal, tombstone/journal sequence/checkpoint, deadline residual y prueba de no recuperación activa. No guarda multimedia, passwords, firmas ni un volcado de datos personales. La finalización física del coordinador y la terminación DELETED de evento/cuenta, cuando corresponda, requieren principal verificado y ausencia de capacidades/escritores capaces de recrearlo; no prueban borrado instantáneo de backups. Purga SQL minimiza datos conforme a política propietaria; conserva recibos/tombstones mínimos indispensables, no borra la información que evita resurrección.

No equiparar una disposición de un productor con esa evidencia: el cierre histórico de EL-TK-042 registra media DELETED al emitir QuarantinePurgeIntent pendiente. DEC-110 aprueba su corrección futura y la guardia041, manteniendo QUARANTINED restringido hasta verify físico conforme a ARCH-006. Histórico DONE no se reescribe; filas antiguas no se reactivan ni su label acredita purga. Contrato corregido listo para implementar; integración sigue pendiente de ese correctivo y de evidencia real.

## Deadlines y recuperación

Para causas cubiertas por DEC-092/097..099: addUtcCalendarDays(purgeStartedAt,7/30), conservando hora UTC. Ancla manual = vencimiento72h/evento o siete días/cuenta; gracia = graceEndsAt; retiro propio = confirmación irreversible. Retraso de worker no mueve ancla. Persistir timestamps/deadlines y alertar antes de incumplirlos; UI muestra fecha exacta en zona del evento cuando corresponda, sin usar hora local para el cálculo.

Backups ordinarios no permiten recuperar contenido como activo después del máximo +30. Restore reaplica tombstones/facts desde authority independiente y con checkpoint íntegro antes de servir scopes; snapshots viejos no reviven datos ni cancelaciones históricas. Una copia residual no constituye acceso activo autorizado.

LEGAL_OR_SECURITY_HOLD no está habilitado en MVP ordinario. Un campo/flag de un adapter o ejercicio no constituye aprobación jurídica. Investigación ordinaria no suspende +7/+30. Bases/datos/duración de hold y Q-029 quedan en EL-EP-017; no se usan para cerrar ni flexibilizar este contrato.

## Gate por alcance

DEC-108..110 / ARCH-018..019 cierran decisiones previamente localizadas: contratos de verifier y ambas causas tienen REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES para su alcance propio, tras architect/requirements_reviewer. Ticket-writing y planificación no exigen épicas vecinas completamente DONE. Ejecución integrada requiere reauth/sesión restringida/correctivos de identidad; productores/bindings/guardias; invalidación de exports; storage/inventario/drain; journal/restore; notificaciones/ledger. Proveedor definitivo, dimensionamiento y evidencia Beta siguen pendientes. Datos no acreditados fallan cerrado; no son otra decisión de política por resolver.

Pruebas futuras: PostgreSQL real para request/cancel/claim/replay/CAS y rollback; storage real para versiones/multipart/Unknown/drain/escritor tardío; restore anterior a request/cancel/claim; +7/+30 UTC; principal vs residual; no liberación doble de consumo. UI/gates en [handoff](ui-deletion-flow.md). No se declara PASS de MEDIA-001, CAP-001, DR-001 ni EXPORT-001.
