param([switch]$Build,[string]$EvidenceDirectory='')
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if($EvidenceDirectory){throw 'CUSTOM_EVIDENCE_DIRECTORY_NOT_SUPPORTED: use infra/validation/identity/evidence'}
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'evidence') | Out-Null
$argsList=@('compose','-f',(Join-Path $root 'compose.test.yaml'),'up','--abort-on-container-exit','--exit-code-from','identity-validation')
if($Build){$argsList += '--build'}
$argsList += 'identity-validation'
docker @argsList
if($LASTEXITCODE -ne 0){throw 'VALIDATION_FAILED'}
