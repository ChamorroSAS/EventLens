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

## EL-TK-035 photo derivatives (final validation)

Run the photo-only unit and PostgreSQL integration suite from the repository root. It uses the existing validation lab, verified ClamAV signature snapshot, and permitted corpus inputs; use a new evidence directory for each run.

```powershell
$photoEvidence = ".\infra\validation\media-inspection\evidence\photo-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -PhotosOnly -Build -EvidenceDirectory $photoEvidence
```

The implementer's focused run passed **60/60 tests**. The independent tester's final combined media-inspection, quarantine, and photo-derivative regression passed **139/139 tests**; the aggregate result retains its primary `ticket` marker `EL-TK-033` and does not relabel that historical field. The separate independent EL-TK-056 regression passed **21/21**. Typecheck, build, migration assembly/repeat application, and final source verification passed: all 14 workspace source files matched, and all 12 embedded files matched the validation image.

Evidence: [focused photo run](evidence/photo-buffer-validation/), [combined independent run](evidence/photo-independent-final/), [EL-TK-056 regression](../media-execution/evidence/photo-independent-final/), [source manifest](evidence/photo-final-source/source-manifest.json), and [source/image verification](evidence/photo-final-source/verification.json). The source manifest covers the final implementation; historical corpus and physical-result files were not regenerated.

The operation stores only private, verified candidates and does not publish them or complete the processing job. Durable production `RecoveryAuthority` and object-storage adapters, worker composition, and observer wiring remain future integration work. No object-storage provider was selected. MEDIA-001, CAP-001, DR-001, and EXPORT-001 remain `NOT_EVALUATED`.

## Video derivatives (EL-TK-036)

Run the focused video unit and PostgreSQL/MinIO integration suite from the repository root, using a new evidence directory:

```powershell
$videoEvidence = ".\infra\validation\media-inspection\evidence\video-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -VideosOnly -Build -EvidenceDirectory $videoEvidence
```

Omit `-VideosOnly` to run the combined inspection, quarantine, photo and video suites. The harness applies migrations twice and checks build and typecheck. The video scope includes MP4/MOV/WebM, representative silent codecs, rotation and pixel aspect ratio, original integrity, safe metadata handling, strict output validation, replay/rollback, stale authority and partial or unknown writes. Video output is always transcoded to the adopted target; stream-copy/remux is not implemented. Rotation and pixel aspect ratio are normalized to the adopted output, including TV-range output; this does not certify universal HDR handling. The run uses laboratory adapters and preserves the historical corpus and physical results. It does not certify maximum-size throughput, physical playback of generated implementation outputs, or any Beta validation gate.

### EL-TK-036 final validation

The focused video run passed **60/60 tests**. The independent combined inspection, quarantine, photo and video regression passed **199/199**; its result keeps the primary ticket marker `EL-TK-033` and is not relabeled as a video-only run. The EL-TK-056 runtime regression passed **21/21**. Typecheck/build, repeat migration application, and final integrity checks passed: **18/18 source hashes** matched, the recorded and actual validation-image digests matched (`c47c90d934e33a7eb06d51542e6bbe577efe7be906a7c68ded8205309c7bdba4`), and the common migration assembly contained **9 unique migrations** with matching source/copy hashes.

Evidence: [focused video run](evidence/video-focused-final/), [combined independent run](evidence/video-independent-final-3/), [EL-TK-056 runtime regression](../media-execution/evidence/video-independent-regression/), and [integrity verification](evidence/video-independent-final-3/integrity-check.json). These implementation results do not pass MEDIA-001, CAP-001, DR-001 or EXPORT-001, which remain `NOT_EVALUATED`. Maximum-size throughput and production composition remain outside this validation; the definitive Beta/production object-storage provider remains `DEFERRED`.

## EL-TK-037 successful processing (final validation)

Run the focused successful-processing unit and PostgreSQL integration suite from the repository root:

```powershell
$successEvidence = ".\infra\validation\media-inspection\evidence\success-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -SuccessOnly -Build -EvidenceDirectory $successEvidence
```

Omit `-SuccessOnly` to run the entire media-inspection suite (inspection, quarantine, photo, video, and successful processing).

### EL-TK-037 final validation

