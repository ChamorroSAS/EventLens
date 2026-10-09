# EL-TK-055 validation runner

EL-TK-055 implements the reusable PostgreSQL-backed `@eventlens/job-queue` infrastructure package. Its integration suite exercises reservation, leases, fencing, authorization and atomic completion/retry behavior against a real PostgreSQL 16 laboratory database. See the [ticket](../../../.codex/product/tickets/EL-TK-055.md) and [package sources](../../../packages/job-queue/src/index.ts).

## Run the approved lab validation

From the repository root, run:

```powershell
./infra/validation/job-queue/Run.ps1
```

To rebuild the scoped validation image first:

```powershell
./infra/validation/job-queue/Run.ps1 -Build
```

The runner uses the PostgreSQL service in the approved EL-TK-059 Docker lab, creates an isolated database for the run, and writes its test and result records under `infra/validation/job-queue/evidence/`. The database connection secret is mounted read-only into the container; it is not a command-line argument. The runner expects the approved lab network and its PostgreSQL service to be available.

## Scope of the evidence

The final run passed 25/25 integration tests on PostgreSQL 16; the independent validation also passed migration, typecheck, build and package import checks. Recovery coverage is a semantic snapshot/counter-restoration simulation using independent test authority; it does not establish operational PITR. Physical media writer cancellation and drain belong to consumers EL-TK-056/057. MEDIA-001, CAP-001, DR-001 and EXPORT-001 remain NOT_EVALUATED.

For a fresh validation without overwriting the historical records, use:

```powershell
./infra/validation/job-queue/Run.ps1 -Build -EvidenceDirectory (Join-Path (Get-Location) 'infra/validation/job-queue/evidence/path-rename-validation')
```

The image is named `eventlens-job-queue:validation` and each new isolated database uses the semantic `job_queue_` prefix. Existing run IDs remain unchanged.
