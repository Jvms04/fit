# Evidence index

This index tracks evidence intake only. It does not promote canonical VAL status or make a gate decision.

| Scope | Operational state | Immediate VALs / checkpoints | Evidence fields | Blockers | Date | Branch / commit | Human gate |
|---|---|---|---|---|---|---|---|
| G0 | Active | WP-001 evidence prepared; WP-002 probes not executed; no canonical status promoted | [WP-001 package](WP-001.md), environment, local/remote observations, reviews | external readiness inputs for WP-002 remain unavailable | 2026-09-08 | `wp-001-governance`; draft PR [#1](https://github.com/Jvms04/fit/pull/1) | pending human review |
| WP-001 | In Review | `VAL-025` operational label `Prepared`; canonical execution pending and no outcome/checkpoint promoted | [commands, inventory, review and CI evidence](WP-001.md) | no implementation blocker; acceptance is a human gate | 2026-09-08 | local `fc4bd54`; remote `d5af131`; draft PR [#1](https://github.com/Jvms04/fit/pull/1) | pending human review |
| WP-002 | Blocked | `VAL-001/003/004/006/011` and `VAL-016@P0` not executed; no canonical status promoted | protocols and external environments/devices/accounts still required | Android SDK/ADB + device; macOS/Xcode/provisioning + iPhone; Docker/Testcontainers; Supabase São Paulo; GCP billing; two synthetic accounts; registry access | 2026-09-08 | no branch or commit | pending prerequisite confirmation and human fallback decisions |

Any partial evidence is recorded with its limitations and leaves the canonical VAL outcome unchanged.
