# EL-TK-059 — shared local spike environment

This directory is a standalone pnpm workspace for **laboratory tooling only**, not an Angular/NestJS bootstrap. It implements the first REQUIRED_FOR_SPIKES increment of TB-04 / EL-TD-008. All dependency installation/builds run inside Docker. No product schema, queue, multimedia adapters or production executor is implemented.

## Run from repository root (PowerShell)

```powershell
./infra/spikes/Lab.ps1 -Action init
./infra/spikes/Lab.ps1 -Action build
./infra/spikes/Lab.ps1 -Action start
./infra/spikes/Lab.ps1 -Action validate
./infra/spikes/Lab.ps1 -Action persistence
./infra/spikes/Lab.ps1 -Action runtime
./infra/spikes/Lab.ps1 -Action preview
./infra/spikes/Lab.ps1 -Action record
./infra/spikes/Lab.ps1 -Action backup
./infra/spikes/Lab.ps1 -Action restore
./infra/spikes/Lab.ps1 -Action stop
```

Docker Engine must be Linux and Compose available. Build downloads official images and source/dependencies. PostgreSQL is 16.15; Node 24.21.0; pnpm 10.30.3. Image manifests are pinned by digest. MinIO is built from the official security release commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a`; mc from `7394ce0dd2a80935aded936b09fa12cbb3cb8096`. Its source build follows [MinIO release guidance](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z), which patches the session-policy CVE. MinIO's repository is archived; this is the approved local candidate, not a claim of ongoing vendor maintenance or selection of production storage. Keep source/licensing information with distributed builds.

## Credentials and scope

`init` generates cryptographically random credentials only if absent in ignored `.local/secrets`; on Windows it restricts the directory ACL to the current user. Compose secret files are mounted only into services that need them. **Never commit `.local`, print full Compose config, environment/inspection, URLs with credentials, or raw SDK errors.** `.dockerignore` excludes credentials and private corpus from build contexts.

`provision` uses administration credentials once to establish a PostgreSQL role without superuser/role/database privileges and a MinIO user limited to `eventlens-lab/attempts/*`. Harness does not receive administration credentials or Docker socket. The separate foreign bucket and outside prefix exist only to check denial. Anonymous access stays disabled. Tests use harmless lab fixtures, not personal media. Re-running provision retains generated credentials; do not change credentials while retaining initialized volumes.

Services use the fixed `eventlens-spikes-059` namespace, named data volumes and an internal network. Only desktop preview `127.0.0.1:19059` is exposed, on a separate tool network. PostgreSQL and MinIO have no host ports and are accessed through the internal lab network. No public/LAN binding is created. SQL/storage have limits and health checks; parser candidate has nonroot UID, network `none`, dropped capabilities, no-new-privileges, read-only root, read-only corpus and 64 MiB private tmpfs scratch. These are **configured candidate controls, not proven isolation**. Limits are lab parameters, not product maxima or Beta capacity targets.

## Capabilities and controlled faults

Vitest verifies real commit/rollback, concurrent lab-only `SKIP LOCKED`, private/scoped IO, checksums/metadata, multipart complete/abort and confirmed Missing versus a real failed TCP connection classified Unknown. `persistence` recreates PostgreSQL/MinIO containers without deleting volumes and reads fixtures again. No production lease/fencing implementation is hidden in these tests.

```powershell
./infra/spikes/Lab.ps1 -Action fault -Service postgres -Fault pause
./infra/spikes/Lab.ps1 -Action fault -Service postgres -Fault unpause
```

Fault commands are allowlisted to PostgreSQL, MinIO or runtime, check the exact Compose project label, and target a single container. Always unpause/restart afterwards. They make subsequent experiments possible; no heartbeat-loss, stale-result or writer-quiescence PASS is claimed here. `record` captures effective limits and sanitized mounts, never secret environment values.

## Backup and isolated restore

Stop experiment/harness writers before `backup`. It creates a PostgreSQL custom logical dump and snapshots the entire MinIO data volume **while MinIO is stopped**; restart is guaranteed in `finally`. Backup checksums and binaries remain in ignored `.local/backup`. These backups include lab credentials/catalog and must be protected like secrets.

`restore` refuses existing target containers or named volumes, uses `eventlens-spikes-059-restore`, different volumes/network, no published ports, validates backup checksums, restores SQL and object data, and checks retained rows/byte-identical fixture. Targets are retained for inspection. Stop them explicitly with `docker compose --project-name eventlens-spikes-059-restore --file infra/spikes/compose.restore.yaml stop`; **never use `down --volumes` on user data**. Scripts do not delete volumes or existing resources.

This demonstrates **local logical/snapshot recoverability only**. Backups still need protected off-host copies and PITR/WAL, independent RecoveryAuthority and reconciliation for later integration/DR-001. It does not satisfy off-host backup, RPO/RTO, legal retention or production recovery requirements.

## Corpus, responsive preview and mobile evidence

`corpus/manifest.json` is a versioned preparation template with zero cases. Put permitted private files in ignored `corpus/private`; record hashes/provenance, expected/real MIME, orientation/audio/metadata/outcomes before EL-TK-061. Merely providing a file or device validates no format.

Desktop preview permits selecting a local file and observing browser rendering. It uploads nothing, creates no product UI and collects no evidence automatically. Chrome DevTools/Safari Responsive Design Mode support layout preparation only. User-confirmed physical iPhone/Android availability is recorded in EL-TK-061; both Chrome/Safari iOS use WebKit, Android Chrome supplies Blink. Physical format/codecs/playback evidence and complete corpus remain required for EL-TK-061, **not a blocker to preparing EL-TK-059**.

For EL-TK-035 validation, keep corpus originals read-only and private: `corpus/physical` and `corpus/generated` are ignored by Git and excluded from Docker build contexts. The versioned `corpus/manifest.json` records case definitions; private registrations and run evidence remain separate and must not contain source bytes or sensitive EXIF/GPS. Validation reads the approved original and records run/source hashes separately; it does not regenerate EL-TK-061 corpus or physical results.

The laboratory provisioner enables object versioning on the private `eventlens-lab` bucket. The runner gains only `GetObjectVersion` under `attempts/*`; bucket administration stays with provision. Rebuild and start the existing laboratory through `Lab.ps1 -Action build` and `Lab.ps1 -Action start` to reproduce this capability. Output verification reads actual stored bytes and records the returned version; this does not select a Beta/production storage provider.

## Readiness boundaries

REQUIRED_FOR_SPIKES: real PostgreSQL/storage, candidate isolation/scratch/fault controls, corpus manifest/timeline/evidence and desktop preparation preview delivered here. EL-TK-060 must independently execute and document isolation/quiescence; EL-TK-061 requires explicit 060 PASS and full per-case corpus/playback evidence.

REQUIRED_FOR_INTEGRATION: actual API/worker/scheduler, production adapters/queue, end-to-end metrics, restore/PITR plus independent RecoveryAuthority remain their existing owners. REQUIRED_FOR_BETA_GATE: CAP-001/DR-001/MEDIA-001/EXPORT-001 evidence remains outstanding. **No validation gate is PASS; TB-01/TB-02 are NOT_EXECUTED.**
