# SP-007 — S23 Formal Attempt 003 minimized evidence

This record is operational evidence and does not change a baseline or promote canonical `SP-007`/`VAL-001` status.

## Provenance and custody

- Source file: `sp007-s23-formal-attempt-003.json`
- Custody: human-side only; the raw file is not committed because its broad device diagnostics can contain information from unrelated applications
- Raw size: `8963470` bytes
- Raw SHA-256: `8dd6717c1513434d4a4af0f1553a71e6bd7c897510947c81c9dfd25ade71c216`
- Source head: `82878218cf432998bd6b9582ca0b3e88873c68e0`
- CI artifact: `10269505251`
- APK SHA-256: `5fd2ca6ebd7c1f75c4e662b1a66d48188bf039cad4b93bed23d66f219e354b69`
- Budget preregistration: `4f108a56d1b3553836eac65662d449809715ee87`
- Human review: `APPROVED-FOR-S23-LINE`

## Accepted S23-line result

| Criterion | Reviewed evidence |
|---|---:|
| Classification | `FORMAL_RUN_EVIDENCE_CANDIDATE` |
| Cold validity | 30/30 `COLD / MEASURED` |
| Warm validity | 30/30 `WARM / MEASURED` |
| Cold startup `TotalTime` p95 | 209 ms <= 600 ms |
| Warm startup `TotalTime` p95 | 131 ms <= 200 ms |
| Cold `TOTAL PSS` p95 | 107711 KB <= 133120 KB |
| Incremental crash checkpoints | 31 |
| Unique new process exits | 29 |
| Expected protocol exits | 29, all `reason=10 / PROTOCOL_FORCE_STOP` |
| Abnormal exits | 0 |
| Observed crashes | 0 |
| Runner criteria | `runnerCriteriaMet=true` |

Independent human audit accepted startup, PSS, warm behavior, and crash-free evidence only for the Samsung Galaxy S23 / Android 16 line and the preregistered release-harness scope. The zero-crash evidence blocker from Formal Attempt 002 is resolved by this attempt.

`SP-007` remains `IN-PROGRESS`, and canonical `VAL-001` remains `NOT-EXECUTED`, because the remaining device matrix and the other protocol portions are incomplete. iOS remains `BLOCKED`; no fallback is activated. Formal Attempt 004 is prohibited.
