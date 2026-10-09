# Media execution validation harness

This harness validates EL-TK-056 against the local integrated lab. It uses synthetic ticket-scoped data; it does not regenerate or consume the EL-TK-061 physical corpus.

## Prerequisites

- The EL-TK-059 Docker lab is running and its PostgreSQL 16 and MinIO services are healthy.
- Docker is available to PowerShell, and the EL-TK-059 lab's local secret mounts expected by the script are present. The harness mounts them read-only and does not include their contents in evidence output.
- No host Node.js, pnpm, or installed workspace dependencies are required. `-Build` installs the pinned pnpm and workspace dependencies inside the Docker validation image; omitting it requires that image to have been built already.

## Run

From the repository root, build the validation image and run the suite:

```powershell
.\infra\validation\media-execution\Run.ps1 -Build
```

Omit `-Build` to use the already built `eventlens-media-execution:validation` image. The harness creates a unique test database and input volume for the run, applies both the EL-TK-055 and EL-TK-056 migrations twice to check repeat deployment, then runs package typecheck, build, public-import checks, and Vitest. It does not reset or restart the shared lab services. The input volume and database are retained for investigation; no cleanup/purge is performed by this script.

The trusted harness/supervisor has Docker control access for the test. Parser containers do not receive the Docker socket or lab credentials. Test evidence is written under `evidence/` (`result.json`, `tests.json`, runtime/fault records, and source-hash manifests).

The final independent run passed 21/21 tests. Resource values are test fixtures, not Beta sizing. This harness does not certify MEDIA-001, CAP-001, DR-001, or EXPORT-001, and it does not select a production object-storage provider. For the package contract and recovery limits, see [media-execution](../../../packages/media-execution/README.md) and the [completion record](../../../.codex/product/sessions/2026-10-09-el-tk-056-implementation.md).
