param([switch]$Build,[string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$evidence=if($EvidenceDirectory){[IO.Path]::GetFullPath($EvidenceDirectory)}else{Join-Path $PSScriptRoot 'evidence'}
New-Item -ItemType Directory -Force $evidence | Out-Null
if($Build){docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t eventlens-identity:validation $root;if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}}
$secret=Join-Path $root 'infra/spikes/.local/secrets/pg_admin'
docker run --rm --network eventlens-spikes-059_lab --cpus 1 --memory 1g --pids-limit 128 --cap-drop ALL --security-opt no-new-privileges --mount "type=bind,source=$secret,target=/run/secrets/pg_admin,readonly" --mount "type=bind,source=$evidence,target=/evidence" eventlens-identity:validation
if($LASTEXITCODE -ne 0){throw 'VALIDATION_FAILED'}
