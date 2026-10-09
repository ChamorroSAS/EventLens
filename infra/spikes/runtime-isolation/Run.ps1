param()
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$image='eventlens-spikes-harness:059'
$project='eventlens-spikes-059'
$compose=Join-Path $root 'compose.yaml'
$overlay=Join-Path $PSScriptRoot 'compose.yaml'
$evidence=Join-Path $root 'evidence'
$records=@()
$pgId=(& docker compose --project-name $project --file $compose ps --quiet postgres).Trim()
$pgInspection=(& docker inspect $pgId | ConvertFrom-Json)[0]
if($pgInspection.Config.Labels.'com.docker.compose.project' -ne $project){throw 'Invalid laboratory target'}
function InvokeLabDocker([string[]]$Arguments){$result=& docker @Arguments;if($LASTEXITCODE -ne 0){throw 'Bounded laboratory Docker operation failed'};return $result}
foreach($mode in @('boundaries','cpu','memory','scratch','processes','threads','headers','descendants')){
 $name='el060-'+$mode+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
 $memory=if($mode -eq 'threads'){'512m'}else{'128m'};$arguments=@('run','--detach','--name',$name,'--label','eventlens.spike=060','--init','--user','1000:1000','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','32','--cpus','0.5','--memory',$memory,'--memory-swap',$memory,'--tmpfs','/scratch:size=16m,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:size=8m,uid=1000,gid=1000,mode=0700','--mount',"type=bind,source=$PSScriptRoot,target=/lab/runtime-isolation,readonly",'--mount',"type=bind,source=$(Join-Path $root 'corpus'),target=/inputs,readonly",$image,'node','runtime-isolation/fixture.mjs',$mode)
 try{
  $id=(InvokeLabDocker $arguments).Trim();$start=[DateTime]::UtcNow;$peakMemory='';$peakPids=0;$forced=$false;$stopMs=$null
  do{
   $info=(& docker inspect $id | ConvertFrom-Json)[0]
   if(-not $info.State.Running){break}
   $stat=& docker stats --no-stream --format '{{json .}}' $id
   if($stat){$s=$stat|ConvertFrom-Json;$peakPids=[Math]::Max($peakPids,[int]$s.PIDs);$peakMemory=$s.MemUsage}
   if(([DateTime]::UtcNow-$start).TotalSeconds -gt 8 -or ($mode -eq 'descendants' -and ([DateTime]::UtcNow-$start).TotalSeconds -gt 2)){
    $stopStart=[DateTime]::UtcNow;InvokeLabDocker @('kill',$id)|Out-Null;$forced=$true;$stopMs=([DateTime]::UtcNow-$stopStart).TotalMilliseconds;break
   }
   Start-Sleep -Milliseconds 100
  }while($true)
  $info=(& docker inspect $id | ConvertFrom-Json)[0];if($forced){$stopMs=([DateTime]::UtcNow-$stopStart).TotalMilliseconds};$logs=(& docker logs $id 2>&1 | Out-String).Trim()
  $record=@{name=$mode;exitCode=$info.State.ExitCode;oomKilled=$info.State.OOMKilled;forcedStop=$forced;stopMs=$stopMs;runningAfterStop=$info.State.Running;observedSampleMaxPids=$peakPids;lastObservedMemory=$peakMemory;memoryLimit=$info.HostConfig.Memory;cpuNano=$info.HostConfig.NanoCpus;pidsLimit=$info.HostConfig.PidsLimit;log=$logs;elapsedMs=([DateTime]::UtcNow-$start).TotalMilliseconds;mounts=@($info.Mounts|ForEach-Object{@{target=$_.Destination;rw=$_.RW}})}
  $records+=$record;Write-Output "EL-TK-060 runtime case $mode completed (exit=$($info.State.ExitCode), OOM=$($info.State.OOMKilled))."
 }finally{if($id){& docker rm --force $id|Out-Null};$id=$null}
}
@{ticket='EL-TK-060';recordedAt=[DateTime]::UtcNow.ToString('o');dockerVersion=(& docker version --format '{{.Server.Version}}');cases=$records;limits=@{cpu=0.5;memoryBytesDefault=134217728;threadsMemoryBytes=536870912;pids=32;scratchBytes=16777216;wallDeadlineMs=8000;stopDeadlineMs=4000}}|ConvertTo-Json -Depth 12|Set-Content -Encoding UTF8 (Join-Path $evidence 'spike060-runtime.json')
$control=Join-Path $evidence 'spike060-control.json';$ack=Join-Path $evidence 'spike060-control-ack.json'
$container=$null;$paused=$false
foreach($path in @($control,$ack)){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path}}
try{
 $container=(InvokeLabDocker @('compose','--project-name',$project,'--file',$compose,'--file',$overlay,'run','--detach','harness')).Trim()
 $started=[DateTime]::UtcNow;$handledRun=$null
 do{
  $state=(& docker inspect $container|ConvertFrom-Json)[0].State
  if(-not $state.Running){break}
  if(Test-Path -LiteralPath $control){
   try{$request=Get-Content -Raw -LiteralPath $control|ConvertFrom-Json}catch{$request=$null}
   if($request -and $request.run -ne $handledRun){
    InvokeLabDocker @('pause',$pgId)|Out-Null;$paused=$true;$handledRun=$request.run
    @{run=$request.run;pausedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json|Set-Content -Encoding UTF8 $ack
    Start-Sleep -Milliseconds 1100;InvokeLabDocker @('unpause',$pgId)|Out-Null;$paused=$false
   }
  }
  if(([DateTime]::UtcNow-$started).TotalSeconds -gt 100){throw 'Integration spike exceeded bounded 100-second deadline'}
  Start-Sleep -Milliseconds 50
 }while($true)
 & docker logs $container
 if($state.ExitCode -ne 0){throw 'Integration spike process failed; sanitized details in evidence'}
}finally{
 if($paused){& docker unpause $pgId|Out-Null}
 if($container){& docker rm --force $container|Out-Null}
}
