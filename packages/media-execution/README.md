# Media execution

`@eventlens/media-execution` provides the supervised execution boundary for media-processing attempts. Its public entry points are exported from `src/index.ts`; the package depends on `@eventlens/job-queue` for execution leases and fencing.

The caller supplies a trusted `ExecutionPlan`, the reserved queue execution, and one-job reservation to `MediaExecutionSupervisor`. The plan identifies the immutable input, optional facts produced by the owning inspector, allowlisted tool steps, and requested outputs. The executor validates configured finite limits and the plan; it does not implement inspection policy, media adapters, domain completion, or output promotion. Outputs are written under a generated attempt-specific key.

The supervisor receives `RecoveryAuthority`, `ObjectStorage`, `ProcessRuntime`, `AttemptInventory`, and `Limits` through its constructor. Limits are mandatory and invalid or absent values fail closed. Generated Prisma records stay in the infrastructure inventory adapter and are not domain entities or HTTP contracts.

An attempt is `QUIESCENT` only after runtime and storage termination proofs have been recorded. If a writer or process cannot be proven terminal, the result remains `UNKNOWN` and the queue reservation is not released. Recovery reconciles an existing attempt; it does not restart it, delete its original, or promote outputs. A cold runtime treats missing terminal proof as unresolved. The storage port must durably account for accepted remote writes and prevent later dispatch for a drained operation ID; abort, HEAD, or expiry alone do not satisfy that contract. No definitive object-storage provider is selected here.

The runtime applies the ARCH-015 Docker isolation contract. Integration callers still own format inspection, media transformation policy, and any later authorized commit through the queue's current fencing and policy checks. See the [accepted media-processing contract](../../.codex/context/media-and-jobs-architecture.md#pipeline-multimedia-adoptado--arch-015) and the [EL-TK-056 completion record](../../.codex/product/sessions/2026-10-09-el-tk-056-implementation.md).

EL-TK-033 extends the trusted runtime with a separate ClamAV profile and bounded observations, preserving the adopted media image. A trusted `phaseId` (default `processing`) permits sequential phases under one reservation; an `ACTIVE` or `UNKNOWN` attempt prevents another phase for the same token. The pipeline owner retains the reservation across phases and releases it only after terminal quiescence. See [ARCH-016](../../.codex/context/media-and-jobs-architecture.md#inspección-antimalware-local-adoptada--arch-016) and [media inspection](../media-inspection/README.md) for the inspection and checkpoint contracts.

The package scripts must run inside the approved Dockerized workspace, where the pinned pnpm and dependencies are installed. For the integrated PostgreSQL/MinIO/runtime validation, use the [Docker harness instructions](../../infra/validation/media-execution/README.md); do not treat running pnpm directly on the host as the integrated validation path. The workspace scripts available inside the container are:

```powershell
pnpm --filter @eventlens/media-execution typecheck
pnpm --filter @eventlens/media-execution build
pnpm --filter @eventlens/media-execution test
```
