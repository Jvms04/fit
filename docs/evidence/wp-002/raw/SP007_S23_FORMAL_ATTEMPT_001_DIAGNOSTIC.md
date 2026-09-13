# SP-007 S23 formal attempt 001 — aborted diagnostic

- Date: 2026-09-11
- Human audit disposition: `FORMAL EXECUTION NOT APPROVED`
- Classification: `ABORTED_DIAGNOSTIC`
- Formal validation: false
- Characterization evidence: false
- Harness head: `27b41f66bb44137978cb972a506f3d941f140f3e`
- CI artifact: `10179821471`
- Runner exit code: 2
- Fallback authorized: false

## Raw-artifact custody

The immutable original remains on the human Windows executor as `C:\fit-local\sp007-s23-formal-30.json` and must not be overwritten or reused as a later attempt. The previously observed file size is 449421 bytes. Its bytes and SHA-256 were not supplied to this workspace, so this repository does not fabricate a copy or claim a hash. Ingestion of the original, if later requested, must preserve its bytes and add independently verified provenance.

## Audited observations

| Field | Observed value |
|---|---:|
| Completed cold | 30 |
| Completed warm | 30 |
| Interruption | `null` |
| Abnormal process exits | 0 |
| Valid cold samples | 30/30 |
| Cold startup `TotalTime` p95 | 193 ms |
| Cold startup budget | 600 ms |
| Cold `TOTAL PSS` p95 | 62159 KB |
| Cold `TOTAL PSS` budget | 133120 KB |
| Valid warm samples | 0/30 |
| Warm classification | 30/30 `NOT_A_LAUNCH_EVENT` |
| Warm `LaunchState` | 30/30 `UNKNOWN (0)` |
| Warm `TotalTime` | 30/30 `0` |
| Warm Android warning | `Activity not started, intent has been delivered to currently running top-most instance.` |

## Interpretation

The cold samples remain part of this diagnostic attempt and must not be discarded. The warm set is invalid and has no warm p95, so the attempt is not a warm-budget failure. It is not evidence of structural stack failure and authorizes no fallback. `SP-007` remains `IN-PROGRESS`; `VAL-001`, `VAL-003`, `VAL-004`, `VAL-006`, and `VAL-025` remain `NOT-EXECUTED`.

The runner issued `KEYCODE_BACK` but did not verify that the probe Activity had left the top/resumed state before invoking `am start -W`. Android therefore redelivered the intent to the already top-most Activity instead of producing a warm launch event. The corrective runner keeps `KEYCODE_BACK` and requires an observable top/resumed transition while the probe process remains alive, including an uncounted warm preflight, before any formal warm launch is requested.