The focused successful processing run passed **63/63 tests** (55 PostgreSQL integration tests and 8 unit tests). The combined independent media-inspection regression passed **262/262 tests**, and the independent EL-TK-056 runtime regression passed **21/21 tests**. Typecheck, build, and repeat migration application passed.

Evidence: [focused run](evidence/success-focused-final/), [combined independent regression](evidence/success-combined-regression/), and [EL-TK-056 runtime regression](../media-execution/evidence/success-independent-regression/).

Coverage includes atomic CAS promotion to `PUBLISHED` (`AUTO`) or `PENDING_REVIEW` (`PRE_REVIEW`), governance revision reload without terminal failure (DEC-087), fail-closed protection against later restrictive states (`HIDDEN`, `TRASHED`, `DELETED`, `QUARANTINED`, `REJECTED`, `PROCESSING_FAILED`), idempotent ACK replay, strict coordinated parent admission locks, and zero partial owner effects on lease loss or failure. MEDIA-001, CAP-001, DR-001, and EXPORT-001 remain `NOT_EVALUATED`.

### Running focused transient retry tests (EL-TK-038)

```powershell
$retryEvidence = ".\infra\validation\media-inspection\evidence\retry-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -RetryOnly -Build -EvidenceDirectory $retryEvidence
```

Omit `-RetryOnly` to run the entire media-inspection suite (inspection, quarantine, photo, video, successful processing, and transient retry).

### EL-TK-038 transient retry and lease recovery final validation

The focused retry suite passed **20/20 tests** (13 PostgreSQL integration tests and 7 unit tests). The combined media-inspection regression passed **282/282 tests** across 12 test files, and the independent EL-TK-056 runtime regression passed **21/21 tests**. Typecheck, build, and migration application passed.

Evidence: [focused run](evidence/retry-focused-final/), [combined independent regression](evidence/retry-combined-regression/), and [EL-TK-056 runtime regression](../media-execution/evidence/retry-independent-regression/).

Coverage includes:
1. Exact retry budget of 3 total attempts (including initial).
2. Transient error classification with exponential backoff delay clamping and credential/path sanitization in audit logs.
3. Transition to `DEAD` upon exhaustion of attempt 3 without scheduling a 4th attempt.
4. Retention of original media bytes and no mutation of non-processing states (`QUARANTINED`, `PUBLISHED`, `TRASHED`, `DELETED`, `REJECTED`).
5. `recoverExpiredLeases` with atomic CAS advancing abandoned leases to `RETRYING` or `DEAD` and incrementing fence, enforcing `LEASE_LOST` on stale workers attempting late completion.
6. Idempotent replay returning `ALREADY_COMMITTED` for identical operationIds and `IDEMPOTENCY_CONFLICT` for conflicting payloads.

### Running focused terminal failure tests (EL-TK-039)

```powershell
$termEvidence = ".\infra\validation\media-inspection\evidence\terminal-failure-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -TerminalFailureOnly -Build -EvidenceDirectory $termEvidence
```

Omit `-TerminalFailureOnly` to run the entire media-inspection suite (all 14 test files).

### EL-TK-039 terminal failure and download eligibility final validation

The focused terminal failure suite passed **18/18 tests** (14 PostgreSQL integration tests and 4 unit tests). The combined media-inspection regression passed **300/300 tests** across 14 test files, and the independent EL-TK-056 runtime regression passed **21/21 tests**. Typecheck, build, and migration application passed.

Evidence: [focused run](evidence/terminal-failure-focused-final/), [combined independent regression](evidence/terminal-failure-combined-regression/), and [EL-TK-056 runtime regression](../media-execution/evidence/terminal-failure-independent-regression/).

Coverage includes:
1. Transition of media to `PROCESSING_FAILED` and job to `DEAD` upon budget exhaustion (`BUDGET_EXHAUSTED`) or non-transient error (`TERMINAL_TECHNICAL_ERROR`), with revision increment and original bytes intact.
2. DEC-075 download eligibility evaluation: strictly `true` if and only if the safety fact is completely `APPROVED`. Inconclusive, denied/quarantined, or pending safety inspections yield `downloadEligible: false`.
3. Non-destructive terminal state preservation: fail-closed CAS never overwrites restrictive or completed media states (`QUARANTINED`, `PUBLISHED`, `PENDING_REVIEW`, `HIDDEN`, `TRASHED`, `DELETED`, `REJECTED`).
4. Idempotent replay returning `ALREADY_COMMITTED` for identical operationIds and `IDEMPOTENCY_CONFLICT` for conflicting payloads.
5. Complete transaction rollback on repository persistence failure, preserving original and job state without partial mutations.

