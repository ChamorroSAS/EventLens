# MOD-008 — Política localizada de purga de papelera y cuarentena

Status: ACCEPTED — 2026-10-12, DEC-109/110 / ARCH-019; aprobación expresa del usuario. Sólo auditoría y contrato, sin modificar código ni estados históricos.

## Contratos existentes y huecos reales

| Fuente | Ya aprobado / implementado | Pendiente concreto |
|---|---|---|
| DEC-022/045/096, EL-TK-107/109 | Papelera restaurable siete días;109 cierra restauración al alcanzar restoreDeadline y emite una intención de purga; físico/maximos corresponden015 | Explicitar ancla persistida común y origen +30 para esa causa;109 sigue READY, no ejecución entregada |
| EL-TK-042 / DEC-037/038 | Disposición restrictiva por admin/security autorizados; intención física delegada | Actual [quarantine-delete.ts](../../packages/media-inspection/src/quarantine-delete.ts#L187) cambia media DELETED antes de borrar, contradiciendo la garantía técnica de ARCH-006 |
| Intención042 | Guarda operation/media/event/generation/status/dedup/created_at | No contiene policyRef/ancla/deadlines/inventario exacto ni revisión esperada postdisposición; entrega a015 requiere contrato acreditado |
| DEC-092/097/098/099 | Máximos +7/+30, calendario UTC/anclas explícitas de gracia/manual/retiro propio | No nombran expresamente una ancla de disposición de cuarentena ni origen común de backup de papelera; no extrapolar automáticamente retiro propio |

Auditoría acotada del snapshot7d84b0a, revalidada en stage84c2bee, con lecturas directas: graph stale/no tracking en media-inspection. EL-TK-042 DONE conserva su cierre histórico de disposición lógica; ese cierre y su receipt no prueban eliminación física. [Coordinación vigente](deletion-coordination-contract.md) ya tiene política/ancla aprobadas; integración permanece pendiente de correctivos y evidencia, no de otra decisión para este intake.

## Anclas aprobadas

- Papelera: `purge_started_at = restoreDeadline` persistido por el propietario. El scheduler tardío no usa now/claim/delivery como nueva ancla. Al alcanzar ese instante deja de admitirse restauración y puede comenzar purga irreversible; no existe otra ventana72h/7d. Mantener cálculo de la ventana aprobado por su dueño, sin redefinirlo aquí.
- Cuarentena: `purge_started_at = dispositionConfirmedAt`, timestamp servidor fijado una sola vez en el registro durable de la orden autorizada de eliminación que confirma su efecto. No anclar al ingreso a QUARANTINED, recepción de la petición, fecha cliente, respuesta ephemeral, ACK demorado o inicio del worker. La cuarentena por sí sola no ordena purga; sólo el actor autorizado conforme a042.
- En ambas: principal máximo addUtcCalendarDays(anchor,7); residual ordinario máximo addUtcCalendarDays(anchor,30), conservando hora UTC. No contar residual desde final principal. El uso de una nueva causa/retry/entrega no amplía obligaciones anteriores vigentes sobre el mismo recurso.
- Barrera/disposición instala cierre inmediato; purga física requiere autorización actual, epoch/checkpoint íntegros, lease y writer drain. PREPARED/ACK desconocido falla cerrado: no reactiva recurso ni autoriza purga irreversible automática. Cuando se reconcilia, conserva ancla/deadlines originales; no los mueve para compensar demora.
- LEGAL_OR_SECURITY_HOLD sigue excluido; investigación ordinaria no suspende los máximos. No nuevas políticas jurídicas ni proveedores.

Cada productor entrega policyRef/version, sourceOperation/receipt, ref/generation/revisión esperada, ancla persistida y deadlines junto a referencia de inventario propietario. Owner MOD-003/004 acredita hechos, MOD-008 coordina; no duplicar scheduler/autorización/quota/exports/RecoveryAuthority. ObjectStorage/inventario/drain y evidencia residual reutilizan ARCH-002/005/006/010 y el contrato vigente.

## Estado lógico vs eliminación física: alternativa recomendada

**Opción A — APPROVED por el usuario; preservar ARCH-006, corregir el productor en trabajo posterior.** La futura ejecución042 registra disposición irreversible + intención, avanza revisión y conserva media QUARANTINED hasta verificar purga principal y quiescencia. Disposición/barreras deniegan acceso, liberación, retry y publicación aunque el estado todavía sea QUARANTINED. Sólo el puerto propietario MOD-003 confirma DELETED con evidencia física. No agrega estados funcionales de media ni cambia reglas de actor, ventanas o recuperación.

Mantener hechos separados: disposición autorizada; principal físicamente verificado/mainPurgedAt; residual/deadline/evidencia de no restauración activa. Ledger137 y notificación de conclusión no se disparan por la disposición o intención. DELETED no afirma backup borrado instantáneamente.

**Opción B — no recomendada:** conservar DELETED de042 como excepción lógica y exigir otra evidencia a todos sus consumidores. Requiere análisis de impacto y supersesión localizada de la garantía de ARCH-006; aumenta ambigüedad de API/audit/gallery/exports/ledger/restore. No se adopta por inferencia ni se debilita globalmente DELETED.

No modificar retrospectivamente estados de datos/tickets a ciegas. Filas históricas DELETED con sólo receipt de042 mantienen acceso restringido y evidencia física desconocida hasta reconciliar/verificar. Nunca pasarlas automáticamente a QUARANTINED, reabrirlas ni contarlas como purga completada por ese label. Tratamiento de datos existentes se planifica con inventario/procedencia y authority, no ejecutado aquí.

## Impacto mínimo y defectos que no se corrigen en este trabajo

- EL-TK-109: conservar responsabilidad de detectar expiry/emisión; añadir binding de policy/ancla/receipt/deadlines. Correctivo de EL-TK-108 DONE: restauración en [media-moderation.ts](../../packages/media-inspection/src/media-moderation.ts#L924) permite igualdad (usa deadline < now), mientras109 exige cierre al alcanzar deadline. Debe usar frontera estricta now < restoreDeadline y reloj servidor en la frontera serializada, no una fecha anterior a esperar el lock; no ampliar ventana ni reabrir su histórico.
- EL-TK-042: preservar ID/DONE histórico; registrar correctivo necesario para no emitir DELETED físico antes de verify, incluir timestamp/binding acreditados y PREPARE-SQL-ACK antes de consumo irreversible. Source hoy usa SQL-only y timestamps diferentes para intent/receipt/response; no elegir el `new Date()` de respuesta como fuente de ancla ni acreditar journal externo inexistente.
- EL-TK-041: [release](../../packages/media-inspection/src/quarantine-release.ts) admite QUARANTINED y no comprueba disposición de purga bajo el mismo lock. OpciónA necesita guardia de disposición irreversible vigente también en replay, además de authority/grant actuales. Sin esa corrección no habilitar el nuevo comportamiento042.
- Promoción/procesamiento conserva CAS/generación/revisión y estados elegibles. Galería, grants, exportaciones, restore y ledger consumen restricciones/evidencia del dueño, no un label como prueba física.057 sólo limpia outputs de intentos, no demuestra principal media purgado.

No regenerar tickets ni marcar nuevos históricos DONE/NOT_READY. Revisión de alcance e impacto sólo en contratos/dependencias afectados; código correctivo e integración tienen gates propios. El contrato ordinario015 y su UI ya aprobada mantienen su readiness independiente.

## Aprobación y evidencia futura

El usuario aprobó mappings/anclas comunes y OpciónA. Architect y requirements_reviewer: APPROVED, REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES para contratos/intakes/correctivos propios definidos. No se modifica ARCH-006 aceptado: OpciónA lo cumple; no corresponde afirmar que042/041 ya fueron corregidos ni que la purga integrada esté acreditada.

Pruebas previstas: reloj/deadline exacto, restauración vs expiry/claim, jobs tardíos/replay, disposición vs liberación/proceso/CAS, PREPARE/SQL/ACK/crash/PITR antes y después, registros antiguos, inventario/versions/multipart/export/cover, UNKNOWN vs Missing, quiescencia y liquidación una vez. Verificar principal +7 y residual +30 desde ancla original. Ningún gate Beta ni resultado operativo pasa a PASS por esta propuesta.
