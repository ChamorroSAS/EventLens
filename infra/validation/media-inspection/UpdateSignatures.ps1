[CmdletBinding()]
param(
    [string]$ReuseSnapshotPath,
    [string]$AcquisitionStage,
    [ValidateRange(1, 168)][int]$MaximumDailyAgeHours = 72,
    [ValidateRange(30, 900)][int]$UpdaterTimeoutSeconds = 300,
    [ValidateRange(30, 300)][int]$VerificationTimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$imageDigest = 'sha256:58d9b21b5694a1f5b3a136e4f2e4fc6b463fce88635737e16f8cb9ee9455a199'
$image = "clamav/clamav:1.4.6_base@$imageDigest"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.local/signatures'))
$evidencePath = Join-Path $PSScriptRoot 'evidence/signature-acquisition.json'
$utf8 = [Text.UTF8Encoding]::new($false)
$clock = [Diagnostics.Stopwatch]::StartNew()
$mode = 'freshclam'

function Assert-LocalPath([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path)
    if (-not $absolute.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Signature path must be beneath the local signature root.'
    }
    $cursor = $absolute
    while ($cursor -and $cursor.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Signature paths cannot contain reparse points.'
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $absolute
}

function Write-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 8) + "`n", $utf8)
}

function Invoke-CheckedDocker([string[]]$DockerArguments) {
    $output = @(& docker @DockerArguments 2>&1)
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        # Raw updater/scanner output is kept away from shared evidence/logs.
        $category = if (($output -join "`n") -match '(403|429|Forbidden|cool.?down)') { 'OFFICIAL_SOURCE_REJECTED' } else { 'DOCKER_OR_ENGINE_FAILURE' }
        throw "${category}: container command exited $code. No snapshot was published."
    }
    return ($output | ForEach-Object { $_.ToString() })
}

function Run-Engine([string]$Directory, [string[]]$Command, [int]$TimeoutSeconds, [switch]$Updater) {
    $mount = "type=bind,source=$Directory,target=/data"
    $network = 'bridge'
    $memory = '1536m'
    if (-not $Updater) { $mount += ',readonly'; $network = 'none'; $memory = '3072m' }
    $arguments = @('run', '--rm', '--read-only', '--network', $network,
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '100:101',
        '--memory', $memory, '--cpus', '2', '--pids-limit', '64',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m', '--mount', $mount,
        '--entrypoint', '/bin/busybox', $image, 'timeout', '-s', 'KILL', "$TimeoutSeconds") + $Command
    return Invoke-CheckedDocker $arguments
}

