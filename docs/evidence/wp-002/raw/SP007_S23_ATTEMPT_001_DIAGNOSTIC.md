# SP-007 / Galaxy S23 — aborted diagnostic attempt 001

- Evidence class: `HARNESS-DIAGNOSTIC`
- Eligible as SP-007 characterization: no
- Device: Samsung Galaxy S23
- OS: Android 16
- Harness head: `2678cd63c25a96f15a24927dfdecb31a82b09651`
- Attempt result file: `sp007-s23-initial.json`, 0 bytes, invalid and excluded
- Budgets applied/proposed: no/no

This record preserves the human-executed diagnostic evidence that exposed a measurement-harness defect. It is not a completed SP-007 device row and does not promote any VAL or checkpoint.

## Raw excerpts received

Manual cold launch:

```text
Status: ok
LaunchState: COLD
Activity: com.fit.wp002probe/.MainActivity
TotalTime: 289
WaitTime: 290
Complete
```

Isolated manual hot launch:

```text
LaunchState: HOT
TotalTime: 127
WaitTime: 130
```

Five paired diagnostic attempts:

```text
COLD 1: TotalTime 360 / WaitTime 361
WARM 1: LaunchState UNKNOWN (0) / WaitTime 23 / sem TotalTime

COLD 2: TotalTime 201 / WaitTime 206
WARM 2: LaunchState UNKNOWN (0) / WaitTime 19 / sem TotalTime

COLD 3: TotalTime 251 / WaitTime 253
WARM 3: LaunchState UNKNOWN (0) / WaitTime 19 / sem TotalTime

COLD 4: TotalTime 249 / WaitTime 251
WARM 4: LaunchState UNKNOWN (0) / WaitTime 27 / sem TotalTime

COLD 5: TotalTime 230 / WaitTime 233
WARM 5: LaunchState UNKNOWN (0) / WaitTime 18 / sem TotalTime
```

Runner termination:

```text
TypeError: samples must be a non-empty list of finite non-negative numbers
```

## Diagnostic classification

`UNKNOWN (0)` is classified as `NOT_A_LAUNCH_EVENT`. Its `WaitTime` remains raw command evidence and is not substituted for the absent `TotalTime`. The manual `HOT` observation is also diagnostic and cannot satisfy the baseline's warm-start sample.

The aborted attempt produced no valid characterization report. SP-007 remains `IN-PROGRESS`; budgets remain `NOT-PROPOSED`; VAL-001/003/004/006 and VAL-025 remain `NOT-EXECUTED`. No fallback is active.
