# Media acceptance

`@eventlens/media-acceptance` implementa la frontera de MOD-003 que acepta un original ya sellado y verificado y registra su procesamiento en `JobQueue`.

## Contract

The owner supplies the verified sealed-original source, current policy, ledger, transaction runner, `RecoveryAuthority`, and job publisher through the package ports. The package first persists a projection of the verified seal; this preparation does not mark media `UPLOADED` or create a job. Confirmation re-reads the verified facts and checks the current authority and policy before committing media `UPLOADED`, the logical job, ledger effect, receipt, operation key, and audit row in one SQL transaction.

Compatible confirmation replays return the existing receipt and do not reschedule the job, including after a handler configuration change. Conflicting operation identity, revision, generation, ownership or original fingerprint is rejected. The pending reconciler uses a bounded lexical cursor over known seal projections and revalidates facts when confirming.

The package does not perform upload or physical sealing, set quota policy, expose an HTTP endpoint, inspect media, promote derivatives, or provide a production `RecoveryAuthority` adapter. Prisma manages infrastructure migrations; the package uses the shared transaction adapter without exposing generated models as domain or HTTP contracts. Consumers should use the exported TypeScript contracts and adapt their own owner ports.

## Validation

The implementation was independently validated against PostgreSQL 16. Runner instructions and recorded results are in [infra/validation/media-acceptance](../../infra/validation/media-acceptance/README.md). Operational PITR and the MEDIA-001, CAP-001, DR-001, and EXPORT-001 gates remain separate validation work.
