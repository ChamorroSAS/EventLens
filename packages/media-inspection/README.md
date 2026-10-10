# Media inspection

`@eventlens/media-inspection` contains the internal inspection workflow used by the media-processing job. It checks the original's real container and bounded decode, scans the same immutable original with ClamAV, and persists the resulting safety fact through the queue's transaction checkpoint.

## Result and persistence

`InspectOriginal.execute(job, reservation, operationId)` returns a `SafetyFact`. `MediaSafetyPolicy.eligible(...)` accepts it only when the format result is `VALID`, the malware result is `NO_THREAT_DETECTED`, and the original identity, generation, revision, execution, image, signature snapshot, profile and validity window match the current facts. Other outcomes remain ineligible.

The PostgreSQL repository keeps the current fact for a media generation and records inspection history and audit data. The checkpoint verifies the active job/resource ownership in the same transaction. It does not complete the processing job; later pipeline phases own promotion and completion.

The ClamAV adapter uses the trusted scanner profile from `@eventlens/media-execution` and a verified, read-only official signature snapshot. The scanner runs per attempt without network access. The separate signature updater acquires and verifies official databases. Scanner reports are reduced to typed outcomes; incomplete coverage, stale or invalid signatures, execution failures, and ambiguous reports yield `INCONCLUSIVE`.

## Quarantine

`QuarantineOriginal.execute(job, input, fact, operationId)` applies quarantine only when the persisted inspection fact identifies `THREAT_DETECTED`, `DECLARED_FORMAT_MISMATCH`, or `CONTAINER_MISMATCH`. A generic `DENIED` result, including corrupt or unsupported content, limits, or inconclusive execution, does not by itself quarantine the original.

The operation prepares a restriction with the existing `RecoveryAuthority`, then uses the queue's restriction checkpoint to validate current authority and media revision and atomically update the media to `QUARANTINED` with its sanitized system audit record and receipt. Authority acknowledgement occurs after the SQL transaction. A compatible retry can recover a lost acknowledgement only after validating the same authority sequence and current restriction; a stale or mismatched replay conflicts. Missing restriction capability or owner SQL policy fails closed. The durable production `RecoveryAuthority` adapter is not implemented here; tests use a laboratory authority, and absence of the required capability remains fail-closed.

Quarantined media is denied by the normal-access guard for read, download, retry, release, transform, and promotion. For other media states the guard defers to the owning policy; it does not grant access. This operation does not complete the processing job, drain a worker, purge or replace the original, expose an HTTP download/release route, or implement an administrative release flow. Those responsibilities remain with their owning pipeline and product tickets. No storage provider is selected here.

## Photo derivatives (EL-TK-035)

`GeneratePhotoDerivatives.execute(...)` consumes the current approved inspection fact and the exact immutable original. Under the supervised media-execution runtime it creates two private JPEG candidates: a thumbnail up to 320 px wide and a preview up to 960 px wide. It preserves orientation and proportions, does not upscale, omits EXIF/location metadata, validates and decodes each output, and verifies its hash and immutable object version by reading it back. The original is only read and remains unchanged.

Metadata, dimensions, strict decoding, size, and SHA-256 are validated from the same buffer inside the isolated runtime. Emitted bytes and stored object readback must match that evidence before the candidate pair, audit fact, and compatible operation receipt are recorded atomically for the media generation and execution token. A retry with a new token retains the earlier candidate history. Stale authority, invalid/partial output, failed verification, or unknown writer drain does not register a candidate. This operation does not publish candidates, complete the processing job, or clean up attempt objects; publication belongs to EL-TK-037 and cleanup to EL-TK-057.

This remains an internal backend operation with no HTTP endpoint. Production worker composition, durable `RecoveryAuthority` and object-storage adapters, and observer wiring remain future integration work. The validation harness uses laboratory adapters; no definitive storage provider is selected. See the [EL-TK-035 validation evidence](../../infra/validation/media-inspection/README.md#el-tk-035-photo-derivatives-final-validation).

## Local checks

From the repository root:

```powershell
pnpm --filter @eventlens/media-inspection typecheck
pnpm --filter @eventlens/media-inspection build
pnpm --filter @eventlens/media-inspection test
```

The real PostgreSQL and isolated-engine validation harness, including inspection, photo-derivative, and quarantine runs, is documented in [`infra/validation/media-inspection/README.md`](../../infra/validation/media-inspection/README.md). EL-TK-033 and EL-TK-034 evidence remains recorded as separate scopes.
