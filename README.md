# Fit

## Repository state

This repository is in FIT Phase 7. `WP-001` is the only current scope: repository governance, ownership, decision templates, and the evidence index. It does not introduce application behavior.

## Authority hierarchy

1. Product baseline
2. Architecture baseline
3. Technical Architecture baseline
4. Stack baseline
5. Implementation Plan baseline

An execution artifact may clarify how an approved decision is carried out, but may not redefine an authority above it.

## Prohibitions

- Do not create a generic `shared` directory or package.
- Do not add application, service, domain, database, migration, infrastructure, UI, or Figma artifacts in `WP-001`.
- Do not copy the approved baseline sources into this repository; they are read-only.
- Do not commit credentials, secrets, PII, real health data, or realistic secret fixtures.
- Do not mark a work package or increment Done, or promote a VAL/checkpoint outcome.

See [baseline metadata](docs/baselines/MANIFEST.md), [repository boundaries](docs/governance/BOUNDARIES.md), and the [evidence index](docs/evidence/INDEX.md).
