# WP-002 disposable mobile harness

This directory is a G0 validation probe for Expo SDK 57 / React Native 0.86.3. It is not the Fit mobile scaffold and must not be promoted into `apps/mobile` by assumption.

The screen and data are synthetic. The harness enables SQLCipher through Expo prebuild, creates 1,000 deterministic non-personal rows, reports SQLite/SQLCipher versions and timing markers, and exposes a long list for device characterization.

The VAL-006 Hermes Android preparation also embeds byte-identical copies of the
approved five-vector corpus and IANA `2026c` rule-base. A release runtime logs
`[FIT_WP002_VAL006_HERMES]` only after Hermes and both asset hashes are checked.
That output remains a candidate for human review; it cannot promote VAL-006.
The assets are materialized from the locked dependency and canonical corpus by
`npm run prepare:val006-hermes`; the generated copies are intentionally untracked.

`Expo Go` is not valid evidence. Use a release prebuild on an explicitly selected physical device. The generated `android/` and `ios/` trees are disposable build outputs and remain ignored.

No numeric result is a budget until a human approves and preregisters that budget. The initial runner deliberately rejects the 30-run sample count reserved for the formal `VAL-001` protocol.

For the initial cold/warm characterization, the host runner uses `KEYCODE_BACK` before a requested warm relaunch and trusts the Android-reported launch state. Only `COLD`/`WARM` samples with `TotalTime` are eligible. `UNKNOWN (0)`, a different launch state, or missing `TotalTime` makes the attempt diagnostic-only; `WaitTime` remains raw and is never substituted.

The formal S23 runner is a separate executable at `../../performance/wp-002/formal-android.mjs`. It has a fixed 30 cold + 30 warm protocol and reads the approved budgets from preregistration commit `4f108a56d1b3553836eac65662d449809715ee87`; it does not accept a sample-count override. Before running it, check out the exact green preparation head and download that run's `wp-002-android-probe` artifact. The artifact contains the release APK, CI provenance, and checksums. The runner verifies the checked-out head, local APK, installed APK bytes, package, device row, and runtime dataset before the first sample. It then requires an uncounted warm preflight and verifies before every warm launch that `KEYCODE_BACK` has moved the probe Activity out of top/resumed state while its process remains alive. Failure produces partial `ABORTED_DIAGNOSTIC` evidence without issuing the corresponding warm `am start -W`.

After a human authorizes the exact head and CI artifact, compare the head, APK SHA-256/size, package, and metadata SHA-256 with the `WP-002 authorized APK` summary emitted by `android-probe-build`. Then run from the repository root in PowerShell. Replace the artifact path only with the directory downloaded from that authorized CI run. Preserve the exit status and write stdout as UTF-8 without a BOM:

```powershell
$artifactDir = Resolve-Path .\wp-002-android-probe
$apk = Join-Path $artifactDir "app-release.apk"
$metadata = Join-Path $artifactDir "APK_PROVENANCE.json"
$metadataRecord = Get-Content -Raw $metadata | ConvertFrom-Json
$localHash = (Get-FileHash -Algorithm SHA256 $apk).Hash.ToLowerInvariant()
$localSize = (Get-Item $apk).Length
$checkoutHead = (& git rev-parse HEAD).Trim().ToLowerInvariant()
if ($localHash -ne $metadataRecord.apk.sha256 -or $localSize -ne $metadataRecord.apk.sizeBytes) {
  throw "CI artifact APK hash/size verification failed"
}
if ($checkoutHead -ne $metadataRecord.source.headSha) {
  throw "checkout head does not match CI provenance"
}

& C:\platform-tools\adb.exe -s $env:FIT_S23_ADB_SERIAL install --replace $apk
if ($LASTEXITCODE -ne 0) { throw "APK installation failed" }

$reportLines = & node tests/performance/wp-002/formal-android.mjs `
  --adb C:\platform-tools\adb.exe `
  --serial $env:FIT_S23_ADB_SERIAL `
  --repo-root . `
  --preregistration-commit 4f108a56d1b3553836eac65662d449809715ee87 `
  --apk $apk `
  --apk-metadata $metadata
$runnerExit = $LASTEXITCODE
$reportText = ($reportLines -join [Environment]::NewLine) + [Environment]::NewLine
[IO.File]::WriteAllText(
  (Join-Path (Get-Location) "sp007-s23-formal-30.json"),
  $reportText,
  [Text.UTF8Encoding]::new($false)
)
Write-Host "formal runner exit code: $runnerExit"
exit $runnerExit
```

The preliminary checksum command is an operator check; the runner independently compares the CI metadata SHA-256/size to the local APK, pulls the installed `base.apk`, compares its bytes, and records every link in the JSON. If a link or an ADB command fails, stdout remains valid `ABORTED_DIAGNOSTIC` JSON and the process exits nonzero. An exit code does not promote `SP-007` or `VAL-001`. Preserve the output without editing and submit it for independent review. Query, scroll, kill/restart, and specific heap budgets remain `NOT-PROPOSED`; iOS remains `BLOCKED`.
