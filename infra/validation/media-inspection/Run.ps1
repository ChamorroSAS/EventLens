param([switch]$Build,[string]$EvidenceDirectory='',[switch]$QuarantineOnly,[switch]$PhotosOnly,[switch]$VideosOnly,[switch]$SuccessOnly,[switch]$RetryOnly,[switch]$TerminalFailureOnly)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$evidence=if($EvidenceDirectory){[IO.Path]::GetFullPath($EvidenceDirectory)}else{Join-Path $PSScriptRoot 'evidence'}
New-Item -ItemType Directory -Force $evidence | Out-Null
if($Build){docker build -f (Join-Path $PSScriptRoot 'Dockerfile') -t eventlens-media-inspection:validation $root;if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}}
$snapshots=Join-Path $PSScriptRoot '.local/signatures'
$snapshot=Get-ChildItem -LiteralPath $snapshots -Directory | Where-Object {Test-Path (Join-Path $_.FullName 'manifest.json')} | Sort-Object Name | Select-Object -Last 1
if(!$snapshot){throw 'OFFICIAL_SIGNATURE_SNAPSHOT_REQUIRED'}
$volume='eventlens-media-inspection-input-'+[guid]::NewGuid().ToString('N')
docker volume create --label eventlens.component=media-inspection $volume | Out-Null
$mountpoint=docker volume inspect $volume --format '{{.Mountpoint}}'
$secrets=Join-Path $root 'infra/spikes/.local/secrets'
$corpus=Join-Path $root 'infra/spikes/corpus'
$registered=Join-Path $root 'infra/spikes/.local/media-processing/registered.json'
$supplemental=Join-Path $root 'infra/spikes/.local/media-processing/supplemental/6e6fe5d6cd0a424199695ec4419f4124/inputs'
$dockerSignatures='/run/desktop/mnt/host/'+$snapshot.FullName.Substring(0,1).ToLowerInvariant()+$snapshot.FullName.Substring(2).Replace('\','/')
docker run --rm --network eventlens-spikes-059_lab --cpus 2 --memory 3g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --mount 'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock' --mount "type=volume,source=$volume,target=/inputs" --mount "type=bind,source=$($snapshot.FullName),target=/signatures,readonly" --mount "type=bind,source=$corpus,target=/corpus,readonly" --mount "type=bind,source=$secrets/pg_admin,target=/run/secrets/pg_admin,readonly" --mount "type=bind,source=$secrets/s3_lab_user,target=/run/secrets/s3_lab_user,readonly" --mount "type=bind,source=$secrets/s3_lab_password,target=/run/secrets/s3_lab_password,readonly" --mount "type=bind,source=$evidence,target=/evidence" --mount "type=bind,source=$registered,target=/registered.json,readonly" --mount "type=bind,source=$supplemental,target=/supplemental,readonly" --env "DOCKER_INPUT_ROOT=$mountpoint" --env "DOCKER_SIGNATURE_ROOT=$dockerSignatures" --env "MEDIA_TERMINAL_FAILURE_ONLY=$([int][bool]$TerminalFailureOnly)" --env "MEDIA_SUCCESS_ONLY=$([int][bool]$SuccessOnly)" --env "MEDIA_RETRY_ONLY=$([int][bool]$RetryOnly)" --env "MEDIA_QUARANTINE_ONLY=$([int][bool]$QuarantineOnly)" --env "MEDIA_VIDEOS_ONLY=$([int][bool]$VideosOnly)" --env "MEDIA_PHOTOS_ONLY=$([int][bool]$PhotosOnly)" eventlens-media-inspection:validation
if($LASTEXITCODE -ne 0){throw 'VALIDATION_FAILED'}
