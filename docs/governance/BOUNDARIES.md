# Repository boundaries and birth ownership

This document reproduces the planned logical repository structure and WBS birth ownership from `IMPLEMENTATION_WORK_BREAKDOWN.md` §§2–3. It does not authorize implementation beyond the approved work package.

`WP-001` creates only `docs/` and `tooling/`, plus root and GitHub governance files. No application, service, domain, database, migration, infrastructure, UI, or Figma artifact is created by this work package.

## Planned logical structure

- `apps/mobile/`: `src/presentation/` (navigation, composition, accessibility), `src/bootstrap/` (adapter composition, lifecycle, feature activation; no domain rule), and `src/infrastructure/` (SQLite/SQLCipher, secure storage, notifications, filesystem, network, and device adapters).
- `services/api/`: `src/application/` (Fit protocol authorization and handlers), `src/modules/` (Fit session, sync, conflicts, account/deletion, jobs), and `src/infrastructure/` (PostgreSQL, Supavisor, GCS authority, Auth adapter, OTel).
- `packages/domain/`: `kernel/` (only approved transversal concepts) plus `access`, `profile-goals`, `planning`, `medications`, `inventory`, `nutrition`, `meal-plan`, `water`, `weight`, `workouts`, `feedback`, `imports`, `exports`, and `integrity`.
- `packages/application/`: use cases, ports, and read models.
- `packages/contracts/`: `commands/`, `sync/`, `http/`, `export/`, and `templates/`; versioned cross-runtime contracts with no duplicated rule.
- `packages/schemas/`: canonical Zod source, JSON Schema/OpenAPI equivalence, and Ajv; no divergent DTO.
- `packages/temporal/`: `TimezoneRuleProvider`, canonicalization, rule-base manifest, and pure recurrence engine.
- `packages/observability/`: allowlisted catalog and redaction; no sink or SDK in the domain.
- `database/local/`: planned manifest, checkpoints, and local migrations; critical local SQL remains explicit.
- `database/remote/`: planned PostgreSQL migrations, backfills, roles, and compatibility.
- `tests/`: `contract`, `integration-local`, `integration-remote`, `model-property`, `e2e`, `native`, `fault`, `security`, `performance`, `migration`, `corpora`, and `fixtures`.
- `tooling/`: lint, typecheck, schema drift, SBOM, scans, and reproducible scripts.
- `infra/`: authorized environment and deployment descriptors only; no secret.
- `docs/`: execution ADRs, runbooks, evidence index, and release/migration notes.

## WBS birth ownership

| Area | Responsibility | Permitted | Prohibited | Central owner/review | Birth WP |
|---|---|---|---|---|---|
| `apps/mobile` | Mobile presentation and adapters | application/contracts/platform | SQL or rules in UI; cross-account access | mobile + architecture review | WP-003 |
| `services/api` | Authorization, sync, conflicts, deletion, and jobs | application/contracts/PG/GCS/Auth | trust only JWT; timestamp-based rule | backend + security | WP-004/009 |
| `packages/domain` | Pure domain invariants and transitions | nominal kernel with only approved transversal concepts | React, HTTP, DB, real clock, or network | domain + human review | WP-003 |
| `packages/application` | Orchestration and ports | domain/contracts | concrete SDK or platform | architecture | WP-003 |
| `packages/contracts` | Interoperable envelopes and versioning | IDs/schema versions | local and remote as one physical model; duplicated rule | architecture + backend/mobile | WP-003/007 |
| `packages/schemas` | Runtime validation and equivalence | Zod/JSON Schema/Ajv | parallel canonical sources; divergent DTO | contracts | WP-003 |
| `packages/temporal` | Deterministic time and recurrence | Temporal/pinned rule-base | opaque OS TZDB as authority | temporal | WP-011 |
| `packages/observability` | Allowlist, redaction, and correlation | technical types | payload, e-mail, health data, free text, or sink/SDK in domain | security | WP-003 |
| `database/local` | Custodied evolution and recovery | Drizzle+SQL/boundaries; critical SQL explicit | reset or silent destructive migration | mobile data | WP-005/007 |
| `database/remote` | Ledger, versioning, authorization, and restore | PG17/additive migrations/backfills/roles/compatibility | LWW or Data API writes to domain | backend data | WP-009 |
| `tests` | Evidence by responsibility | frozen stack | mocks as DB/PG proof | quality | WP-002/003 |
| `tooling` | Static and supply-chain gates | selected tools | secrets or informal waiver | quality + security | WP-001 |
| `infra` | Declarative environment configuration | GitHub/EAS/GCP/Supabase | credential or secret in repository | operations + human | WP-028 |
| `docs` | Contracts, decisions, evidence, and runbooks | canonical sources | baseline redefinition | central review | WP-001 |

## Frozen cross-boundaries

- There is no generic `shared` directory or package; reuse must be nominal, contract-stable, and have explicit consumers.
- Bootstrap has no domain rule.
- Domain code has no React, HTTP, database, network, or real clock dependency.
- The domain kernel accepts only approved transversal concepts.
- Application code has no UI or platform SDK dependency.
- Contracts contain no duplicated rule, and schemas contain no divergent DTO.
- Presentation does not persist facts or decide conflicts.
- Infrastructure does not decide conflicts.
- Observability has no sink or SDK in the domain.
- Critical local SQL remains explicit, and infrastructure contains no secret.
- Local and remote implementations share contracts, not physical schema.
