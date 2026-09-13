# WP-002 — Protocol matrix

This matrix is operational evidence. It does not change a baseline and does not turn partial work into canonical `PASS`.

| Protocol | Direct scope in WP-002 | Executable now | Physical Android | Physical iOS | Current state |
|---|---|---|---|---|---|
| SP-007 | initial device matrix and empirical characterization | S23 startup/PSS/warm/crash-free parcel accepted; remaining device/OS rows and query/scroll/kill/backlog evidence absent | Galaxy S23 / Android 16 line accepted for the preregistered release-harness scope; Attempt 004 prohibited | required for final matrix; unavailable | PARTIAL |
| VAL-001 | Expo 57 / RN 0.86.3 structural gate | accepted S23 startup/PSS/warm/crash-free parcel only; UI/query/scroll/kill and minimum/intermediate/current matrix remain absent | accepted parcel is not an integral VAL result | required; unavailable | PARTIAL |
| VAL-003 | SQLCipher files/key/rekey/crash/performance | locked SQLCipher configuration and readiness inspection reproduced; no functional protocol | SQLCipher 4.7.0 presence observed previously; extraction/wrong-key/rekey+crash/benchmark not executed | required; unavailable | PARTIAL |
| VAL-004 | Keychain/Keystore/SecureStore A/B, lock, backup, CSPRNG | locked SecureStore/CSPRNG/backup configuration and RNG lint reproduced; no A/B lifecycle | physical account/lock/biometry/restore protocol not executed | required; unavailable | PARTIAL |
| VAL-006 | Temporal/TZDB Node and Hermes vectors | Node 24 parcel accepted; controlled OS-oracle divergence executed locally; Hermes capture runner verifies artifact/install/runtime before comparison | human gate approved, but this executor has zero ADB devices/services; runtime remains not executed | Hermes iOS unavailable | PARTIAL |
| VAL-011 | Cloud Run ↔ PostgreSQL/Supavisor path | no Docker/Podman/PostgreSQL runner and no durable external resource authorized | not a substitute for remote path | not device-dependent | BLOCKED |
| VAL-016@P0 | P0 Auth/session/custody checkpoint | two synthetic accounts and Supabase Auth sandbox absent | device evidence cannot replace Auth/account protocol | iOS portion unavailable | INCONCLUSIVE |

`VAL-025` remains `NOT-EXECUTED`. No fallback is active. Emulator evidence, if later produced, is complementary only. `WP-002` is `Done` because every owned protocol has evidence or an explicit partial/blocked/inconclusive disposition and the reviewed PR was integrated; this does not satisfy G0-A or authorize WP-003.
