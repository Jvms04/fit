[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDirectory,
  [string]$Output = "val0034-s23-report.json",
  [string]$Adb = "adb"
)

$ErrorActionPreference = "Stop"
$serial = $env:FIT_S23_ADB_SERIAL
if ([string]::IsNullOrWhiteSpace($serial)) {
  throw "FIT_S23_ADB_SERIAL must be set locally; it is never written to the report."
}

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$artifact = (Resolve-Path -LiteralPath $ArtifactDirectory).Path
$apk = Join-Path $artifact "app-release.apk"
$metadata = Join-Path $artifact "APK_PROVENANCE.json"
$runner = Join-Path $repo "tests/native/wp-002-mobile-harness/val0034/run-val0034-android.mjs"
if (-not (Test-Path -LiteralPath $apk) -or -not (Test-Path -LiteralPath $metadata)) {
  throw "Artifact directory must contain app-release.apk and APK_PROVENANCE.json."
}
if (-not (Test-Path -LiteralPath $runner)) {
  throw "VAL-003/004 Android runner is missing from the checkout."
}

# Always invoke Node explicitly; Windows must not execute an .mjs file as a binary.
& node $runner `
  --adb $Adb `
  --serial $serial `
  --repo-root $repo `
  --apk $apk `
  --apk-metadata $metadata `
  --output (Join-Path (Get-Location) $Output)
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "VAL-003/004 runner stopped with diagnostic exit code $exitCode; inspect the JSON report."
}
Write-Output "VAL-003/004 Android disposable report written to $(Join-Path (Get-Location) $Output)"
