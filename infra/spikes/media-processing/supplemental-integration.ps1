param([Parameter(Mandatory=$true)][string]$MediaDirectory,[Parameter(Mandatory=$true)][string]$BindingFile)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$media=(Resolve-Path -LiteralPath $MediaDirectory).Path
$allowed=[IO.Path]::GetFullPath((Join-Path $root '.local/media-processing'))+[IO.Path]::DirectorySeparatorChar
if(-not ($media+[IO.Path]::DirectorySeparatorChar).StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Media must be within private supplemental work'}
$binding=[IO.File]::ReadAllText((Resolve-Path -LiteralPath $BindingFile).Path,[Text.Encoding]::UTF8)|ConvertFrom-Json
if(-not $binding.caseId -or $binding.originalSha256 -notmatch '^[a-f0-9]{64}$' -or $binding.outputSha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid supplemental binding'}
$attempt=[guid]::NewGuid().ToString('N')
$state=Join-Path $root ('.local/media-processing/supplemental-integration/'+$attempt)
New-Item -ItemType Directory -Path $state -Force|Out-Null
[IO.File]::WriteAllText((Join-Path $state 'input.json'),($binding|ConvertTo-Json -Depth 20),[Text.UTF8Encoding]::new($false))
$imageId=(& docker image inspect --format '{{.Id}}' eventlens-spikes-harness:059).Trim()
if($LASTEXITCODE -ne 0 -or $imageId -notmatch '^sha256:[a-f0-9]{64}$'){throw 'Approved harness image unavailable'}
$overlay=Join-Path $state 'compose.yaml'
$yaml=@"
services:
  harness:
    image: $imageId
    volumes:
      - type: bind
        source: '$($PSScriptRoot.Replace('\','/'))'
        target: /lab/media-processing
        read_only: true
      - type: bind
        source: '$($media.Replace('\','/'))'
        target: /media
        read_only: true
      - type: bind
        source: '$($state.Replace('\','/'))'
        target: /state
    labels:
      eventlens.spike: '061-supplemental-integration'
    command: [node, media-processing/supplemental-integration.mjs]
"@
[IO.File]::WriteAllText($overlay,$yaml,[Text.UTF8Encoding]::new($false))
$container=$null
try{
 $container=(& docker compose --project-name eventlens-spikes-059 --file (Join-Path $root 'compose.yaml') --file $overlay run --detach --no-deps harness).Trim()
 if($LASTEXITCODE -ne 0 -or -not $container){throw 'Bounded laboratory integration startup failed'}
 $identity=(& docker inspect --format '{{json .Config.Labels}}' $container)|ConvertFrom-Json
 if($identity.'com.docker.compose.project' -ne 'eventlens-spikes-059' -or $identity.'eventlens.spike' -ne '061-supplemental-integration'){throw 'Unexpected laboratory identity'}
 $actualLimits=(& docker inspect --format '{{json .HostConfig}}' $container)|ConvertFrom-Json
 $mounts=(& docker inspect --format '{{json .Mounts}}' $container)|ConvertFrom-Json
 if(-not $actualLimits.ReadonlyRootfs -or $actualLimits.Memory -ne 536870912 -or $actualLimits.PidsLimit -ne 128 -or $actualLimits.NanoCpus -ne 1000000000 -or $actualLimits.CapDrop -notcontains 'ALL'){throw 'Unexpected trusted supervisor limits'}
 if(($mounts|Where-Object Destination -eq '/media').RW){throw 'Media must be read-only'}
 $started=[DateTime]::UtcNow
 do{
  $status=(& docker inspect --format '{{json .State}}' $container)|ConvertFrom-Json
  if(-not $status.Running){break}
  if(([DateTime]::UtcNow-$started).TotalSeconds -gt 90){throw 'Bounded integration deadline exceeded'}
  Start-Sleep -Milliseconds 200
 }while($true)
 & docker logs $container
 $result=Join-Path $state 'result.json'
 if(Test-Path -LiteralPath $result){
  $report=[IO.File]::ReadAllText($result,[Text.Encoding]::UTF8)|ConvertFrom-Json
  $runtime=@{imageId=$imageId;containerExitCode=$status.ExitCode;elapsedMs=([DateTime]::UtcNow-$started).TotalMilliseconds;project=$identity.'com.docker.compose.project';readOnlyRootfs=$actualLimits.ReadonlyRootfs;memoryBytes=$actualLimits.Memory;pidsLimit=$actualLimits.PidsLimit;cpuNano=$actualLimits.NanoCpus;capDrop=$actualLimits.CapDrop;securityOpt=$actualLimits.SecurityOpt;mounts=@($mounts|ForEach-Object{@{target=$_.Destination;rw=$_.RW}})}
  [IO.File]::WriteAllText((Join-Path $state 'runtime.json'),($runtime|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  $report|Add-Member -NotePropertyName runtime -NotePropertyValue $runtime
  [IO.File]::WriteAllText((Join-Path $root 'evidence/spike061-supplemental-integration.json'),($report|ConvertTo-Json -Depth 25),[Text.UTF8Encoding]::new($false))
 }
 if($status.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $result)){throw 'Integration incomplete; bounded attempt evidence retained'}
}finally{
 if($container){& docker rm --force $container|Out-Null}
}