### Running focused retry cycle tests (EL-TK-040)

```powershell
$cycleEvidence = ".\infra\validation\media-inspection\evidence\cycle-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -CycleOnly -Build -EvidenceDirectory $cycleEvidence
```

Omit `-CycleOnly` to run the entire media-inspection suite (all 16 test files).

### EL-TK-040 retry cycle requesting and routing final validation

The focused retry cycle suite passed **16/16 tests** (13 PostgreSQL integration tests and 3 unit tests). The combined media-inspection regression passed **316/316 tests** across 16 test files, and the independent EL-TK-056 runtime regression passed **21/21 tests**. Typecheck, build, and migration application passed.

Evidence: [focused run](evidence/cycle-focused-final/), [combined independent regression](evidence/cycle-combined-regression/), and [EL-TK-056 runtime regression](../media-execution/evidence/cycle-independent-regression/).

Coverage includes:
1. Authorized organizer request for a new processing cycle for media in technical `PROCESSING_FAILED` state.
2. DEC-076 dynamic job routing: enqueues `MEDIA_INSPECTION` if safety inspection was inconclusive/not `APPROVED`; enqueues derivative generation (`PHOTO_DERIVATIVES` or `VIDEO_DERIVATIVES`) if safety inspection was already `APPROVED`.
3. New cycle opens up to 3 total automatic attempts with `priority: 1`, `attempt: 0`.
4. Media remains in `PROCESSING_FAILED` upon cycle creation; the processing worker applies the transition to `PROCESSING` at reservation time. Original media bytes and historical facts are strictly preserved.
5. Idempotent replay and concurrent coordination: an active cycle (`ACTIVE` status with a non-terminal job) returns the existing cycle without duplicating jobs or resetting budget.
6. Fail-closed security denials: `QUARANTINED`, other states (`UPLOADED`, `PUBLISHED`, `TRASHED`, `DELETED`), barred events, or unauthorized organizers are rejected with durable audit logs and zero job enqueuing.

### Running focused media status and capabilities tests (EL-TK-053)

```powershell
$statusEvidence = ".\infra\validation\media-inspection\evidence\status-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
.\infra\validation\media-inspection\Run.ps1 -StatusOnly -Build -EvidenceDirectory $statusEvidence
```

Omit `-StatusOnly` to run the entire media-inspection suite (all 18 test files).

### EL-TK-053 media status and capabilities query final validation

The focused media status suite passed **15/15 tests** (7 PostgreSQL 16 integration tests and 8 unit tests). The combined media-inspection regression passed **331/331 tests** across 18 test files. Typecheck, build, and migration `202610110016_media_status_query` application passed.

Coverage includes:
1. Retrieval of media lifecycle status and observable sanitized progress (`phase`, `attempt`) without exposing admin error messages, stack traces, storage paths, credentials or execution tokens.
2. Independent evaluation of `canRetry` vs `canDownloadOriginal` (DEC-075):
   - `canRetry`: strictly `true` only for verified organizers when `status === 'PROCESSING_FAILED'`, not quarantined, and safety not denied. Guests never receive retry capability.
   - `canDownloadOriginal`: strictly `true` if and only if `safety.outcome === 'APPROVED'`. Inconclusive, denied, or pending safety states deny original download eligibility even if retry is allowed.
3. Strict guest isolation and non-enumeration: requests for nonexistent media, media in other events, or other guests' contributions in "Mis aportes" yield `MEDIA_NOT_FOUND` uniformly without leaking metadata.
4. Barrier enforcement: barred events reject queries (`BARRED_EVENT`), and unauthorized organizers are denied (`ACCESS_DENIED`).
5. Durable, sanitized query audit logging in PostgreSQL (`media_status_query_audit`).
