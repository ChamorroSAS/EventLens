# Media inspection

`@eventlens/media-inspection` contains the internal inspection workflow used by the media-processing job. It checks the original's real container and bounded decode, scans the same immutable original with ClamAV, and persists the resulting safety fact through the queue's transaction checkpoint.

## Result and persistence

`InspectOriginal.execute(job, reservation, operationId)` returns a `SafetyFact`. `MediaSafetyPolicy.eligible(...)` accepts it only when the format result is `VALID`, the malware result is `NO_THREAT_DETECTED`, and the original identity, generation, revision, execution, image, signature snapshot, profile and validity window match the current facts. Other outcomes remain ineligible.

The PostgreSQL repository keeps the current fact for a media generation and records inspection history and audit data. The checkpoint verifies the active job/resource ownership in the same transaction. It does not complete the processing job; later pipeline phases own promotion and completion.

The ClamAV adapter uses the trusted scanner profile from `@eventlens/media-execution` and a verified, read-only official signature snapshot. The scanner runs per attempt without network access. The separate signature updater acquires and verifies official databases. Scanner reports are reduced to typed outcomes; incomplete coverage, stale or invalid signatures, execution failures, and ambiguous reports yield `INCONCLUSIVE`.

This package is an internal backend contract. It does not expose an HTTP endpoint, quarantine transition, derivative generation, download handler, storage provider, or recovery-authority implementation.

## Local checks

From the repository root:

```powershell
pnpm --filter @eventlens/media-inspection typecheck
pnpm --filter @eventlens/media-inspection build
pnpm --filter @eventlens/media-inspection test
```

The real PostgreSQL and isolated-engine validation harness is documented in [`infra/validation/media-inspection/README.md`](../../infra/validation/media-inspection/README.md). The final independent run passed 46/46 tests; its scope and artifact links are recorded in the harness README.
