# VAL evidence template

## Outcome vocabulary

Canonical VAL outcomes are exactly: `PASS`, `FAIL`, and `INCONCLUSIVE`.

Checkpoint outcomes are exactly: `SUFFICIENT-FOR-GATE`, `INSUFFICIENT-FOR-GATE`, and `INCONCLUSIVE`.

A checkpoint suffix (for example, `@P0`) scopes evidence; it does not create a new VAL ID. Partial evidence never changes canonical status.

| Field | Record |
|---|---|
| VAL ID | Canonical VAL identifier |
| Checkpoint suffix | Optional scope only; no new VAL ID |
| Objective | What the evidence evaluates |
| Authority | Baseline source and section |
| Preconditions | Environment, inputs, and required controls |
| Procedure | Reproducible numbered steps or command reference |
| Expected observation | Approved observable result |
| Actual observation | Evidence-backed result, including limitations |
| Canonical VAL outcome | `PASS`, `FAIL`, or `INCONCLUSIVE` |
| Checkpoint outcome | `SUFFICIENT-FOR-GATE`, `INSUFFICIENT-FOR-GATE`, or `INCONCLUSIVE` |
| Evidence references | Immutable report, log, artifact, and hash references |
| Reviewer / human gate | Required reviewer and gate decision reference |
| Date | ISO 8601 date |

Do not infer a canonical outcome from incomplete, partial, or checkpoint-only evidence.
