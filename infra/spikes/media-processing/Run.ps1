param([ValidateSet('build','generate','register','run','serve','validate-results','test','scale-smoke')][string]$Action='register',[string]$BindAddress='127.0.0.1')
$ErrorActionPreference='Stop';$root=Split-Path $PSScriptRoot -Parent;$work=Join-Path $root '.local/media-processing';$corpus=Join-Path $root 'corpus';$image='eventlens-spike061:preparation'
foreach($directory in @($work,(Join-Path $corpus 'generated'),(Join-Path $corpus 'physical/ios'),(Join-Path $corpus 'physical/android'))){New-Item -ItemType Directory -Force -Path $directory|Out-Null}
function InvokeLabDocker([string[]]$Arguments){& docker @Arguments;if($LASTEXITCODE -ne 0){throw 'EL-TK-061 bounded Docker operation failed'}}
if($Action -eq 'build'){InvokeLabDocker @('build','--file',(Join-Path $PSScriptRoot 'Dockerfile'),'--tag',$image,$root);exit}
$limits=@('--init','--user','1000:1000','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','64','--cpus','1','--memory','512m','--memory-swap','512m','--tmpfs','/scratch:size=128m,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:size=16m,uid=1000,gid=1000,mode=0700')
$base=@('run','--rm')+$limits+@('--mount',"type=bind,source=$PSScriptRoot,target=/code,readonly",'--mount',"type=bind,source=$work,target=/work")
if($Action -eq 'serve'){
 if($BindAddress -ne '127.0.0.1'){ $ip=$null;if(-not [Net.IPAddress]::TryParse($BindAddress,[ref]$ip) -or $ip.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $BindAddress -in @('0.0.0.0','255.255.255.255')){throw 'Use exact local IPv4 address; wildcard binding denied'};if(-not (Get-NetIPAddress -AddressFamily IPv4|Where-Object IPAddress -eq $BindAddress)){throw 'Address must belong to this computer'}}
 InvokeLabDocker ($base+@('--publish',"${BindAddress}:19061:8061",'--entrypoint','node',$image,'/code/server.mjs'));exit
}
if($Action -eq 'test'){InvokeLabDocker (@('run','--rm')+$limits+@('--network','none','--mount',"type=bind,source=$PSScriptRoot,target=/lab/media-processing,readonly",'--entrypoint','pnpm','eventlens-spikes-harness:059','exec','vitest','run','media-processing/core.test.mjs'));exit}
if($Action -eq 'run'){
 $attemptRecords=@();$registered=Get-Content -Raw (Join-Path $work 'registered.json')|ConvertFrom-Json;$execution=[guid]::NewGuid().ToString('N');$stageRoot=Join-Path $work ('staging/'+$execution);New-Item -ItemType Directory -Force $stageRoot|Out-Null
 $imageId=(& docker image inspect --format '{{.Id}}' $image).Trim();@{id=$imageId;tag=$image}|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $work 'image.json');$image=$imageId;$versions=(InvokeLabDocker (@('run','--rm')+$limits+@('--network','none','--mount',"type=bind,source=$PSScriptRoot,target=/code,readonly",'--entrypoint','node',$image,'/code/versions.mjs')))|ConvertFrom-Json;$versions|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $work 'versions.json')
 @{stagingBase='staging/'+$execution}|ConvertTo-Json|Set-Content -Encoding utf8 (Join-Path $work 'execution.json')
 foreach($case in $registered.cases){
  if($case.id -notmatch '^[A-Z0-9-]+-[a-f0-9]{12}$' -or $case.relativePath -match '(^/|\\|(^|/)\.\.(/|$))'){throw 'Unsafe corpus reference'}
  $inputPath=[IO.Path]::GetFullPath((Join-Path $corpus $case.relativePath));if(-not $inputPath.StartsWith($corpus+[IO.Path]::DirectorySeparatorChar)){throw 'Outside corpus'}
  $check=Get-Item -LiteralPath $inputPath;while($check.FullName -ne $corpus){if($check.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point denied'};$check=if($check -is [IO.DirectoryInfo]){$check.Parent}else{$check.Directory};if(-not $check){throw 'Invalid corpus containment'}}
  $dest=Join-Path $stageRoot $case.id;New-Item -ItemType Directory $dest|Out-Null;$name='el061-'+[guid]::NewGuid().ToString('N');$id=$null
  try{
   $expected=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($case.expected|ConvertTo-Json -Compress)))
   $id=(InvokeLabDocker (@('run','--detach','--name',$name,'--label','eventlens.spike=061')+$limits+@('--network','none','--mount',"type=bind,source=$PSScriptRoot,target=/code,readonly",'--mount',"type=bind,source=$inputPath,target=/input,readonly",'--entrypoint','node',$image,'/code/parser.mjs',$expected))).Trim()
   $start=[DateTime]::UtcNow;do{$state=(& docker inspect --format '{{json .State}}' $id|ConvertFrom-Json);if(-not $state.Running){throw 'Parser exited before evidence copied'};& docker exec $id test -f /scratch/result.json 2>$null;if($LASTEXITCODE -eq 0){break};if(([DateTime]::UtcNow-$start).TotalSeconds -gt 120){InvokeLabDocker @('kill',$id)|Out-Null;throw 'Parser attempt exceeded bounded 120 seconds'};Start-Sleep -Milliseconds 200}while($true)
   
   $bundle=(InvokeLabDocker @('exec',$id,'node','/code/export.mjs'))|ConvertFrom-Json;[IO.File]::WriteAllText((Join-Path $dest 'result.json'),($bundle.result|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)));foreach($property in $bundle.files.PSObject.Properties){if($property.Name -notin @('thumbnail.jpg','preview.jpg','playback.mp4')){throw 'Unsafe output name'};[IO.File]::WriteAllBytes((Join-Path $dest $property.Name),[Convert]::FromBase64String($property.Value))}
   $inspection=(& docker inspect $id|ConvertFrom-Json)[0];$attemptRecords+=@{caseId=$case.id;runtimeImage=$inspection.Image;memoryBytes=$inspection.HostConfig.Memory;cpuNano=$inspection.HostConfig.NanoCpus;pidsLimit=$inspection.HostConfig.PidsLimit;network=$inspection.HostConfig.NetworkMode;user=$inspection.Config.User;readOnlyRoot=$inspection.HostConfig.ReadonlyRootfs;capDrop=$inspection.HostConfig.CapDrop;securityOpt=$inspection.HostConfig.SecurityOpt;elapsedMs=([DateTime]::UtcNow-$start).TotalMilliseconds;mounts=@($inspection.Mounts|ForEach-Object{@{target=$_.Destination;rw=$_.RW}})};Write-Output "EL-TK-061 isolated case $($case.id) completed."
  }finally{if($id){& docker rm --force $id|Out-Null}}
 }
 $attemptRecords|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 (Join-Path $work 'attempts.json');InvokeLabDocker ($base+@('--network','none','--mount',"type=bind,source=$corpus,target=/corpus,readonly",$image,'finalize'));exit
}
$extra=if($Action -eq 'generate'){@('--mount',"type=bind,source=$(Join-Path $corpus 'generated'),target=/generated")}else{@()}
InvokeLabDocker ($base+@('--network','none','--mount',"type=bind,source=$corpus,target=/corpus,readonly")+$extra+@($image,$Action))
