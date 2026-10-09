# EventLens — mapa conceptual PostgreSQL

**CONFIRMED:** una DB PostgreSQL 16 en contenedor independiente, co-localizada con app durante Beta según DEC-106/EL-TD-008; PITR/backups conforme DEC-062; cola inicial en esa DB. **RECOMMENDED:** esquema lógico por ownership; nombres de tablas orientativos, sin migraciones creadas. Datos binarios de media/ZIP nunca en PostgreSQL.

| Owner | Registros conceptuales | Restricciones/índices relevantes |
|---|---|---|
| MOD-001 | organizers, administrative_principals, invitations, access_requests, authenticated_sessions, verification/recovery tokens | Provision admin controlada/auditada sin registro autoelevable; credentialRevision/revoke watermark/epoch; tokens digest únicos, expiración; email normalizado antienumeración |
| MOD-002 | events, event_access_revisions, event_schedules, event_cover_assignments | owner; estado/revision; coverAssetId+assignment revision; IANA + instantes UTC; índice de acciones due; previous_status no autoriza retorno sin policy |
| MOD-003 | guest_sessions, upload_intents, media, event_assets, processing_attempts, stored_objects | purpose GUEST_CONTRIBUTION/EVENT_COVER y actor owner; UNIQUE(upload_intent→recurso); object refs neutrales; asset event/class/generation/safety; roles original/derivative/staging; nunca signed URL persistente |
| MOD-004 | media_governance, moderation_actions, reports, report_actions, trash_metadata | FK media/event; decisiones versionadas; dates/trash_previous_status; bloqueo de seguridad distinto de aprobación |
| MOD-005 | exports, export_items, export_parts, export_attempts | Manifiesto/ref media+object version; UNIQUE(export,part,generation); available_at/expires_at; índices caducidad/invalidación |
| MOD-006 | plans, plan_assignments, plan_overrides, capacity_ledgers, upload_reservations, extension_requests | plan base separado de override; contadores no negativos; UNIQUE(resource,operation); serialized reserve/commit/release |
| MOD-007 | support_cases, administrative_grants, admin_requests | Motivo/referencia/tipo actor; grants con ámbito/expiry; admin no se vuelve propietario de media |
| MOD-008 | policy_versions, consent_acceptances, deletion_requests, deletion_tasks, purge_tombstones, retention_records | Versiones aceptadas/event/session/date; barrier generation; cancel_until/purge_after; tombstone mínimo sin media |
| MOD-009 / infrastructure | audit_events, notification_intents, email_deliveries, jobs, job_attempts, scheduler_claims, idempotency_receipts, recovery_authority_receipts, download_evidence_aggregates | audit append-only; jobs/receipt dedup; lease/fence/epoch; journal receipt+sequence/ACK sin secretos; agregado owner-event-level sin contar firma como transferencia |

## Identidades, relaciones y tiempo

IDs aleatorios no reemplazan autorización. Keys de storage nunca derivadas exclusivamente del nombre aportado ni de una ruta controlada por cliente. Guest tokens/secretos no se guardan en claro. Persistir instantes UTC (`timestamptz`) y zona IANA separada; scheduler compara con reloj DB. Una programación tiene revisión para que cambios de fecha/TZ no ejecuten trabajos obsoletos. El ancla funcional exacta sigue PL-001.

FKs y constraints de pertenencia impiden referencias cross-event. `media.event_id`, sesión/upload/manifest deben coincidir. Eliminación normal es soft control + purga externa antes de limpieza de filas según retención; cascades SQL no sustituyen purga de storage. Read models admin omiten contenido/PII que no necesita el diagnóstico.

## Transacciones e invariantes

1. Create upload intent + reserva + idempotency receipt juntos; efecto de storage ocurre fuera. Metadata observada no confía en valores del cliente.
2. Confirm media (`UPLOADED`) + consumo de reserva exactamente una vez + processing job + auditoría juntos. Un 2.º confirm devuelve recibo existente.
3. Moderación y proyección canónica media se actualizan mediante contrato del dueño en la misma UnitOfWork; no dos escritores libres de status.
4. Solicitud/barrera de eliminación + bloqueo lógico + jobs/auditoría juntos. Purga externa por tareas por objeto, progreso persistido y finalización comprobada.
5. Reserve job usa transacción corta/row lock SKIP LOCKED; commit antes de trabajo; complete resultado y lease mediante CAS.
6. Cuota mantiene reserved/committed por ledger idempotente; contabiliza originales físicamente presentes incluso TRASHED/REJECTED/QUARANTINED. Qué otros bytes/categorías consume el plan y unidades dependen de PL-011/012. Contadores físicos separados por clase permiten cambiar política sin perder inventario.
7. No marcar objeto ausente ante timeout/5xx; se distingue Missing comprobado de Unknown temporal. Missing dispara reconciliación y no liberación silenciosa de cuota.

Lock order y efectos externos: [backend-architecture.md](backend-architecture.md). Diseño jobs: [media-and-jobs-architecture.md](media-and-jobs-architecture.md).

## Recuperación y migraciones

PITR requiere base backup válido + cadena WAL/servicio equivalente, no solo dump diario. Restore a entorno aislado, verificación de integridad, reconciliación con objetos y tombstones y reaplicación de purgas antes de tráfico. [operations-and-recovery.md](operations-and-recovery.md) separa app/infra/procedimientos.

**RECOMMENDED — AQR-001:** receipts SQL no sustituyen RecoveryAuthority externo durable; PREPARE→tx dominio/receipt/job→ACK externo y barrera fail-closed ante ambigüedad. Checkpoint/seq por subject gobiernan QR/PIN revisions, organizer/admin/guest revocations, credenciales/reset tokens, suspensions, pending deletions/cancelaciones y purga. Recovery epoch nuevo invalida grants temporales; hash password restaurado solo sirve si credentialRevision vigente coincide, de otro modo reset/revalidación controlados. Reconciler no considera ausencia de fila como prueba de abort. Histórico de cancellation causal impide purgar request cancelado.

Assets cover tienen inventario separado y references de asignación owner; transición safe READY del asset más CAS de cover vigente bajo tx, cleanup anterior por job. Sustitución fallida no borra asset vigente. Ledger guarda bytes/clase física independiente de imputación comercial pendiente PL-011. Auditoría bootstrap/revocation admin es durable y no conserva secretos.

**RECOMMENDED:** migraciones versionadas, probadas sobre PostgreSQL real, aplicadas con credencial dedicada/lock y rollback operacional o forward fix documentado. Evitar cambios irreversibles y mantener compatibilidad de contrato durante actualización de API/workers; apagar/reservar workers incompatibles antes de promoción. La aplicación no ejecuta DDL con su credencial runtime. PITR de jobs recupera intents, pero no deshace correos ya enviados ni recrea media eliminada.
