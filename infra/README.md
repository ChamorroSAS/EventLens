# Infrastructure responsibilities

Long-lived infrastructure folders use technical responsibilities. Ticket IDs remain in traceability records and historical evidence.

| Previous path | Current path | Responsibility |
| --- | --- | --- |
| `infra/tk055` | `infra/validation/job-queue` | PostgreSQL job queue validation runner |
| `infra/spikes/spike060` | `infra/spikes/runtime-isolation` | Bounded runtime isolation and writer quiescence experiment |
| `infra/spikes/spike061` | `infra/spikes/media-processing` | Multimedia compatibility corpus harness and renditions experiment |
| `infra/spikes/.local/spike061` | `infra/spikes/.local/media-processing` | Private multimedia working state and preserved experimental data |

The private working directory was moved as a whole. No corpus, manifest, output, physical result, ID or hash was regenerated. It contains both current working state and historical data; these responsibilities were reported and were not split.

Historical JSON and log evidence retains its original bytes, recorded paths, image identities and source hash manifests. Interpret old filesystem paths using this mapping; they describe the original run and are not commands to execute today. Evidence directories such as `verification-spike060-baseline` remain traceability artifacts.

Current runners: [job queue](validation/job-queue/README.md), [runtime isolation](spikes/runtime-isolation/README.md), [media processing](spikes/media-processing/README.md), [shared media execution](validation/media-execution/README.md).

The adopted multimedia image tag/digest and existing laboratory Compose project/network/volumes are preserved. Renaming these live resources would be a separate migration. Experimental SQL table names, object prefixes and labels containing spike IDs remain scoped traceability identities, not repository implementation directories.

The existing preview was recreated as `eventlens-media-processing-preview` with the adopted image and read-only mounts at the new code/work paths. Its existing bindings (`127.0.0.1:19061` and `192.168.40.135:19061`) were retained; both returned HTTP 200 after the move. This checks preview availability, not physical playback compatibility.

Validation of the path refactor uses separate job queue evidence under `validation/job-queue/evidence/path-rename-validation/`, media unit tests without corpus regeneration, PowerShell parsing and Compose configuration checks. It does not replace prior experiment evidence or certify MEDIA-001, CAP-001, DR-001 or EXPORT-001.

Independent verification passed 25/25 PostgreSQL job-queue tests and 17/17 media tests, syntax checks for 8 PowerShell scripts and 16 Node files, and base/restore/runtime-isolation Compose configuration checks. Independent job-queue records are in `validation/job-queue/evidence/path-rename-independent/`. Review approved the final paths. The full isolation experiment was not rerun: its historical evidence is retained, and this path refactor does not reopen its result. The three known result hashes (isolation, media, physical report) were checked; no complete pre-move hash inventory was available.
