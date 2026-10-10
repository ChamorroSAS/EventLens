# Media inspection validation harness

This harness validates the internal EL-TK-033 inspection package against the shared Docker lab, PostgreSQL, the approved media corpus, and a verified official ClamAV signature snapshot. Its evidence is scoped to the run; it does not certify Beta gates or select a production object-storage provider.

## Acquire or verify official signatures

Run from the repository root. A fresh acquisition uses the pinned ClamAV 1.4.6 image and needs network access for `freshclam`; scanning and snapshot verification run without network access. The script verifies the signed CVD files, engine loading, hashes, and daily-content age, then publishes an immutable snapshot beneath `.local/signatures` and writes `evidence/signature-acquisition.json`.

```powershell
.\infra\validation\media-inspection\UpdateSignatures.ps1
```

For an already acquired snapshot, `-ReuseSnapshotPath` verifies it without changing it. `-MaximumDailyAgeHours` controls the updater's accepted daily-content age (default 72 hours); this is separate from the inspection runtime's configured maximum age.

## Build and run validation

The lab prerequisites are the existing Docker validation lab and its local secret files, corpus, and registered-media evidence consumed by `Run.ps1`. The script creates a uniquely named PostgreSQL database and a temporary Docker input volume for a run. Evidence defaults to the harness `evidence` directory; pass a new path when retaining a separate run.

```powershell
.\infra\validation\media-inspection\Run.ps1 -Build -EvidenceDirectory .\tmp\media-inspection-run
```

Omit `-Build` to use the already built validation image. The run writes `result.json` and `tests.json` to the selected evidence directory. It runs migrations twice, package typecheck/build, and the Vitest suite against the run's PostgreSQL database. Use a new evidence directory for each run so prior evidence remains attributable to its original code and inputs.

The harness mounts the Docker socket for the validation supervisor to launch isolated scanner/parser attempts. This is a local validation setup, not a production deployment recipe. A test result does not by itself mark MEDIA-001, CAP-001, DR-001, or EXPORT-001 as passed.

### Quarantine-only validation (EL-TK-034)

To validate the quarantine package scope, run from the repository root with the same lab prerequisites, including an already verified official signature snapshot:

```powershell
.\infra\validation\media-inspection\Run.ps1 -QuarantineOnly -EvidenceDirectory .\tmp\media-quarantine-run
```

Add `-Build` when the validation image needs rebuilding. This mode still runs the required migrations, package typecheck and build, then runs only the quarantine unit and PostgreSQL integration tests. It writes `result.json` and `tests.json` to the selected evidence directory. The coverage includes the persisted inspection cause, prepared restriction, atomic media/audit/receipt checkpoint, stale authority or revision rejection, compatible acknowledgement replay, and preservation of the original and processing-job state. The result applies only to this implementation scope; it does not establish a Beta validation gate or production storage-provider decision.

## EL-TK-033 final independent result

The recorded tester run passed **46/46 tests** (32 PostgreSQL-real integration tests and 14 unit tests). EL-TK-055 and EL-TK-056 regression runs passed 25/25 and 21/21 respectively. The exact run, test report, and 29-file source hash manifest are in [`evidence/tester-final`](evidence/tester-final/); the ClamAV signature snapshot re-verification is in [`evidence/signature-acquisition.json`](evidence/signature-acquisition.json). Eight physical originals were used as representative corpus samples; HEIC/HEIF are one format family for coverage accounting. A real EICAR signature was detected in the isolated scanner-adapter test; that result does not represent an EICAR multimedia end-to-end or HTTP test. Beta validation gates remain NOT_EVALUATED.

## EL-TK-034 quarantine evidence (final)

The combined inspection and quarantine run passed **79/79 tests**: 32 inspection PostgreSQL integration, 14 inspection unit, 19 quarantine PostgreSQL integration, and 14 quarantine unit tests. The focused quarantine run passed **33/33**, and the independent job-queue regression passed **25/25**. Typecheck, build, common migration assembly/SQL integrity, and the 12-file source manifest verification passed. Validation used real PostgreSQL 16 and the MinIO lab object store. Tester, reviewer, and critical review approved the implementation without findings.

Reproduce the combined suite from the repository root with:

```powershell
.\infra\validation\media-inspection\Run.ps1 -Build -EvidenceDirectory .\infra\validation\media-inspection\evidence\quarantine-inspection-regression
```

The focused result and source manifest are in [`evidence/quarantine-independent`](evidence/quarantine-independent/); the combined result and reports are in [`evidence/quarantine-inspection-regression`](evidence/quarantine-inspection-regression/). The queue regression result is in [`../job-queue/evidence/quarantine-regression`](../job-queue/evidence/quarantine-regression/).

This is implementation-scope evidence. The durable production `RecoveryAuthority` adapter remains unimplemented; focused tests use a laboratory authority, and missing required capability fails closed. MEDIA-001, CAP-001, DR-001, and EXPORT-001 remain NOT_EVALUATED; the definitive Beta/production object-storage provider remains DEFERRED.
