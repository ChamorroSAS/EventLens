# Media acceptance validation

This Docker runner validates the `@eventlens/media-acceptance` package against an isolated PostgreSQL 16 database in the approved local validation lab. It does not upload media and does not require MinIO for EL-TK-032.

From the repository root, with the existing `eventlens-spikes-059_lab` network and PostgreSQL lab service healthy:

```powershell
.\infra\validation\media-acceptance\Run.ps1 -Build
```

`-Build` rebuilds the validation image. To reuse the existing image, omit it. `-EvidenceDirectory <path>` writes evidence to a caller-selected directory; without it, output goes to this runner's `evidence` directory. The runner mounts the lab's PostgreSQL admin secret read-only inside the trusted validation container and creates an isolated test database. Do not put secret values in commands or evidence.

The tests apply the JobQueue and media-acceptance migrations and cover transaction rollback, duplicate/concurrent confirmation, replay, stale authorization, bounded reconciliation, crash/recovery behavior, and unavailable PostgreSQL. They use synthetic records, not the physical media corpus. The lab services are not reset by this runner.

The independent EL-TK-032 result is [result.json](evidence/independent/result.json), with the test report in [tests.json](evidence/independent/tests.json). The run passed 26/26 tests against PostgreSQL 16. These results do not mark MEDIA-001, CAP-001, DR-001, or EXPORT-001 as PASS and do not establish operational PITR.
