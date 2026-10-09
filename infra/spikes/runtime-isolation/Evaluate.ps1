$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$evidence=Join-Path $root 'evidence'
$runtime=Get-Content -Raw (Join-Path $evidence 'spike060-runtime.json')|ConvertFrom-Json
$integration=Get-Content -Raw (Join-Path $evidence 'spike060-integration.json')|ConvertFrom-Json
$scratch=Get-Content -Raw (Join-Path $evidence 'spike060-scratch.json')|ConvertFrom-Json
$checks=@()
function Check([string]$name,[bool]$passed,[object]$details){$script:checks+=@{name=$name;result=$(if($passed){'PASS'}else{'FAIL'});details=$details}}
foreach($case in $runtime.cases){
 $entries=@($case.log -split "`r?`n" |Where-Object{$_ -match '^\{' }|ForEach-Object{$_|ConvertFrom-Json});$entry=$entries[-1]
 switch($case.name){
  'boundaries'{Check $case.name ($entry.uid -eq 1000 -and $entry.denied.Count -eq 6 -and @($entry.denied|Where-Object{$_.path -eq '/home/node/escape' -and $_.code -eq 'EROFS'}).Count -eq 1 -and @($entry.denied|Where-Object{$_.path -eq '/inputs/manifest.json' -and $_.code -eq 'EROFS'}).Count -eq 1 -and $entry.inputSha256Before -eq $entry.inputSha256After -and $entry.network -eq 'ENETUNREACH' -and $entry.privilegeEscalation -eq 'EPERM' -and $entry.capabilities -eq '0000000000000000' -and $entry.noNewPrivileges -eq '1') $entry}
  'cpu'{
   $before=[regex]::Match($entry.before,'usage_usec (\d+)').Groups[1].Value -as [double];$after=[regex]::Match($entry.after,'usage_usec (\d+)').Groups[1].Value -as [double]
   $cpuRatio=($after-$before)/($entry.elapsedMs*1000)
   Check $case.name ($cpuRatio -le 0.65 -and $entry.after -match 'nr_throttled [1-9]') @{measuredCpuRatio=$cpuRatio;quotaCores=0.5;cgroupMemoryPeakBytes=$entry.peakMemoryBytes}
  }
  'memory'{Check $case.name ($case.oomKilled -and $case.exitCode -eq 137 -and $entry.peakMemoryBytes -le $case.memoryLimit) @{largestRecordedMemoryPeakBytes=$entry.peakMemoryBytes;kernelLimitBytes=$case.memoryLimit;oomKilled=$case.oomKilled;note='Final allocation triggers kernel OOM; sample before kill is the largest observed value, not exact terminal peak.'}}
  'scratch'{Check $case.name ($entry.code -eq 'ENOSPC' -and $entry.bytes -eq 16777216) $entry}
  'processes'{Check $case.name ($entry.rejected -gt 0 -and $entry.peak -le 32 -and $entry.events -match 'max [1-9]') $entry}
  'threads'{Check $case.name ($entry.rejected -gt 0 -and $entry.peak -le 32 -and -not $case.oomKilled) $entry}
  'headers'{Check $case.name (@($entry.results|Where-Object{$_.accepted -ne $_.valid}).Count -eq 0) @{scope='Synthetic pre-allocation pixel/stream budget guard only; actual codec inspection belongs to EL-TK-061';cases=$entry.results}}
  'descendants'{Check $case.name ($case.forcedStop -and -not $case.runningAfterStop -and $case.stopMs -lt 4000) @{stopMs=$case.stopMs;containerRunning=$case.runningAfterStop;descendantsStoppedWithContainer=$true}}
 }
}
Check 'live-scratch-and-crash-recovery' ($scratch.result -eq 'PASS' -and $scratch.cleanupConfirmed -and -not $scratch.crossAttemptReadable -and -not $scratch.recoveryAttemptSeesResidual) $scratch
foreach($case in $integration.cases){Check $case.name ($case.result -eq 'PASS') $case}
foreach($case in $runtime.cases){if($case.name -notin @('memory','descendants') -and $case.exitCode -ne 0){foreach($check in $checks){if($check.name -eq $case.name){$check.result='FAIL'}}}}
$expectedNames=@('boundaries','cpu','memory','scratch','processes','threads','headers','descendants','live-scratch-and-crash-recovery','lease-expired','lease-revoked','heartbeat-loss','cancel','generation-change','epoch-change','fence-change','db-loss','multipart-late-complete-and-abort','crash-recovery-durable-inventory','protected-original-active-preserved')
$actualNames=@($checks|ForEach-Object{$_.name})
$completeSet=($actualNames.Count -eq 20 -and @($actualNames|Select-Object -Unique).Count -eq 20 -and @($expectedNames|Where-Object{$_ -notin $actualNames}).Count -eq 0)
$failures=@($checks|Where-Object{$_.result -eq 'FAIL'})
$report=@{ticket='EL-TK-060';recordedAt=[DateTime]::UtcNow.ToString('o');EXPERIMENT_RESULT=$(if($completeSet -and $failures.Count -eq 0){'PASS'}else{'FAIL'});expectedChecks=20;completeUniqueCaseSet=$completeSet;executedChecks=$checks.Count;failedChecks=$failures.Count;checks=$checks;runtimeImage='eventlens-spikes-harness:059 (Node24.21.0/alpine3.23 pinned by EL-TK-059 Dockerfile)';postgres='PostgreSQL16.15';storage='Local MinIO2025-10-15 pinned source9e49d5e';recommendation='Recommend architect evaluate single-host Docker cgroup/private-tmpfs parser plus separate scoped trusted supervisor, database-clock authority detector, CAS and durable attempt inventory with adapter writer-drain evidence. This spike does not adopt a permanent production implementation.';limitations=@('Synthetic parser guards do not validate actual codecs; EL-TK-061 remains unexecuted.','MinIO-local semantics only; final provider requires adapter verification.','No validation gate CAP-001/DR-001/MEDIA-001/EXPORT-001 passed.','Resource/OOM terminal sampling is bounded and largest observed peak is recorded separately from kernel cap.');initialAttempt='spike060-integration-attempt1.json retains DB-handshake failure corrected for PowerShell UTF8 BOM';nextTicketExecuted=$false}
$report|ConvertTo-Json -Depth 18|Set-Content -Encoding UTF8 (Join-Path $evidence 'spike060-result.json')
Write-Output "EXPERIMENT_RESULT: $($report.EXPERIMENT_RESULT), checks: $($checks.Count), failed: $($failures.Count)"
