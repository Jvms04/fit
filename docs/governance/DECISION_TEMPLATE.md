# Execution decision template

Use this template only to document an execution choice within approved authority. It rejects changes to Product, Architecture, Technical Architecture, Stack, or Implementation Plan authority; escalate such a proposed change instead of recording it here.

| Field | Record |
|---|---|
| Decision ID and title |  |
| Authority | Exact approved source and section authorizing execution |
| Context | Constraint or execution condition |
| Bounded choice | Choice strictly within the cited authority |
| Alternatives considered | Allowed execution alternatives and why they were not selected |
| Invariant / requirement impact | Affected IDs and confirmation that none is redefined |
| Validation | Required test, VAL, checkpoint, or review evidence |
| Rollback | Reversible action and evidence preservation plan |
| Evidence | Links or immutable references to produced evidence |
| Owner | Named accountable owner |
| Date | ISO 8601 date |
| Escalation trigger | Condition requiring central or human authority review |

**Authority guard:** if the requested outcome changes product scope, architecture, technical architecture, stack selection, or the implementation plan, stop and escalate; do not treat this template as approval.
