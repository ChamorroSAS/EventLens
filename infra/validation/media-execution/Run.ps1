param([switch]$Build,[string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$taskEvidence=if($EvidenceDirectory){[IO.Path]::GetFullPath($EvidenceDirectory)}else{Join-Path $PSScriptRoot 'evidence'}
New-Item -ItemType Directory -Force $taskEvidence | Out-Null
if($Build){docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t eventlens-media-execution:validation $taskRoot;if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}}
# A NEW ticket-scoped input volume, never previous lab data/corpus. Trusted supervisor
# needs Docker access; parser containers never receive this socket or any secret mount.
$taskVolume='eventlens-media-execution-input-'+[guid]::NewGuid().ToString('N')
docker volume create --label eventlens.component=media-execution $taskVolume | Out-Null
$taskMountpoint=docker volume inspect $taskVolume --format '{{.Mountpoint}}'
$taskSecretRoot=Join-Path $taskRoot 'infra/spikes/.local/secrets'
docker run --rm --network eventlens-spikes-059_lab --cpus 1 --memory 1g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --mount 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock' --mount "type=volume,source=$taskVolume,target=/inputs" --mount "type=bind,source=$taskSecretRoot/pg_admin,target=/run/secrets/pg_admin,readonly" --mount "type=bind,source=$taskSecretRoot/s3_lab_user,target=/run/secrets/s3_lab_user,readonly" --mount "type=bind,source=$taskSecretRoot/s3_lab_password,target=/run/secrets/s3_lab_password,readonly" --mount "type=bind,source=$taskEvidence,target=/evidence" --env "DOCKER_INPUT_ROOT=$taskMountpoint" eventlens-media-execution:validation
if($LASTEXITCODE -ne 0){throw 'VALIDATION_FAILED'}
# Container and input inventory deliberately retained for057; no unverified deletion.