New-Item -ItemType Directory -Force -Path $root, (Split-Path $evidencePath) | Out-Null
try {
    $imageId = (Invoke-CheckedDocker @('image', 'inspect', $image, '--format', '{{.Id}}')).Trim()
    $version = (Invoke-CheckedDocker @('run', '--rm', '--network', 'none', '--read-only',
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '100:101',
        '--memory', '256m', '--cpus', '1', '--pids-limit', '32', '--entrypoint', '/usr/bin/clamscan', $image, '--version')).Trim()
    if ($version -ne 'ClamAV 1.4.6') { throw 'Unexpected engine version.' }
    $acquiredAt = [DateTimeOffset]::UtcNow.ToString('o')
    $prior = $null
    if ($ReuseSnapshotPath) {
        $mode = 'snapshot-reverification'
        $stage = Assert-LocalPath $ReuseSnapshotPath
        $prior = Get-Content -LiteralPath (Join-Path $stage 'manifest.json') -Raw | ConvertFrom-Json
        if ($prior.schemaVersion -ne 1 -or $prior.engineVersion -ne '1.4.6' -or $prior.sourceImageDigest -ne $imageDigest -or $prior.authenticityVerified -ne $true) {
            throw 'Snapshot manifest is incompatible.'
        }
        $acquiredAt = $prior.acquiredAtUTC
    } elseif ($AcquisitionStage) {
        # Only for an already completed official FreshClam run; signed CVDs are fully reverified.
        $mode = 'completed-acquisition-verification'
        $stage = Assert-LocalPath $AcquisitionStage
    } else {
        $stage = Assert-LocalPath (Join-Path $root ('staging-' + [Guid]::NewGuid().ToString('N')))
        New-Item -ItemType Directory -Path $stage | Out-Null
        $config = @('DatabaseDirectory /data', 'DatabaseOwner clamav',
            'DatabaseMirror database.clamav.net', 'DNSDatabaseInfo current.cvd.clamav.net',
            'ScriptedUpdates no', 'Bytecode yes', 'TestDatabases yes',
            'MaxAttempts 1', 'ConnectTimeout 20', 'ReceiveTimeout 60') -join "`n"
        [IO.File]::WriteAllText((Join-Path $stage 'freshclam.conf'), $config + "`n", $utf8)
        $null = Run-Engine $stage @('/usr/bin/freshclam', '--config-file=/data/freshclam.conf', '--stdout') $UpdaterTimeoutSeconds -Updater
        $acquiredAt = [DateTimeOffset]::UtcNow.ToString('o')
    }

    $allowedFiles = @('bytecode.cvd', 'daily.cvd', 'main.cvd', 'freshclam.conf', 'freshclam.dat', 'manifest.json')
    foreach ($entry in Get-ChildItem -LiteralPath $stage -Force) {
        if ($entry.PSIsContainer -or $allowedFiles -notcontains $entry.Name) { throw 'Unexpected content in the official signature directory.' }
        $null = Assert-LocalPath $entry.FullName
    }
    $files = @()
    foreach ($name in @('bytecode.cvd', 'daily.cvd', 'main.cvd')) {
        $path = Join-Path $stage $name
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'An official CVD database is missing.' }
        $null = Assert-LocalPath $path
        $info = (Run-Engine $stage @('/usr/bin/sigtool', "--info=/data/$name") 60) -join "`n"
        if ($info -notmatch '(?m)^Verification OK\.$') { throw 'Official database digital signature verification failed.' }
        $build = [regex]::Match($info, '(?m)^Build time: (.+)$').Groups[1].Value
        # sigtool dates contain a numeric UTC offset without a colon.
        $build = $build -replace ' ([+-]\d{2})(\d{2})$', ' $1:$2'
        $builtAt = [DateTimeOffset]::ParseExact($build, 'dd MMM yyyy HH:mm zzz', [Globalization.CultureInfo]::InvariantCulture)
        $files += [ordered]@{
            name = $name
            sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
            sizeBytes = (Get-Item -LiteralPath $path).Length
            version = [int][regex]::Match($info, '(?m)^Version: (\d+)$').Groups[1].Value
            buildTimeUTC = $builtAt.ToUniversalTime().ToString('o')
            signatureCount = [int][regex]::Match($info, '(?m)^Signatures: (\d+)$').Groups[1].Value
        }
    }
    $daily = $files | Where-Object { $_.name -eq 'daily.cvd' }
    $dailyAge = ([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($daily.buildTimeUTC)).TotalHours
    if ($dailyAge -lt 0 -or $dailyAge -gt $MaximumDailyAgeHours) { throw 'Daily signature content is expired or future-dated.' }
    $canonical = ($files | ForEach-Object { "$($_.name):$($_.sha256):$($_.sizeBytes)`n" }) -join ''
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $snapshotId = ([BitConverter]::ToString($hasher.ComputeHash($utf8.GetBytes($canonical)))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose() }
    if ($prior) {
        if ($prior.snapshotId -ne $snapshotId -or $prior.files.Count -ne 3) { throw 'Snapshot identity changed.' }
        foreach ($file in $files) {
            $entry = @($prior.files | Where-Object { $_.name -eq $file.name })
            if ($entry.Count -ne 1 -or $entry[0].sha256 -ne $file.sha256 -or $entry[0].sizeBytes -ne $file.sizeBytes -or
                $entry[0].version -ne $file.version -or $entry[0].signatureCount -ne $file.signatureCount -or
                [DateTimeOffset]::Parse($entry[0].buildTimeUTC) -ne [DateTimeOffset]::Parse($file.buildTimeUTC)) { throw 'Snapshot manifest does not match signed content.' }
        }
    }
    # A nonempty trusted probe confirms full engine loading; no original is mounted.
    $probeCommand = @('/bin/sh', '-c', 'echo EventLens-signature-engine-load-verification >/tmp/probe.txt; exec /usr/bin/clamscan --database=/data --bytecode=yes /tmp/probe.txt')
    $load = (Run-Engine $stage $probeCommand $VerificationTimeoutSeconds) -join "`n"
    if ($load -notmatch '(?m)^Scanned files: 1$' -or $load -notmatch '(?m)^Infected files: 0$' -or $load -notmatch '(?m)^Known viruses: [1-9]\d*$') {
        throw 'Official snapshot engine-load verification was incomplete.'
    }
    foreach ($file in $files) {
        if ((Get-FileHash -LiteralPath (Join-Path $stage $file.name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
            throw 'Official database changed during engine-load verification.'
        }
    }
    $verifiedAt = [DateTimeOffset]::UtcNow.ToString('o')
    $manifest = [ordered]@{ schemaVersion = 1; engineVersion = '1.4.6'; sourceImageDigest = $imageDigest;
        snapshotId = $snapshotId; acquiredAtUTC = $acquiredAt; verifiedAtUTC = $verifiedAt;
        files = $files; authenticityVerified = $true }
    if ($prior) {
        $snapshot = $stage # Never rewrite an already published snapshot, including its manifest.
    } else {
        $snapshot = Assert-LocalPath (Join-Path $root $snapshotId)
        if (Test-Path -LiteralPath $snapshot) { throw 'Snapshot already exists; use -ReuseSnapshotPath to verify it without mutation.' }
        $publish = Assert-LocalPath (Join-Path $root ('publishing-' + [Guid]::NewGuid().ToString('N')))
        New-Item -ItemType Directory -Path $publish | Out-Null
        foreach ($file in $files) {
            $destination = Join-Path $publish $file.name
            Copy-Item -LiteralPath (Join-Path $stage $file.name) -Destination $destination
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) {
                throw 'Official database changed during snapshot publication.'
            }
        }
        Write-Json (Join-Path $publish 'manifest.json') $manifest
        foreach ($file in Get-ChildItem -LiteralPath $publish -File) { $file.IsReadOnly = $true }
        # Both resolved absolute paths were verified inside this workspace's signature root.
        $null = Assert-LocalPath $publish
        $null = Assert-LocalPath $snapshot
        Move-Item -LiteralPath $publish -Destination $snapshot
    }
    $clock.Stop()
    $evidence = [ordered]@{ schemaVersion = 1; status = 'OFFICIAL_SNAPSHOT_VERIFIED'; mode = $mode;
        engineVersion = '1.4.6'; sourceImageDigest = $imageDigest; localImageId = $imageId;
        snapshotId = $snapshotId; snapshotPath = $snapshot; verifiedAtUTC = $verifiedAt;
        dailyContentBuildTimeUTC = $daily.buildTimeUTC; dailyContentAgeHours = [Math]::Round($dailyAge, 3);
        maximumDailyAgeHours = $MaximumDailyAgeHours; authenticityVerified = $true; engineLoadVerified = $true;
        engineKnownViruses = [int][regex]::Match($load, '(?m)^Known viruses: (\d+)$').Groups[1].Value;
        engineLoadSeconds = [double]::Parse([regex]::Match($load, '(?m)^Time: ([\d.]+) sec').Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture);
        elapsedSeconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3);
        updater = @{ executedThisInvocation = ($mode -eq 'freshclam'); budgetSource = 'script_configuration'; memoryMiB = 1536; cpus = 2; pids = 64; scratchMiB = 64; timeoutSeconds = $UpdaterTimeoutSeconds; network = 'bridge' };
        verification = @{ memoryMiB = 3072; cpus = 2; pids = 64; scratchMiB = 64; timeoutSeconds = $VerificationTimeoutSeconds; network = 'none'; snapshotReadOnly = $true };
        files = $files }
    Write-Json $evidencePath $evidence
    Write-Output "Official snapshot verified: $snapshotId"
    Write-Output "Manifest: $(Join-Path $snapshot 'manifest.json')"
    Write-Output "Evidence: $evidencePath"
} catch {
    $clock.Stop()
    Write-Json $evidencePath ([ordered]@{ schemaVersion = 1; status = 'ACQUISITION_OR_VERIFICATION_FAILED';
        engineVersion = '1.4.6'; sourceImageDigest = $imageDigest; mode = $mode;
        observedAtUTC = [DateTimeOffset]::UtcNow.ToString('o'); authenticityVerified = $false;
        engineLoadVerified = $false; elapsedSeconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3);
        reason = $_.Exception.Message })
    throw
}
