param(
  [Parameter(Mandatory=$true)][ValidateSet('init','build','start','validate','runtime','preview','stop','backup','restore','persistence','fault','record')][string]$Action,
  [ValidateSet('postgres','minio','runtime')][string]$Service='postgres',
  [ValidateSet('pause','unpause','stop','start')][string]$Fault='pause'
)
$ErrorActionPreference='Stop'
$labRoot = $PSScriptRoot
$composeFile = Join-Path $labRoot 'compose.yaml'
$project = 'eventlens-spikes-059'
$restoreProject = 'eventlens-spikes-059-restore'
function InvokeDocker([string[]]$DockerArgs) {
  & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw 'Scoped Docker command failed; inspect redacted local output.' }
}
function Compose([string[]]$ComposeArgs) { InvokeDocker (@('compose','--project-name',$project,'--file',$composeFile)+$ComposeArgs) }
function AssertLabContainer([string]$ContainerId) {
  $inspection = & docker inspect $ContainerId | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0 -or $inspection[0].Config.Labels.'com.docker.compose.project' -ne $project) { throw 'Container is outside the allowed lab project.' }
}
function ServiceId([string]$Name) {
  $id = & docker compose --project-name $project --file $composeFile ps --all --quiet $Name
  if ($LASTEXITCODE -ne 0 -or -not $id -or @($id).Count -ne 1) { throw 'Expected one scoped lab service.' }
  AssertLabContainer $id.Trim()
  return $id.Trim()
}
function InitLab {
  $secretDirectory = Join-Path $labRoot '.local/secrets'
  New-Item -ItemType Directory -Force -Path $secretDirectory,(Join-Path $labRoot 'evidence') | Out-Null
  foreach ($name in @('pg_admin','pg_lab','s3_root_user','s3_root_password','s3_lab_user','s3_lab_password')) {
    $path = Join-Path $secretDirectory $name
    if (-not (Test-Path -LiteralPath $path)) {
      $bytes = New-Object byte[] 32
      $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
      try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
      $value = [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
      [IO.File]::WriteAllText($path,$value,[Text.UTF8Encoding]::new($false))
    }
  }
  if ($env:OS -eq 'Windows_NT') {
    & icacls (Join-Path $labRoot '.local') /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local credentials directory.' }
  }
  Compose @('config','--quiet')
  Write-Output 'Private local credentials initialized without printing values.'
}
function StartLab {
  Compose @('up','--detach','--wait','postgres','minio')
  Compose @('run','--rm','provision')
}
function ValidateLab {
  Compose @('run','--rm','harness','pnpm','typecheck')
  Compose @('run','--rm','harness','pnpm','test')
  Compose @('run','--rm','--env','LAB_HOLD_SECONDS=0','runtime')
  Write-Output 'Basic capabilities checked; TB-01/TB-02 and operational gates remain NOT_EXECUTED.'
}
switch ($Action) {
 'init' { InitLab }
 'build' { Compose @('build','provision','minio') }
 'start' { InitLab; StartLab }
 'validate' { ValidateLab }
 'runtime' { Compose @('up','--detach','runtime') }
 'preview' { Compose @('up','--detach','preview'); Write-Output 'Desktop preparation preview: http://127.0.0.1:19059' }
 'stop' { Compose @('--profile','tools','--profile','runtime','--profile','preview','stop') }
 'record' {
   $records = foreach ($serviceName in @('postgres','minio','runtime','preview')) {
     $id=& docker compose --project-name $project --file $composeFile ps --all --quiet $serviceName
     if (-not $id) { continue }
     AssertLabContainer $id.Trim()
     $inspection=(& docker inspect $id.Trim() | ConvertFrom-Json)[0]
     @{service=$serviceName;image=$inspection.Config.Image;imageId=$inspection.Image;status=$inspection.State.Status;health=$inspection.State.Health.Status;memoryBytes=$inspection.HostConfig.Memory;nanoCpus=$inspection.HostConfig.NanoCpus;pidsLimit=$inspection.HostConfig.PidsLimit;networkMode=$inspection.HostConfig.NetworkMode;readOnly=$inspection.HostConfig.ReadonlyRootfs;user=$inspection.Config.User;capDrop=$inspection.HostConfig.CapDrop;securityOpt=$inspection.HostConfig.SecurityOpt;tmpfs=$inspection.HostConfig.Tmpfs;mounts=@($inspection.Mounts | ForEach-Object { @{type=$_.Type;name=$_.Name;target=$_.Destination;readWrite=$_.RW} })}
   }
   @{ticket='EL-TK-059';recordedAt=[DateTime]::UtcNow.ToString('o');dockerVersion=(& docker version --format '{{.Server.Version}}');composeVersion=(& docker compose version --short);services=@($records);isolationEffectiveness='NOT_EVALUATED';writerQuiescence='NOT_EVALUATED';operationalGates='NOT_EVALUATED'} | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 (Join-Path $labRoot 'evidence/runtime-configuration.json')
   Write-Output 'Sanitized effective resource/configuration evidence recorded.'
 }
 'persistence' {
   ValidateLab
   Compose @('up','--detach','--force-recreate','--wait','postgres','minio')
   Compose @('run','--rm','harness','node','src/persistence.mjs')
 }
 'fault' {
   $id=ServiceId $Service
   InvokeDocker @($Fault,$id)
   Write-Output "Scoped fault command $Fault applied to $Service. Not isolation/quiescence spike evidence."
 }
 'backup' {
   foreach ($writer in @('harness','provision')) {
     $active=@(& docker ps --quiet --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$writer")
     if ($active.Count -gt 0) { throw 'Stop lab harness/provision writers before taking the coordinated lab backup.' }
   }
   $backupDirectory=Join-Path $labRoot '.local/backup'
   New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
   $pg=ServiceId 'postgres'; $storage=ServiceId 'minio'
   InvokeDocker @('exec',$pg,'pg_dump','--username=lab_admin','--dbname=eventlens_lab','--format=custom','--file=/tmp/lab.dump')
   InvokeDocker @('cp',"${pg}:/tmp/lab.dump",(Join-Path $backupDirectory 'lab.dump'))
   InvokeDocker @('stop',$storage)
   try {
     InvokeDocker @('run','--rm','--network','none','--read-only','--volumes-from',"${storage}:ro",'--mount',"type=bind,source=$backupDirectory,target=/backup",'alpine:3.23.4@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11','tar','czf','/backup/minio.tgz','-C','/data','.')
   } finally { InvokeDocker @('start',$storage) }
   $files=@('lab.dump','minio.tgz') | ForEach-Object { @{name=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $backupDirectory $_) -Algorithm SHA256).Hash.ToLowerInvariant()} }
   @{ticket='EL-TK-059';recordedAt=[DateTime]::UtcNow.ToString('o');backupType='LOCAL_LAB_ONLY_NOT_PITR';files=$files} | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 (Join-Path $backupDirectory 'manifest.json')
   Write-Output 'Local consistent MinIO snapshot and PostgreSQL logical dump created. Not off-host/PITR compliance.'
 }
 'restore' {
   $backupDirectory=Join-Path $labRoot '.local/backup'
   $manifest=Get-Content -Raw -LiteralPath (Join-Path $backupDirectory 'manifest.json') | ConvertFrom-Json
   foreach ($file in $manifest.files) {
     if ($file.name -notin @('lab.dump','minio.tgz') -or (Get-FileHash -LiteralPath (Join-Path $backupDirectory $file.name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw 'Backup manifest mismatch.' }
   }
   $existing=& docker ps --all --quiet --filter "label=com.docker.compose.project=$restoreProject"
   if ($existing) { throw 'Restore namespace already exists. Refuse overwrite; retain it for inspection.' }
   $knownVolumes=@(& docker volume ls --format '{{.Name}}')
   foreach ($v in @("${restoreProject}_pg_restore","${restoreProject}_s3_restore")) {
     if ($knownVolumes -contains $v) { throw 'Restore target volume already exists. Refuse overwrite.' }
   }
   InvokeDocker @('compose','--project-name',$restoreProject,'--file',(Join-Path $labRoot 'compose.restore.yaml'),'create','postgres-restore','minio-restore')
   $restoreStorage=& docker compose --project-name $restoreProject --file (Join-Path $labRoot 'compose.restore.yaml') ps --all --quiet minio-restore
   InvokeDocker @('run','--rm','--network','none','--volumes-from',$restoreStorage.Trim(),'--mount',"type=bind,source=$backupDirectory,target=/backup,readonly",'alpine:3.23.4@sha256:5b10f432ef3da1b8d4c7eb6c487f2f5a8f096bc91145e68878dd4a5019afde11','tar','xzf','/backup/minio.tgz','-C','/data')
   InvokeDocker @('compose','--project-name',$restoreProject,'--file',(Join-Path $labRoot 'compose.restore.yaml'),'up','--detach','--wait','postgres-restore','minio-restore')
   $restorePg=& docker compose --project-name $restoreProject --file (Join-Path $labRoot 'compose.restore.yaml') ps --quiet postgres-restore
   InvokeDocker @('cp',(Join-Path $backupDirectory 'lab.dump'),"$($restorePg.Trim()):/tmp/lab.dump")
   InvokeDocker @('exec',$restorePg.Trim(),'psql','-U','lab_admin','-d','eventlens_lab','-c','CREATE ROLE lab_runner NOLOGIN')
   InvokeDocker @('exec',$restorePg.Trim(),'pg_restore','-U','lab_admin','-d','eventlens_lab','--exit-on-error','/tmp/lab.dump')
   InvokeDocker @('compose','--project-name',$restoreProject,'--file',(Join-Path $labRoot 'compose.restore.yaml'),'run','--rm','restore-check')
   Write-Output 'Restore verified in separate retained volumes and network. Not a PITR/DR gate result.'
 }
}
