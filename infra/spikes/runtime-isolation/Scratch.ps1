$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$names=@();$suffix=[guid]::NewGuid().ToString('N').Substring(0,8)
function RunScoped([string]$name,[string]$mode,[bool]$detach){
 $args=@('run','--name',$name,'--label','eventlens.spike=060','--init','--user','1000:1000','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','32','--cpus','0.5','--memory','128m','--memory-swap','128m','--tmpfs','/scratch:size=16m,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:size=8m,uid=1000,gid=1000,mode=0700','--mount',"type=bind,source=$PSScriptRoot,target=/lab/runtime-isolation,readonly")
 if($detach){$args+='--detach'};$args+=@('eventlens-spikes-harness:059','node','runtime-isolation/fixture.mjs',$mode)
 $result=& docker @args;if($LASTEXITCODE -ne 0){throw 'Scratch fixture failed'};return $result
}
try{
 $a='el060-scratch-a-'+$suffix;$names+=$a;RunScoped $a 'scratch-owner' $true|Out-Null
 Start-Sleep -Milliseconds 300
 $before=(& docker exec $a cat /scratch/private|Out-String).Trim();if($before -ne 'attempt-A'){throw 'First attempt marker absent'}
 $b='el060-scratch-b-'+$suffix;$names+=$b;$probe=(RunScoped $b 'scratch-probe' $false|Out-String).Trim()|ConvertFrom-Json
 $after=(& docker exec $a cat /scratch/private|Out-String).Trim();if($probe.otherAttemptReadable -or $after -ne 'attempt-A'){throw 'Cross-attempt scratch isolation failed'}
 & docker kill $a|Out-Null
 $info=(& docker inspect $a|ConvertFrom-Json)[0];if($info.State.Running){throw 'Scratch owner survived crash'}
 & docker rm $a|Out-Null;if($LASTEXITCODE -ne 0){throw 'Crashed scratch container removal failed'}
 $remaining=& docker container ls --all --filter "name=^/$a`$" --format '{{.ID}}';if($remaining){throw 'Crashed scratch container still exists'}
 $c='el060-scratch-c-'+$suffix;$names+=$c;$recovery=(RunScoped $c 'scratch-probe' $false|Out-String).Trim()|ConvertFrom-Json
 if($recovery.otherAttemptReadable){throw 'Scratch residual visible to recovery attempt'}
 foreach($name in @($b,$c)){& docker rm $name|Out-Null;if($LASTEXITCODE -ne 0){throw 'Scratch cleanup failed'};$remaining=& docker container ls --all --filter "name=^/$name`$" --format '{{.ID}}';if($remaining){throw 'Scratch container exists after cleanup'}}
 @{ticket='EL-TK-060';result='PASS';recordedAt=[DateTime]::UtcNow.ToString('o');liveAttemptA=$before;liveAttemptBAfterWrite=$probe.marker;attemptAUnchanged=$after;crossAttemptReadable=$probe.otherAttemptReadable;ownerKilled=$true;recoveryAttemptSeesResidual=$recovery.otherAttemptReadable;cleanupConfirmed=$true;removedContainers=$names;mechanism='Separate per-container private tmpfs; no shared scratch mount';recovery='Crash container removed and absence confirmed before PASS; new attempt scratch starts empty'}|ConvertTo-Json -Depth 5|Set-Content -Encoding UTF8 (Join-Path $root 'evidence/spike060-scratch.json')
}finally{foreach($name in $names){$remaining=& docker container ls --all --filter "name=^/$name`$" --format '{{.ID}}';if($remaining){& docker rm --force $name|Out-Null}}}
